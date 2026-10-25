// Wardly queue / visit / alert engine. In-memory state (single Node process).
// shortcut: no Postgres yet — state lives in memory and resets on restart (doubles as the 30-day purge, S3); add Prisma + Postgres for a real pilot.
import crypto from 'node:crypto';
import { DEPARTMENTS, SERVICE_POINTS, DEFAULT_SETTINGS, ABHA_PROFILES, WAIT_ZONES, TRIAGE, STAFF } from '../shared/hospital.js';
import { findRoute, estimateRange, projectOrder, laneCycle, spById, deptById, placeWithFloor, nodeById } from '../shared/logic.js';
import { t } from '../shared/i18n.js';

const SECRET = process.env.WARDLY_SECRET || crypto.randomBytes(32).toString('hex');
const DONE_STATES = ['DONE', 'CANCELLED', 'TRANSFERRED'];
const TRIAGE_RANK = { RED: 3, YELLOW: 2, GREEN: 1 };
const PRIORITY_NEEDS = ['wheelchair', 'avoidStairs', 'lowVision', 'hearing', 'needsHelper', 'pregnant'];

export let S; // state
let changed = () => {};
export const onChange = (fn) => { changed = fn; };
const now = () => Date.now();
const hhmm = (ms) => new Date(ms).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
const uid = () => crypto.randomUUID().slice(0, 8);

export function reset({ simulate = true } = {}) {
  S = {
    settings: structuredClone(DEFAULT_SETTINGS),
    caps: Object.fromEntries(DEPARTMENTS.map((d) => [d.id, d.cap])),
    sps: Object.fromEntries(SERVICE_POINTS.map((s) => [s.id, { ...s, status: s.closed ? 'CLOSED' : 'AVAILABLE', breakUntil: null, cyclePos: 0 }])),
    visits: {}, byToken: {}, entries: [], orders: [], alerts: [], notifications: [], events: [], audit: [], feedback: [],
    closed: [], evacuation: false, counters: {}, seq: 0, samples: {}, sysAlerts: [], sim: false, startedAt: now(),
  };
  if (simulate) simulateMorning();
  changed('all');
}

// ---------- helpers ----------
export const sign = (s) => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');
const log = (type, payload = {}, visitId) => S.events.push({ id: uid(), type, visitId, payload, at: now() });
export const audit = (staff, action, target, before, after) => S.audit.unshift({ id: uid(), staff: staff?.id || 'system', staffName: staff?.name, action, target, before, after, at: now() });

const isPriority = (p, needs) => p.age >= 60 || PRIORITY_NEEDS.some((k) => needs?.[k]);
const visitOf = (e) => S.visits[e.visitId];
const waitingAt = (spId) => S.entries.filter((e) => e.spId === spId && e.status === 'WAITING');
export const orderAt = (spId) => projectOrder(waitingAt(spId), S.settings.priorityRatio, S.sps[spId].cyclePos);

// Average minutes per patient from the last 20 completions at this counter (seed value until there is data).
export function serviceStats(spId) {
  const done = S.entries.filter((e) => e.spId === spId && e.status === 'DONE' && e.startedAt && e.doneAt).slice(-20);
  if (!done.length) return { avg: S.sps[spId].avg, samples: 0 };
  return { avg: done.reduce((s, e) => s + (e.doneAt - e.startedAt) / 60000, 0) / done.length, samples: done.length };
}
export const avgService = (spId) => serviceStats(spId).avg;
const breakLeftMin = (sp) => (sp.breakUntil && sp.breakUntil > now() ? (sp.breakUntil - now()) / 60000 : 0);

export function estimateFor(entry) {
  const sp = S.sps[entry.spId];
  const order = orderAt(entry.spId);
  const ahead = Math.max(0, order.findIndex((e) => e.id === entry.id));
  const st = serviceStats(entry.spId);
  const r = estimateRange(st.avg, ahead, breakLeftMin(sp), S.settings.rangeFactor);
  // Expected clock time of the turn: now + the (rounded-up) range; "next" means within about one consultation.
  const turnFrom = now() + r.low * 60000;
  const turnTo = r.next ? now() + Math.max(5, Math.ceil(st.avg)) * 60000 : now() + r.high * 60000;
  return { ahead, ...r, avgMin: +st.avg.toFixed(1), samples: st.samples, turnFrom, turnTo };
}
export function spEstimateNew(spId) {
  const sp = S.sps[spId];
  return avgService(spId) * waitingAt(spId).length + breakLeftMin(sp);
}
const activeEntry = (visit) => [...S.entries].reverse().find((e) => e.visitId === visit.id && !DONE_STATES.includes(e.status));

function pickPoint(type, dept) {
  const pts = Object.values(S.sps).filter((s) => s.type === type && (!dept || s.dept === dept) && !['ABSENT', 'CLOSED'].includes(s.status));
  if (!pts.length) return Object.values(S.sps).find((s) => s.type === type && (!dept || s.dept === dept));
  return pts.sort((a, b) => spEstimateNew(a.id) - spEstimateNew(b.id))[0]; // load balancing (F4.5)
}

function addEntry(visit, spId, extra = {}) {
  const lane = isPriority(visit.patient, visit.needs) ? 'PRIORITY' : 'NORMAL';
  const e = { id: uid(), visitId: visit.id, spId, lane, status: 'WAITING', seq: ++S.seq, joinedAt: now(), misses: 0, ...extra };
  S.entries.push(e);
  e.expectedMin = Math.max(10, estimateFor(e).high);
  log('QUEUE_JOIN', { spId, lane, type: S.sps[spId].type }, visit.id);
  return e;
}

// ---------- notifications (F8.6): one dispatcher, fan-out to simulated channels ----------
export function notify(visit, key, vars = {}, { board = false, ivr = false } = {}) {
  const lang = visit.patient.lang;
  const text = t(lang, `tpl_${key}`, { token: visit.token, ...vars });
  const to = visit.patient.phone || visit.helperPhone;
  const chans = ['PUSH', ...(to ? ['SMS'] : []), ...(ivr && to ? ['IVR'] : []), ...(board ? ['BOARD'] : [])];
  for (const channel of chans) S.notifications.unshift({ id: uid(), visitId: visit.id, token: visit.token, channel, lang, to: channel === 'SMS' || channel === 'IVR' ? to : null, text, at: now() });
  S.notifications.length = Math.min(S.notifications.length, 300);
}

function checkAheadAlerts(spId) {
  const order = orderAt(spId);
  const e = order[S.settings.alertAhead];
  if (e && !e.alerted) {
    e.alerted = true;
    const v = visitOf(e);
    notify(v, 'ahead', { n: S.settings.alertAhead, place: placeWithFloor(v.patient.lang, S.sps[spId].nodeId) });
  }
}

// ---------- registration (F1) ----------
const LANGS = ['en', 'hi', 'ur', 'doi', 'ks'];
const GENDERS = ['M', 'F', 'O'];
export function validatePatient(b) {
  const p = b.patient || {};
  const name = String(p.name || '').trim().slice(0, 60);
  const age = Number(p.age);
  const phone = String(p.phone || '').replace(/\D/g, '');
  const helperPhone = String(b.helperPhone || '').replace(/\D/g, '');
  if (!name) return { error: 'Name is required' };
  if (!Number.isInteger(age) || age < 0 || age > 120) return { error: 'Age must be 0–120' };
  if (!GENDERS.includes(p.gender)) return { error: 'Invalid gender' };
  if (!LANGS.includes(p.lang)) return { error: 'Invalid language' };
  if ((phone && phone.length !== 10) || (helperPhone && helperPhone.length !== 10)) return { error: 'Phone must be 10 digits' };
  if (!deptById[b.departmentId]) return { error: 'Unknown department' };
  if (!['ABHA', 'SELF', 'ASSISTED'].includes(b.door)) return { error: 'Invalid door' };
  const needs = Object.fromEntries(['avoidStairs', 'wheelchair', 'lowVision', 'hearing', 'needsHelper', 'largeText', 'pregnant'].map((k) => [k, !!b.needs?.[k]]));
  return { patient: { name, age, gender: p.gender, lang: p.lang, phone }, helperPhone, needs, deptId: b.departmentId, door: b.door, abha: p.abha || null };
}

export function deptLoad(deptId) {
  const today = Object.values(S.visits).filter((v) => v.deptId === deptId && v.status !== 'TOMORROW').length;
  const cap = S.caps[deptId];
  return { today, cap, pct: Math.round((today / cap) * 100), warn: today >= cap * (S.settings.capacityWarnPct / 100), full: today >= cap };
}

export function register(input, staff) {
  const v0 = validatePatient(input);
  if (v0.error) return { error: v0.error, code: 'VALIDATION' };
  const { patient, helperPhone, needs, deptId, door } = v0;
  // Anti-tout duplicate guard (S2): one active token per name+age+phone per department per day.
  const dup = Object.values(S.visits).find((v) => v.deptId === deptId && !['COMPLETED'].includes(v.status) &&
    v.patient.name.toLowerCase() === patient.name.toLowerCase() && v.patient.age === patient.age && v.patient.phone === patient.phone);
  if (dup) return { error: 'duplicate', code: 'DUPLICATE', token: dup.token };
  const load = deptLoad(deptId);
  const dept = deptById[deptId];
  S.counters[dept.letter] = (S.counters[dept.letter] || 0) + 1;
  const token = `${dept.letter}-${String(S.counters[dept.letter]).padStart(3, '0')}`;
  const visit = { id: uid(), token, patient, helperPhone, needs, deptId, door, status: 'ACTIVE', createdAt: now(), plan: [], recheckPending: false, staffId: staff?.id || null, abha: v0.abha };
  if (load.full || input.nextDay) {
    // Next-day arrival window (F8.4): spread by token number in 20-minute slots from 09:00.
    const slot = (S.counters[dept.letter] % 12);
    const from = new Date(); from.setDate(from.getDate() + 1); from.setHours(9, slot * 20, 0, 0);
    visit.status = 'TOMORROW';
    visit.arrivalWindow = { from: from.getTime(), to: from.getTime() + 30 * 60000 };
  }
  visit.sig = sign(`${visit.id}.${token}`);
  S.visits[visit.id] = visit;
  S.byToken[token] = visit.id;
  log('REGISTERED', { door, deptId, assisted: !!staff }, visit.id);
  if (staff) audit(staff, 'ASSISTED_REGISTRATION', token);
  if (visit.status === 'TOMORROW') {
    notify(visit, 'tomorrow', { from: hhmm(visit.arrivalWindow.from), to: hhmm(visit.arrivalWindow.to) });
  } else {
    const sp = pickPoint('DOCTOR', deptId);
    const e = addEntry(visit, sp.id);
    const est = estimateFor(e);
    notify(visit, 'registered', { dept: dept.names[patient.lang], place: placeWithFloor(patient.lang, sp.nodeId), range: est.next ? '0' : `${est.low}–${est.high}`, turn: `${hhmm(est.turnFrom)}–${hhmm(est.turnTo)}` });
    checkAheadAlerts(sp.id);
  }
  changed('queues');
  return { visit: publicVisit(visit) };
}

export const verifyVisit = (visit, { sig, age }) => !!visit && ((sig && sig === visit.sig) || (age !== undefined && Number(age) === visit.patient.age));

// What the patient's own phone sees (no other patient's data).
export function publicVisit(v) {
  const e = activeEntry(v);
  const sp = e && S.sps[e.spId];
  const est = e && e.status === 'WAITING' ? estimateFor(e) : null;
  const history = S.entries.filter((x) => x.visitId === v.id).map((x) => ({ type: S.sps[x.spId].type, status: x.status, label: S.sps[x.spId].label, nodeId: S.sps[x.spId].nodeId, doneAt: x.doneAt }));
  return {
    id: v.id, token: v.token, sig: v.sig, status: v.status, deptId: v.deptId, lang: v.patient.lang, name: v.patient.name, age: v.patient.age,
    needs: v.needs, arrivalWindow: v.arrivalWindow, recheckPending: v.recheckPending, plan: v.plan.map((p) => p.type), feedback: v.feedback || null,
    current: e ? {
      entryId: e.id, status: e.status, type: sp.type, spLabel: sp.type === 'DOCTOR' ? sp.label : null, nodeId: sp.nodeId, floor: nodeById[sp.nodeId].floor,
      spStatus: sp.status, breakUntil: sp.breakUntil, est, lane: e.lane, missedAt: e.missedAt || null,
      waitAnywhere: est && !est.next && est.low >= S.settings.waitAnywhereMin, calledAt: e.calledAt || null,
    } : null,
    history, evacuation: S.evacuation, updatedAt: now(),
  };
}

// ---------- queue actions (F4, F8) ----------
export function callNext(spId, staff) {
  const sp = S.sps[spId];
  const order = orderAt(spId);
  const e = order[0];
  if (!e) return { error: 'Queue is empty', code: 'EMPTY' };
  e.status = 'CALLED'; e.calledAt = now(); e.forceFront = false;
  sp.cyclePos = (sp.cyclePos + 1) % laneCycle(S.settings.priorityRatio).length;
  const v = visitOf(e);
  log('CALLED', { spId, waitMin: (e.calledAt - e.joinedAt) / 60000, type: sp.type }, v.id);
  notify(v, 'called', { place: placeWithFloor(v.patient.lang, sp.nodeId) }, { board: true, ivr: true });
  S.lastCalls = [{ token: v.token, lang: v.patient.lang, nodeId: sp.nodeId, spId, at: now(), hearing: !!v.needs.hearing }, ...(S.lastCalls || [])].slice(0, 10);
  checkAheadAlerts(spId);
  changed('queues', { called: S.lastCalls[0] });
  return { entry: e };
}

const findEntry = (id) => S.entries.find((e) => e.id === id);

export function startEntry(id) {
  const e = findEntry(id);
  if (!e || !['CALLED', 'WAITING'].includes(e.status)) return { error: 'Not callable', code: 'STATE' };
  e.status = 'IN_SERVICE'; e.startedAt = now(); e.calledAt ||= now();
  log('STARTED', { spId: e.spId }, e.visitId);
  changed('queues');
  return { entry: e };
}

export function skipEntry(id, staff) {
  const e = findEntry(id);
  if (!e || !['CALLED', 'WAITING'].includes(e.status)) return { error: 'Not skippable', code: 'STATE' };
  e.status = 'MISSED'; e.missedAt = now(); e.misses = (e.misses || 0) + 1;
  const v = visitOf(e);
  if (e.misses >= 2) { v.status = 'REISSUE'; audit(staff, 'TOKEN_NEEDS_REISSUE', v.token); }
  log('MISSED', { spId: e.spId }, v.id);
  notify(v, 'missed');
  changed('queues');
  return { entry: e };
}

export function recallEntry(id, staff) {
  const e = findEntry(id);
  if (!e || e.status !== 'MISSED') return { error: 'Not missed', code: 'STATE' };
  const v = visitOf(e);
  if (e.misses >= 2 || now() - e.missedAt > S.settings.recallWindowMin * 60000) {
    v.status = 'REISSUE';
    changed('queues');
    return { error: 'Recall window over or missed twice — desk must reissue', code: 'REISSUE' };
  }
  e.status = 'WAITING'; e.forceFront = true; // back at position 2 (F4.7)
  log('RECALLED', { spId: e.spId }, v.id);
  audit(staff, 'RECALL', v.token);
  changed('queues');
  return { entry: e };
}

export function reissue(token, staff) {
  const v = S.visits[S.byToken[token]];
  if (!v) return { error: 'Unknown token', code: 'NOT_FOUND' };
  const before = v.status;
  const last = [...S.entries].reverse().find((e) => e.visitId === v.id);
  if (last && last.status === 'MISSED') last.status = 'CANCELLED';
  v.status = 'ACTIVE';
  addEntry(v, last ? last.spId : pickPoint('DOCTOR', v.deptId).id);
  audit(staff, 'REISSUE', token, { status: before }, { status: 'ACTIVE' });
  changed('queues');
  return { visit: publicVisit(v) };
}

const STEP_TYPES = { LAB: 'LAB', XRAY: 'XRAY', PHARMACY: 'PHARMACY', BILLING: 'BILLING', RETURN: 'DOCTOR' };

function advance(visit, fromNodeId) {
  const step = visit.plan.shift();
  if (!step) {
    visit.status = 'COMPLETED'; visit.completedAt = now();
    log('COMPLETED', {}, visit.id);
    return;
  }
  const sp = step.type === 'RETURN' ? S.sps[step.spId] : pickPoint(STEP_TYPES[step.type]);
  const e = addEntry(visit, sp.id, step.type === 'RETURN' ? { forceFront: true } : {});
  visit.recheckPending = S.settings.recheckDangerSigns;
  const order = S.orders.find((o) => o.visitId === visit.id && o.type === step.type && !o.entryId);
  if (order) { order.entryId = e.id; order.spId = sp.id; const r = findRoute(fromNodeId, sp.nodeId, { avoidStairs: visit.needs.avoidStairs || visit.needs.wheelchair, closed: S.closed }); order.etaAt = now() + (r ? r.etaMin : 5) * 60000; }
  const est = estimateFor(e);
  notify(visit, 'handoff', { stage: t(visit.patient.lang, `stage_${sp.type}`), place: placeWithFloor(visit.patient.lang, sp.nodeId), n: est.ahead });
  checkAheadAlerts(sp.id);
}

// Doctor "Done + next steps" (F4.2) / counter "Done".
export function doneEntry(id, nextSteps = [], staff) {
  const e = findEntry(id);
  if (!e || !['CALLED', 'IN_SERVICE'].includes(e.status)) return { error: 'Not in service', code: 'STATE' };
  e.startedAt ||= e.calledAt || now();
  e.status = 'DONE'; e.doneAt = now();
  const sp = S.sps[e.spId];
  const v = visitOf(e);
  log('DONE', { spId: e.spId, type: sp.type, serviceMin: (e.doneAt - e.startedAt) / 60000 }, v.id);
  const steps = (nextSteps || []).filter((s) => STEP_TYPES[s.type]);
  for (const s of steps) {
    if (['LAB', 'XRAY', 'PHARMACY'].includes(s.type)) {
      // Pre-staging (F4.3): the counter sees the order before the patient walks over.
      S.orders.push({ id: uid(), visitId: v.id, token: v.token, type: s.type, items: (s.items || []).slice(0, 10).map(String), createdBy: staff?.name || sp.label, createdAt: now(), preparedAt: null, collectedAt: null });
    }
    v.plan.push({ type: s.type, spId: s.type === 'RETURN' ? e.spId : undefined });
  }
  const order = S.orders.find((o) => o.entryId === e.id);
  if (order && !order.collectedAt) order.collectedAt = now();
  advance(v, sp.nodeId);
  changed('queues');
  return { visit: publicVisit(v) };
}

export function setSpStatus(spId, status, breakUntil, staff) {
  const sp = S.sps[spId];
  if (!sp || !['AVAILABLE', 'BREAK', 'ROUND', 'ABSENT', 'CLOSED'].includes(status)) return { error: 'Bad status', code: 'VALIDATION' };
  const before = { status: sp.status, breakUntil: sp.breakUntil };
  sp.status = status;
  sp.breakUntil = status === 'BREAK' || status === 'ROUND' ? Number(breakUntil) || now() + 15 * 60000 : null;
  audit(staff, 'SP_STATUS', spId, before, { status, breakUntil: sp.breakUntil });
  log('SP_STATUS', { spId, status });
  if (status === 'BREAK') {
    const time = hhmm(sp.breakUntil);
    for (const e of waitingAt(spId)) { const est = estimateFor(e); notify(visitOf(e), 'break', { time, range: `${est.low}–${est.high}` }); }
  }
  changed('queues');
  return { sp };
}

export function transferQueue(fromId, toId, staff) {
  const to = S.sps[toId];
  if (!S.sps[fromId] || !to || fromId === toId) return { error: 'Bad transfer', code: 'VALIDATION' };
  const moving = waitingAt(fromId);
  for (const e of moving) {
    e.status = 'TRANSFERRED';
    const v = visitOf(e);
    const ne = addEntry(v, toId);
    ne.seq = e.seq; // keep original arrival order
    notify(v, 'moved', { place: placeWithFloor(v.patient.lang, to.nodeId) });
  }
  audit(staff, 'QUEUE_TRANSFER', `${fromId}→${toId}`, null, { count: moving.length });
  changed('queues');
  return { moved: moving.length };
}

export function markOrder(id, field, staff) {
  const o = S.orders.find((x) => x.id === id);
  if (!o) return { error: 'Unknown order', code: 'NOT_FOUND' };
  o[field] = now();
  if (field === 'preparedAt') { o.preparedBy = staff?.name; log('ORDER_PREPARED', { type: o.type }, o.visitId); }
  changed('orders');
  return { order: o };
}

// ---------- emergency + help flags (F7, added "I need urgent help") ----------
// Software never sets priority or colour: it only raises the alarm. Only staff assess.
export function raiseAlert({ kind = 'EMERGENCY', token, signs = [], nodeId, source = 'PHONE', note = '' }, staff) {
  if (!['EMERGENCY', 'HELP', 'KIOSK_HELP', 'NO_ROUTE'].includes(kind)) return { error: 'Bad kind', code: 'VALIDATION' };
  const v = token && S.visits[S.byToken[token]];
  const ve = v && activeEntry(v);
  const a = {
    id: uid(), kind, source: staff ? 'STAFF' : source, signs: signs.filter((s) => typeof s === 'string').slice(0, 10), nodeId: nodeById[nodeId] ? nodeId : (ve ? S.sps[ve.spId].nodeId : null),
    token: v?.token || null, lang: v?.patient.lang || null, needs: v?.needs || null, note: String(note).slice(0, 140), raisedBy: staff?.name || null,
    status: 'RAISED', raisedAt: now(), ackAt: null, ackBy: null, colour: null, colourAt: null, escalationLevel: 0, resolvedAt: null,
  };
  S.alerts.unshift(a);
  log('ALERT_RAISED', { kind, source: a.source, signs: a.signs }, v?.id);
  changed('alerts');
  return { alert: { id: a.id, status: a.status, raisedAt: a.raisedAt } };
}

export function ackAlert(id, staff) {
  const a = S.alerts.find((x) => x.id === id);
  if (!a) return { error: 'Unknown alert', code: 'NOT_FOUND' };
  if (a.kind === 'EMERGENCY' && !['NURSE', 'DOCTOR'].includes(staff.role)) return { error: 'Only nurse or doctor can acknowledge emergencies', code: 'FORBIDDEN' };
  if (a.ackAt) return { alert: a };
  a.status = 'ACKNOWLEDGED'; a.ackAt = now(); a.ackBy = staff.name;
  log('ALERT_ACK', { kind: a.kind, ackSec: (a.ackAt - a.raisedAt) / 1000 });
  audit(staff, 'ALERT_ACK', a.id);
  changed('alerts');
  return { alert: a };
}

export function colourAlert(id, colour, staff) {
  const a = S.alerts.find((x) => x.id === id);
  if (!a) return { error: 'Unknown alert', code: 'NOT_FOUND' };
  if (!['NURSE', 'DOCTOR'].includes(staff?.role)) return { error: 'Only nurse or doctor can set triage colour', code: 'FORBIDDEN' };
  if (!TRIAGE[colour]) return { error: 'Bad colour', code: 'VALIDATION' };
  const before = a.colour;
  if (!a.ackAt) { a.ackAt = now(); a.ackBy = staff.name; a.status = 'ACKNOWLEDGED'; }
  a.colour = colour; a.colourAt = now(); a.colourBy = staff.name;
  audit(staff, before && TRIAGE_RANK[colour] < TRIAGE_RANK[before] ? 'TRIAGE_DOWNGRADE' : 'TRIAGE_COLOUR', a.id, { colour: before }, { colour });
  changed('alerts');
  return { alert: a };
}

export function resolveAlert(id, staff) {
  const a = S.alerts.find((x) => x.id === id);
  if (!a) return { error: 'Unknown alert', code: 'NOT_FOUND' };
  if (a.kind === 'EMERGENCY' && !['NURSE', 'DOCTOR'].includes(staff.role)) return { error: 'Only nurse or doctor can resolve emergencies', code: 'FORBIDDEN' };
  a.ackAt ||= now(); a.ackBy ||= staff.name;
  a.status = 'RESOLVED'; a.resolvedAt = now();
  audit(staff, 'ALERT_RESOLVE', a.id);
  changed('alerts');
  return { alert: a };
}

// Escalation ladder (S1): unacknowledged → second nurse → ED in-charge.
export function escalate() {
  let any = false;
  for (const a of S.alerts) {
    if (a.kind !== 'EMERGENCY' || a.ackAt || a.escalationLevel >= 2) continue;
    const level = Math.floor((now() - a.raisedAt) / (S.settings.escalateSec * 1000));
    if (level > a.escalationLevel) {
      a.escalationLevel = Math.min(2, level); a.status = 'ESCALATED'; any = true;
      log('ALERT_ESCALATED', { level: a.escalationLevel });
      audit(null, 'ALERT_ESCALATED', a.id, null, { level: a.escalationLevel, to: a.escalationLevel === 1 ? 'Second nurse' : 'ED in-charge' });
    }
  }
  if (any) changed('alerts');
}

// ---------- needs, feel-worse, recheck, feedback ----------
export function updateNeeds(visit, needs) {
  for (const k of Object.keys(visit.needs)) if (k in needs) visit.needs[k] = !!needs[k];
  log('NEEDS_UPDATED', visit.needs, visit.id);
  changed('queues');
}
export function recheck(visit, signs = []) {
  visit.recheckPending = false;
  if (signs.length) return raiseAlert({ kind: 'EMERGENCY', token: visit.token, signs, source: 'FEEL_WORSE' });
  changed('queues');
  return { ok: true };
}

// ---------- navigation closures + evacuation (F5.7, S5) ----------
export function toggleClosure(id, staff) {
  const was = S.closed.includes(id);
  S.closed = was ? S.closed.filter((x) => x !== id) : [...S.closed, id];
  audit(staff, was ? 'REOPEN' : 'CLOSE', id);
  log('CLOSURE', { id, closed: !was });
  // Wheelchair users with no step-free route get "ask staff", and the desk is told.
  if (!was) {
    for (const v of Object.values(S.visits)) {
      const e = activeEntry(v);
      if (!e || v.status !== 'ACTIVE' || !(v.needs.wheelchair || v.needs.avoidStairs)) continue;
      if (!findRoute('G_ENT', S.sps[e.spId].nodeId, { avoidStairs: true, closed: S.closed })) {
        raiseAlert({ kind: 'NO_ROUTE', token: v.token, note: `No step-free route to ${S.sps[e.spId].label} — send a helper` });
      }
    }
  }
  changed('nav');
  return { closed: S.closed };
}

export function setEvacuation(on, staff) {
  S.evacuation = !!on;
  audit(staff, 'EVACUATION', on ? 'ON' : 'OFF');
  if (on) for (const v of Object.values(S.visits)) if (v.status === 'ACTIVE') notify(v, 'evac', {}, { board: false });
  changed('evacuation');
  return { evacuation: S.evacuation };
}

export function updateSettings(patch, staff) {
  const before = structuredClone(S.settings);
  const num = (v, lo, hi) => Number.isFinite(+v) && +v >= lo && +v <= hi;
  if (patch.priorityRatio && num(patch.priorityRatio.priority, 1, 5) && num(patch.priorityRatio.normal, 0, 10)) {
    S.settings.priorityRatio = { priority: +patch.priorityRatio.priority, normal: +patch.priorityRatio.normal };
    for (const sp of Object.values(S.sps)) sp.cyclePos = 0;
  }
  for (const [k, lo, hi] of [['escalateSec', 15, 600], ['alertAhead', 1, 10], ['crowdingPct', 30, 100], ['capacityWarnPct', 50, 100], ['welfareFactor', 1, 5], ['recallWindowMin', 5, 60], ['rangeFactor', 1, 2]]) {
    if (k in patch && num(patch[k], lo, hi)) S.settings[k] = +patch[k];
  }
  if ('recheckDangerSigns' in patch) S.settings.recheckDangerSigns = !!patch.recheckDangerSigns;
  if (patch.caps) for (const [d, c] of Object.entries(patch.caps)) if (S.caps[d] && num(c, 1, 1000)) S.caps[d] = +c;
  audit(staff, 'SETTINGS', 'settings', before, S.settings);
  changed('settings');
  return { settings: S.settings, caps: S.caps };
}

// ---------- monitoring: crowding, bottlenecks, welfare (S1, S5, F9) ----------
export function sampleQueues() {
  for (const id of Object.keys(S.sps)) {
    const arr = (S.samples[id] ||= []);
    arr.push(waitingAt(id).length);
    if (arr.length > 30) arr.shift();
  }
  const out = [];
  const n = S.settings.bottleneckMinutes;
  for (const [id, arr] of Object.entries(S.samples)) {
    const tail = arr.slice(-(n + 1));
    if (tail.length === n + 1 && tail.every((x, i) => i === 0 || x > tail[i - 1])) {
      const sp = S.sps[id];
      const fix = sp.type === 'PHARMACY' ? 'open Pharmacy Counter 2' : sp.type === 'DOCTOR' ? 'move some patients to another doctor in the department' : 'add a staff member at this counter';
      out.push({ spId: id, label: sp.label, msg: `${sp.label} queue rising for ${n} minutes — ${fix}` });
    }
  }
  S.sysAlerts = out;
  changed('admin');
}

export function crowding() {
  return WAIT_ZONES.map((z) => {
    const waiting = S.entries.filter((e) => z.sps.includes(e.spId) && ['WAITING', 'CALLED'].includes(e.status)).length;
    const pct = Math.round((waiting / z.seats) * 100);
    return { ...z, waiting, pct, alert: pct >= S.settings.crowdingPct };
  });
}

export function welfareList() {
  return S.entries.filter((e) => e.status === 'WAITING').map((e) => {
    const v = visitOf(e);
    const waited = (now() - e.joinedAt) / 60000;
    const vulnerable = v.patient.age >= 60 || ['wheelchair', 'needsHelper', 'lowVision', 'hearing'].some((k) => v.needs[k]);
    return vulnerable && waited > S.settings.welfareFactor * e.expectedMin ? { token: v.token, name: v.patient.name, age: v.patient.age, needs: v.needs, waitedMin: Math.round(waited), expectedMin: e.expectedMin, spLabel: S.sps[e.spId].label } : null;
  }).filter(Boolean);
}

// ---------- daily quality report (F11) ----------
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export function dailyReport() {
  const called = S.events.filter((e) => e.type === 'CALLED');
  const stages = ['REGISTRATION', 'DOCTOR', 'LAB', 'XRAY', 'PHARMACY', 'BILLING'].map((type) => {
    const w = called.filter((e) => e.payload.type === type).map((e) => e.payload.waitMin);
    return { stage: type, served: w.length, medianWaitMin: w.length ? Math.round(median(w)) : null, over60Pct: w.length ? Math.round((w.filter((x) => x > 60).length / w.length) * 100) : null };
  }).filter((s) => s.served);
  const allWaits = called.map((e) => e.payload.waitMin);
  const acks = S.events.filter((e) => e.type === 'ALERT_ACK').map((e) => e.payload.ackSec);
  return {
    hospital: 'Demo District Hospital', date: new Date().toISOString().slice(0, 10), generatedAt: now(), format: 'Formatted for NQAS / Kayakalp review',
    visits: Object.values(S.visits).filter((v) => v.status !== 'TOMORROW').length,
    completed: Object.values(S.visits).filter((v) => v.status === 'COMPLETED').length,
    stages,
    over60Pct: allWaits.length ? Math.round((allWaits.filter((x) => x > 60).length / allWaits.length) * 100) : 0,
    alerts: { raised: S.events.filter((e) => e.type === 'ALERT_RAISED').length, ackMedianSec: acks.length ? Math.round(median(acks)) : null, ackMaxSec: acks.length ? Math.round(Math.max(...acks)) : null, escalated: S.events.filter((e) => e.type === 'ALERT_ESCALATED').length },
    missedTurns: S.events.filter((e) => e.type === 'MISSED').length,
    departments: DEPARTMENTS.map((d) => ({ id: d.id, name: d.names.en, ...deptLoad(d.id) })),
    feedback: { count: S.feedback.length, avg: S.feedback.length ? +(S.feedback.reduce((s, f) => s + f.score, 0) / S.feedback.length).toFixed(1) : null },
  };
}
export function reportCsv(r) {
  const rows = [['Section', 'Item', 'Value'], ['Summary', 'Date', r.date], ['Summary', 'Visits', r.visits], ['Summary', 'Completed', r.completed], ['Summary', '% waits over 60 min', r.over60Pct],
    ...r.stages.flatMap((s) => [['Stage wait', `${s.stage} median (min)`, s.medianWaitMin], ['Stage wait', `${s.stage} served`, s.served], ['Stage wait', `${s.stage} % over 60 min`, s.over60Pct]]),
    ['Emergency', 'Alerts raised', r.alerts.raised], ['Emergency', 'Ack median (s)', r.alerts.ackMedianSec ?? ''], ['Emergency', 'Ack max (s)', r.alerts.ackMaxSec ?? ''], ['Emergency', 'Escalations', r.alerts.escalated],
    ['Queue', 'Missed turns', r.missedTurns], ...r.departments.map((d) => ['Department load', d.name, `${d.today}/${d.cap} (${d.pct}%)`])];
  return rows.map((row) => row.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
}

// ---------- staff snapshot (role-filtered, F9) ----------
function entryView(e) {
  const v = visitOf(e);
  return { id: e.id, token: v.token, name: v.patient.name, age: v.patient.age, gender: v.patient.gender, lang: v.patient.lang, needs: v.needs, lane: e.lane, status: e.status,
    joinedAt: e.joinedAt, calledAt: e.calledAt, startedAt: e.startedAt, missedAt: e.missedAt, misses: e.misses, est: e.status === 'WAITING' ? estimateFor(e) : null, spId: e.spId, visitStatus: v.status };
}
export function spView(sp) {
  const order = orderAt(sp.id);
  return { ...sp, waiting: order.length, avgMin: +avgService(sp.id).toFixed(1), estNewMin: Math.round(spEstimateNew(sp.id)),
    queue: order.map(entryView), active: S.entries.filter((e) => e.spId === sp.id && ['CALLED', 'IN_SERVICE'].includes(e.status)).map(entryView),
    missed: S.entries.filter((e) => e.spId === sp.id && e.status === 'MISSED' && now() - e.missedAt < 60 * 60000).map(entryView) };
}
export function staffSnapshot(staff) {
  const role = staff.role;
  const sps = Object.values(S.sps).map(spView);
  const open = S.alerts.filter((a) => a.status !== 'RESOLVED');
  const snap = {
    me: staff, now: now(), settings: S.settings, evacuation: S.evacuation, closed: S.closed,
    urgent: open.filter((a) => !a.ackAt), // everyone sees un-seen flags at the top (with sound)
    sps: sps.map(({ queue, active, missed, ...rest }) => (role === 'ADMIN' || role === 'DESK' || rest.id === staff.sp || (role === 'LAB' && ['LAB', 'XRAY'].includes(rest.type)) || (role === 'PHARMACY' && rest.type === 'PHARMACY') ? { ...rest, queue, active, missed } : rest)),
  };
  if (['NURSE', 'DOCTOR', 'ADMIN'].includes(role)) snap.alerts = S.alerts.slice(0, 60);
  if (['DESK', 'ADMIN'].includes(role)) { snap.welfare = welfareList(); snap.helpCalls = open.filter((a) => a.kind !== 'EMERGENCY'); snap.reissue = Object.values(S.visits).filter((v) => v.status === 'REISSUE').map((v) => ({ token: v.token, name: v.patient.name, age: v.patient.age })); }
  if (['PHARMACY', 'LAB', 'ADMIN'].includes(role)) snap.orders = S.orders.filter((o) => role === 'ADMIN' || (role === 'PHARMACY' ? o.type === 'PHARMACY' : ['LAB', 'XRAY'].includes(o.type))).slice(-40).reverse();
  if (role === 'ADMIN') {
    snap.crowding = crowding(); snap.bottlenecks = S.sysAlerts; snap.audit = S.audit.slice(0, 50); snap.caps = S.caps; snap.sim = S.sim;
    snap.loads = DEPARTMENTS.map((d) => ({ id: d.id, name: d.names.en, ...deptLoad(d.id) }));
    snap.report = dailyReport();
  }
  return snap;
}

export function publicStats() {
  const r = dailyReport();
  const waitingNow = S.entries.filter((e) => e.status === 'WAITING').length;
  const doc = r.stages.find((s) => s.stage === 'DOCTOR');
  return { visitsToday: r.visits, completed: r.completed, waitingNow, doctorMedianWait: doc?.medianWaitMin ?? null, ackMedianSec: r.alerts.ackMedianSec,
    openPoints: Object.values(S.sps).filter((s) => s.status === 'AVAILABLE').length, totalPoints: Object.keys(S.sps).length,
    departments: DEPARTMENTS.map((d) => { const l = deptLoad(d.id); const sp = pickPoint('DOCTOR', d.id); return { id: d.id, pct: l.pct, warn: l.warn, full: l.full, waiting: waitingAt(sp.id).length, estMin: Math.round(spEstimateNew(sp.id)) }; }),
    evacuation: S.evacuation, closed: S.closed };
}

export function boardSnapshot() {
  const pts = Object.values(S.sps).filter((s) => s.type !== 'REGISTRATION' && s.status !== 'CLOSED').map((sp) => {
    const order = orderAt(sp.id);
    const serving = [...S.entries].reverse().find((e) => e.spId === sp.id && ['CALLED', 'IN_SERVICE'].includes(e.status));
    return { id: sp.id, type: sp.type, dept: sp.dept, nodeId: sp.nodeId, status: sp.status, breakUntil: sp.breakUntil, serving: serving ? visitOf(serving).token : null, next: order.slice(0, 3).map((e) => visitOf(e).token) };
  });
  return { points: pts, lastCalls: S.lastCalls || [], evacuation: S.evacuation };
}

export function staffLogin(staffId, pin) {
  const s = STAFF.find((x) => x.id === staffId);
  if (!s || !crypto.timingSafeEqual(Buffer.from(sign(`pin.${pin}`)), Buffer.from(sign(`pin.${s.pin}`)))) return null;
  const body = Buffer.from(JSON.stringify({ id: s.id, name: s.name, role: s.role, sp: s.sp || null, exp: now() + 12 * 3600e3 })).toString('base64url');
  return { token: `${body}.${sign(body)}`, staff: { id: s.id, name: s.name, role: s.role, sp: s.sp || null } };
}
export function verifyStaff(tok) {
  const [body, sig] = String(tok || '').split('.');
  if (!body || sig !== sign(body)) return null;
  const s = JSON.parse(Buffer.from(body, 'base64url').toString());
  return s.exp > now() ? s : null;
}

export const abhaLookup = (abha) => ABHA_PROFILES.find((p) => p.abha === String(abha || '').trim().toLowerCase()) || null;

// ---------- simulated morning (PRD §12 "pnpm sim") ----------
function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646; }
const NAMES = ['Ramesh Kumar', 'Shabnam Bano', 'Om Prakash', 'Aisha Dar', 'Gurpreet Kaur', 'Mohd Yousuf', 'Sunita Devi', 'Bashir Ahmad', 'Kamla Rani', 'Tariq Lone', 'Pinky Sharma', 'Ghulam Nabi', 'Asha Kumari', 'Javed Mir', 'Neelam Gupta', 'Rahul Choudhary', 'Fatima Begum', 'Kuldeep Singh', 'Rekha Bhagat', 'Showkat Hussain'];

function simulateMorning() {
  const r = rng(42);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const start = now() - 3 * 3600e3;
  const realNow = Date.now;
  let clock = start;
  Date.now = () => clock; // shortcut: time-travel the engine to backfill a realistic morning; only runs at boot/reset.
  try {
    // One patient arrives every 2.4 min; counters serve as the clock moves, so waits are always >= 0.
    let arrived = 0;
    for (let m = 0; m < 170; m += 2) {
      clock = start + m * 60000;
      for (; arrived < 70 && arrived * 2.4 <= m; arrived++) {
        const dept = pick(['GEN', 'GEN', 'GEN', 'ORTHO', 'EYE', 'PAED', 'OBGYN', 'SKIN', 'ENT', 'DENT']);
        const age = Math.floor(r() * 75) + 3;
        register({ door: pick(['ABHA', 'SELF', 'SELF', 'ASSISTED']), departmentId: dept, needs: { wheelchair: r() < 0.06, avoidStairs: r() < 0.1, hearing: r() < 0.05 },
          patient: { name: `${pick(NAMES)}`, age, gender: pick(['M', 'F']), lang: pick(['hi', 'hi', 'ur', 'doi', 'ks', 'en']), phone: r() < 0.6 ? `94190${String(10000 + arrived).slice(-5)}` : '' } });
      }
      for (const sp of Object.values(S.sps)) {
        if (sp.type === 'REGISTRATION' || sp.status !== 'AVAILABLE') continue;
        const busy = S.entries.find((e) => e.spId === sp.id && ['CALLED', 'IN_SERVICE'].includes(e.status));
        if (busy) {
          if (clock - busy.calledAt >= sp.avg * 60000 * (0.6 + r() * 0.9)) {
            const steps = sp.type === 'DOCTOR' ? (r() < 0.35 ? [{ type: 'LAB', items: ['CBC'] }, { type: 'PHARMACY', items: ['Paracetamol 500'] }] : r() < 0.7 ? [{ type: 'PHARMACY', items: ['ORS', 'Cetirizine'] }] : []) : [];
            if (sp.type === 'DOCTOR' || r() < 0.9) doneEntry(busy.id, steps);
          }
          continue;
        }
        if (orderAt(sp.id).length > (sp.type === 'DOCTOR' ? 3 : 1) && r() < 0.85) { const c = callNext(sp.id); if (c.entry) startEntry(c.entry.id); }
      }
      if (m === 120) { const a = raiseAlert({ kind: 'EMERGENCY', signs: ['chest'], nodeId: 'G_REG', source: 'KIOSK' }).alert; clock += 38000; ackAlert(a.id, { role: 'NURSE', name: 'Sr. Rubina Khan' }); colourAlert(a.id, 'RED', { role: 'NURSE', name: 'Sr. Rubina Khan' }); resolveAlert(a.id, { role: 'NURSE', name: 'Sr. Rubina Khan' }); }
    }
  } finally { Date.now = realNow; }
  S.notifications = [];
  S.audit = [];
  S.alerts = S.alerts.filter((a) => a.status !== 'RESOLVED');
}

// ---------- optional live simulation (admin toggle) ----------
let simTimer = null;
export function setSim(on) {
  S.sim = !!on;
  clearInterval(simTimer);
  if (on) simTimer = setInterval(() => {
    const r = Math.random;
    const doctors = Object.values(S.sps).filter((s) => s.type === 'DOCTOR' && s.status === 'AVAILABLE');
    if (r() < 0.5) register({ door: 'SELF', departmentId: DEPARTMENTS[Math.floor(r() * 8)].id, needs: {}, patient: { name: NAMES[Math.floor(r() * NAMES.length)], age: 18 + Math.floor(r() * 60), gender: r() < 0.5 ? 'M' : 'F', lang: ['hi', 'ur', 'doi', 'ks', 'en'][Math.floor(r() * 5)], phone: '' } });
    const sp = doctors[Math.floor(r() * doctors.length)];
    if (!sp) return;
    const busy = S.entries.find((e) => e.spId === sp.id && ['CALLED', 'IN_SERVICE'].includes(e.status));
    if (busy) doneEntry(busy.id, r() < 0.5 ? [{ type: 'PHARMACY', items: ['Paracetamol'] }] : []);
    else callNext(sp.id);
  }, 6000);
  changed('admin');
  return { sim: S.sim };
}

export function addFeedback(visit, score) {
  const s = Math.max(1, Math.min(5, Number(score) || 0));
  visit.feedback = s;
  S.feedback.push({ visitId: visit.id, score: s, at: now() });
  changed('admin');
}
export const visitByToken = (tok) => S.visits[S.byToken[String(tok || '').toUpperCase()]];
export const phoneLog = () => S.notifications.filter((n) => n.channel === 'SMS' || n.channel === 'IVR').slice(0, 60);
