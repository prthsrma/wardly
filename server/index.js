import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import * as E from './engine.js';
import { findRoute } from '../shared/logic.js';
import { DEPARTMENTS, CLOSABLE } from '../shared/hospital.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROD = process.env.NODE_ENV === 'production' || process.argv.includes('--prod');
const PORT = Number(process.env.PORT) || 5173;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'SAMEORIGIN', 'Permissions-Policy': 'camera=(self), microphone=(self)' });
  next();
});
app.use(express.json({ limit: '50kb' }));

// Coalesce state changes into one socket ping; clients refetch what they are allowed to see (no personal data on the wire).
let pending = new Set(), timer = null;
E.onChange((scope, extra) => {
  if (extra?.called) io.emit('called', extra.called); // tokens only, never names (S3)
  if (scope === 'evacuation') io.emit('evacuation', { on: E.S.evacuation });
  pending.add(scope);
  timer ||= setTimeout(() => { io.emit('update', { scopes: [...pending] }); pending = new Set(); timer = null; }, 120);
});
E.reset();

// Simple per-IP rate limit for public writes (S2). shortcut: in-memory, per process.
const hits = new Map();
const limit = (max) => (req, res, next) => {
  const k = `${req.ip}:${req.path}`, t = Date.now();
  const arr = (hits.get(k) || []).filter((x) => t - x < 60000);
  arr.push(t); hits.set(k, arr);
  if (arr.length > max) return res.status(429).json({ error: { code: 'RATE_LIMIT', message: 'Too many requests, please wait a minute' } });
  next();
};

const send = (res, r) => (r?.error ? res.status(r.code === 'NOT_FOUND' ? 404 : r.code === 'FORBIDDEN' ? 403 : 400).json({ error: { code: r.code, message: r.error, token: r.token } }) : res.json(r));
const staffAuth = (...roles) => (req, res, next) => {
  const s = E.verifyStaff((req.get('authorization') || '').replace('Bearer ', ''));
  if (!s) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Staff login required' } });
  if (roles.length && !roles.includes(s.role)) return res.status(403).json({ error: { code: 'FORBIDDEN', message: `Role ${s.role} cannot do this` } });
  req.staff = s; next();
};
const ANY = staffAuth();
const api = express.Router();

// ---- public ----
api.get('/config', (req, res) => res.json({ departments: DEPARTMENTS.map((d) => ({ ...d, load: E.deptLoad(d.id) })), closable: CLOSABLE, closed: E.S.closed, evacuation: E.S.evacuation, settings: { capacityWarnPct: E.S.settings.capacityWarnPct } }));
api.get('/stats', (req, res) => res.json(E.publicStats()));
api.get('/board', (req, res) => res.json(E.boardSnapshot()));
api.get('/phone', (req, res) => res.json(E.phoneLog())); // demo-only phone simulator (F8.7)
api.post('/abdm/scan-share', limit(20), (req, res) => {
  const p = E.abhaLookup(req.body.abhaAddress);
  p ? res.json({ profile: p, source: 'MOCK ABDM gateway (simulated)' }) : res.status(404).json({ error: { code: 'NOT_FOUND', message: 'ABHA address not found in mock gateway' } });
});
api.post('/visits', limit(15), (req, res) => {
  const staff = E.verifyStaff((req.get('authorization') || '').replace('Bearer ', ''));
  send(res, E.register(req.body, staff && ['DESK', 'ADMIN'].includes(staff.role) ? staff : null));
});
const visitAccess = (req, res, next) => {
  const v = E.visitByToken(req.params.token);
  if (!E.verifyVisit(v, { sig: req.query.sig || req.body?.sig, age: req.query.age ?? req.body?.age })) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Token not found or details do not match' } });
  req.visit = v; next();
};
api.get('/visits/:token', visitAccess, (req, res) => res.json(E.publicVisit(req.visit)));
api.post('/visits/:token/needs', visitAccess, (req, res) => { E.updateNeeds(req.visit, req.body.needs || {}); res.json(E.publicVisit(req.visit)); });
api.post('/visits/:token/recheck', visitAccess, (req, res) => send(res, E.recheck(req.visit, req.body.signs || [])));
api.post('/visits/:token/feedback', visitAccess, (req, res) => { E.addFeedback(req.visit, req.body.score); res.json({ ok: true }); });
// Emergency / help flags: public, never blocked by registration (F7).
api.post('/alerts', limit(30), (req, res) => {
  const staff = E.verifyStaff((req.get('authorization') || '').replace('Bearer ', ''));
  send(res, E.raiseAlert(req.body || {}, staff));
});
api.get('/nav/route', (req, res) => {
  const r = findRoute(String(req.query.from), String(req.query.to), { avoidStairs: req.query.avoidStairs === '1', closed: E.S.closed, liftWaitSec: E.S.settings.liftWaitSec });
  r ? res.json({ ...r, edges: r.edges.map((e) => e.id) }) : res.status(404).json({ error: { code: 'NO_ROUTE', message: 'No route available' } });
});

// ---- staff ----
api.post('/staff/login', limit(20), (req, res) => {
  const r = E.staffLogin(String(req.body.staffId || ''), String(req.body.pin || ''));
  r ? res.json(r) : res.status(401).json({ error: { code: 'BAD_LOGIN', message: 'Wrong staff ID or PIN' } });
});
api.get('/staff/snapshot', ANY, (req, res) => res.json(E.staffSnapshot(req.staff)));
const QUEUE_ROLES = ['DOCTOR', 'PHARMACY', 'LAB', 'DESK', 'ADMIN'];
// Doctors/counters may only act on their own service points (desk/admin on any).
const ownsPoint = (staff, spId) => {
  const sp = E.S.sps[spId];
  if (!sp) return false;
  if (['DESK', 'ADMIN'].includes(staff.role)) return true;
  if (staff.role === 'DOCTOR') return staff.sp === spId;
  if (staff.role === 'PHARMACY') return sp.type === 'PHARMACY';
  if (staff.role === 'LAB') return ['LAB', 'XRAY'].includes(sp.type);
  return false;
};
const spGuard = (req, res, next) => (ownsPoint(req.staff, req.params.id) ? next() : res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not your service point' } }));
const entryGuard = (req, res, next) => {
  const e = E.S.entries.find((x) => x.id === req.params.id);
  if (!e) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown queue entry' } });
  ownsPoint(req.staff, e.spId) ? next() : res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not your service point' } });
};
api.post('/sp/:id/call-next', staffAuth(...QUEUE_ROLES), spGuard, (req, res) => send(res, E.callNext(req.params.id, req.staff)));
api.post('/sp/:id/status', staffAuth('DOCTOR', 'ADMIN', 'PHARMACY', 'LAB'), spGuard, (req, res) => send(res, E.setSpStatus(req.params.id, req.body.status, req.body.breakUntil, req.staff)));
api.post('/sp/:id/transfer', staffAuth('DESK', 'ADMIN'), (req, res) => send(res, E.transferQueue(req.params.id, req.body.toId, req.staff)));
api.post('/entries/:id/start', staffAuth(...QUEUE_ROLES), entryGuard, (req, res) => send(res, E.startEntry(req.params.id)));
api.post('/entries/:id/skip', staffAuth(...QUEUE_ROLES), entryGuard, (req, res) => send(res, E.skipEntry(req.params.id, req.staff)));
api.post('/entries/:id/recall', staffAuth(...QUEUE_ROLES), entryGuard, (req, res) => send(res, E.recallEntry(req.params.id, req.staff)));
api.post('/entries/:id/done', staffAuth(...QUEUE_ROLES), entryGuard, (req, res) => send(res, E.doneEntry(req.params.id, req.staff.role === 'DOCTOR' || req.staff.role === 'ADMIN' ? req.body.nextSteps : [], req.staff)));
api.post('/visits/:token/reissue', staffAuth('DESK', 'ADMIN'), (req, res) => send(res, E.reissue(String(req.params.token).toUpperCase(), req.staff)));
api.get('/staff/lookup/:token', staffAuth('DESK', 'ADMIN'), (req, res) => { const v = E.visitByToken(req.params.token); v ? res.json(E.publicVisit(v)) : res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown token' } }); });
api.post('/orders/:id/prepared', staffAuth('PHARMACY', 'LAB', 'ADMIN'), (req, res) => send(res, E.markOrder(req.params.id, 'preparedAt', req.staff)));
api.post('/alerts/:id/ack', ANY, (req, res) => send(res, E.ackAlert(req.params.id, req.staff)));
api.post('/alerts/:id/colour', staffAuth('NURSE', 'DOCTOR'), (req, res) => send(res, E.colourAlert(req.params.id, req.body.colour, req.staff)));
api.post('/alerts/:id/resolve', ANY, (req, res) => send(res, E.resolveAlert(req.params.id, req.staff)));
api.post('/admin/closures/:id', staffAuth('ADMIN'), (req, res) => send(res, E.toggleClosure(req.params.id, req.staff)));
api.post('/admin/evacuation', staffAuth('ADMIN'), (req, res) => send(res, E.setEvacuation(req.body.on, req.staff)));
api.patch('/admin/settings', staffAuth('ADMIN'), (req, res) => send(res, E.updateSettings(req.body || {}, req.staff)));
api.post('/admin/sim', staffAuth('ADMIN'), (req, res) => send(res, E.setSim(req.body.on)));
api.post('/admin/reset', staffAuth('ADMIN'), (req, res) => { E.setSim(false); E.reset(); res.json({ ok: true }); });
api.get('/reports/daily', staffAuth('ADMIN'), (req, res) => {
  const r = E.dailyReport();
  if (req.query.format === 'csv') return res.type('text/csv').attachment(`wardly-report-${r.date}.csv`).send(E.reportCsv(r));
  res.json(r);
});

app.use('/api', api);
app.use('/api', (req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No such endpoint' } }));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: { code: 'SERVER', message: 'Something went wrong' } }); });

// Background jobs: escalation ladder (5 s), queue sampling for bottlenecks (60 s). node-cron not needed for this.
setInterval(E.escalate, 5000);
setInterval(E.sampleQueues, 60000);

if (PROD) {
  app.use(express.static(path.join(root, 'dist'), { index: false }));
  app.get('*', (req, res) => res.sendFile(path.join(root, 'dist', 'index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ root, server: { middlewareMode: true, hmr: { server } }, appType: 'spa' });
  app.use(vite.middlewares);
}

server.listen(PORT, () => console.log(`Wardly running on http://localhost:${PORT} (${PROD ? 'production' : 'dev'})`));
