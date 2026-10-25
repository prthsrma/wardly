import test from 'node:test';
import assert from 'node:assert/strict';
import { findRoute, estimateRange, projectOrder, matchRoomCode, suggestDepartment, nodeById } from './logic.js';
import { NODES } from './hospital.js';

test('priority interleave follows the 1:2 ratio exactly', () => {
  const entries = [];
  for (let i = 0; i < 6; i++) entries.push({ id: `p${i}`, lane: 'PRIORITY', seq: i * 2 });
  for (let i = 0; i < 6; i++) entries.push({ id: `n${i}`, lane: 'NORMAL', seq: i * 2 + 1 });
  const lanes = projectOrder(entries, { priority: 1, normal: 2 }).map((e) => e.lane[0]).join('');
  assert.equal(lanes.slice(0, 9), 'PNNPNNPNN');
});

test('recalled token goes back at position 2', () => {
  const order = projectOrder([{ id: 'a', lane: 'NORMAL', seq: 1 }, { id: 'b', lane: 'NORMAL', seq: 2 }, { id: 'r', lane: 'NORMAL', seq: 0, forceFront: true }], { priority: 1, normal: 2 });
  assert.deepEqual(order.map((e) => e.id), ['a', 'r', 'b']);
});

test('estimates are ranges and never round down', () => {
  for (let ahead = 1; ahead < 30; ahead++) for (const avg of [2.3, 6, 7.7]) {
    const r = estimateRange(avg, ahead, 0, 1.3);
    assert.ok(r.low >= avg * ahead && r.high > r.low && r.low % 5 === 0 && r.high % 5 === 0);
  }
  assert.equal(estimateRange(6, 0).next, true);
});

// 20+ route pairs, stairs on and off (PRD F5 AC).
const rooms = NODES.filter((n) => ['ROOM', 'ENTRANCE', 'EXIT'].includes(n.kind)).map((n) => n.id);
const pairs = [];
for (let i = 0; i < rooms.length && pairs.length < 24; i++) pairs.push([rooms[i], rooms[(i * 7 + 5) % rooms.length]]);
for (const [a, b] of pairs) {
  test(`route ${a} → ${b}`, () => {
    const any = findRoute(a, b);
    const flat = findRoute(a, b, { avoidStairs: true });
    assert.ok(any && flat, 'route exists');
    assert.equal(flat.path.at(-1), b);
    assert.ok(!flat.edges.some((e) => e.kind === 'STAIRS'), 'avoid-stairs never uses stairs');
  });
}

test('avoid stairs changes the route to Room 12 from the entrance', () => {
  const stairs = findRoute('G_ENT', 'F1_R12');
  const flat = findRoute('G_ENT', 'F1_R12', { avoidStairs: true });
  assert.ok(stairs.edges.some((e) => e.kind === 'STAIRS'));
  assert.ok(flat.edges.some((e) => e.kind === 'LIFT'));
});

test('closing Lift A reroutes step-free users via Lift B; closing both gives no step-free route', () => {
  const r = findRoute('G_ENT', 'F1_R12', { avoidStairs: true, closed: ['LIFT_A'] });
  assert.ok(r.edges.every((e) => e.group !== 'LIFT_A'));
  assert.equal(findRoute('G_ENT', 'F1_R12', { avoidStairs: true, closed: ['LIFT_A', 'LIFT_B'] }), null);
});

test('emergency route from entrance is always step-free', () => {
  const r = findRoute('G_ENT', 'G_ED', { avoidStairs: true });
  assert.equal(nodeById[r.path.at(-1)].place, 'casualty');
});

test('slip search resolves spelling variants to Room 12', () => {
  for (const q of ['kamra 12', 'room12', 'कमरा 12', 'Room No. 12', 'کمرہ ۱۲', 'कमरा १२']) assert.equal(matchRoomCode(q), 'F1_R12', q);
  assert.equal(matchRoomCode('lab G-04'), 'G_LAB');
});

test('department suggester only suggests and needs confirmation', () => {
  const s = suggestDepartment('mujhe bukhar aur khansi hai');
  assert.equal(s.departmentId, 'GEN');
  assert.equal(s.needsConfirmation, true);
  assert.equal(suggestDepartment('xyz'), null);
});
