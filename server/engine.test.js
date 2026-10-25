import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from './engine.js';

const nurse = { id: 'nurse1', role: 'NURSE', name: 'Nurse' };
const desk = { id: 'desk1', role: 'DESK', name: 'Desk' };
const reg = (over = {}) => E.register({ door: 'SELF', departmentId: 'ORTHO', needs: {}, patient: { name: 'Test Person', age: 40, gender: 'M', lang: 'hi', phone: '' }, ...over });

test('registration works with no phone, no ABHA; duplicate guard blocks a second token', () => {
  E.reset({ simulate: false });
  const r = reg();
  assert.match(r.visit.token, /^C-\d{3}$/);
  assert.equal(reg().code, 'DUPLICATE');
});

test('expected turn time comes from recent service data and never precedes now', () => {
  E.reset({ simulate: false });
  reg({ patient: { name: 'A', age: 30, gender: 'M', lang: 'hi', phone: '' } });
  const { visit } = reg({ patient: { name: 'B', age: 31, gender: 'F', lang: 'en', phone: '' } });
  const est = E.publicVisit(E.S.visits[visit.id]).current.est;
  assert.equal(est.samples, 0, 'no completions yet → seed average');
  assert.ok(est.turnFrom >= Date.now() - 1000 && est.turnTo > est.turnFrom);
  E.reset();
  const busy = Object.values(E.S.visits).map((v) => E.publicVisit(v).current).find((c) => c?.est?.samples);
  assert.ok(busy && busy.est.avgMin > 0, 'simulated morning provides real samples');
});

test('doctor Done → Pharmacy hands off, pre-stages order and completes after collection', () => {
  E.reset({ simulate: false });
  const { visit } = reg();
  const sp = E.S.entries.find((e) => e.visitId === visit.id).spId;
  const c = E.callNext(sp);
  E.doneEntry(c.entry.id, [{ type: 'PHARMACY', items: ['ORS'] }]);
  const pv = E.publicVisit(E.S.visits[visit.id]);
  assert.equal(pv.current.type, 'PHARMACY');
  assert.equal(E.S.orders.length, 1);
  const pc = E.callNext(E.S.entries.at(-1).spId);
  E.doneEntry(pc.entry.id, []);
  assert.equal(E.S.visits[visit.id].status, 'COMPLETED');
  assert.ok(E.S.orders[0].collectedAt);
});

test('triage colour needs a nurse or doctor; downgrades are audit-logged', () => {
  E.reset({ simulate: false });
  const { alert } = E.raiseAlert({ kind: 'EMERGENCY', signs: ['chest'] });
  assert.equal(E.colourAlert(alert.id, 'RED', desk).code, 'FORBIDDEN');
  assert.equal(E.S.alerts[0].colour, null, 'software never sets colour');
  E.colourAlert(alert.id, 'RED', nurse);
  E.colourAlert(alert.id, 'GREEN', nurse);
  assert.equal(E.S.audit[0].action, 'TRIAGE_DOWNGRADE');
});

test('missed twice → desk must reissue', () => {
  E.reset({ simulate: false });
  const { visit } = reg();
  const sp = E.S.entries.at(-1).spId;
  const e = E.callNext(sp).entry;
  E.skipEntry(e.id);
  E.recallEntry(e.id);
  E.callNext(sp);
  E.skipEntry(e.id);
  assert.equal(E.S.visits[visit.id].status, 'REISSUE');
});

test('daily report matches event rows', () => {
  E.reset();
  const r = E.dailyReport();
  const called = E.S.events.filter((e) => e.type === 'CALLED').length;
  assert.equal(r.stages.reduce((s, x) => s + x.served, 0), called);
  assert.ok(r.visits > 0 && r.alerts.ackMedianSec > 0);
  assert.ok(E.S.events.filter((e) => e.type === 'CALLED').every((e) => e.payload.waitMin >= 0), 'simulated waits never negative');
});
