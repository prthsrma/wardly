// Pure logic shared by server, browser (offline emergency route) and tests.
import { NODES, EDGES, DEPARTMENTS, SERVICE_POINTS } from './hospital.js';
import { t } from './i18n.js';

export const nodeById = Object.fromEntries(NODES.map((n) => [n.id, n]));
const edgeLen = (e) => e.m ?? Math.hypot(nodeById[e.from].x - nodeById[e.to].x, nodeById[e.from].y - nodeById[e.to].y) / 10;

export function edgeClosed(e, closed) {
  return closed.includes(e.id) || (e.group && closed.includes(e.group)) || closed.includes(`${e.from}-${e.to}`) ||
    closed.includes(`${e.to}-${e.from}`) || (e.kind === 'STAIRS' && closed.includes(`STAIRS_${e.name?.match(/Stairs (\d)/)?.[1]}`));
}

// Dijkstra (PRD F5): weight = metres; lift edges add expected wait (1 m/s walking => seconds == metres).
export function findRoute(from, to, { avoidStairs = false, closed = [], liftWaitSec = 60 } = {}) {
  if (!nodeById[from] || !nodeById[to]) return null;
  const adj = {};
  for (const e of EDGES) {
    if (edgeClosed(e, closed) || (avoidStairs && e.kind === 'STAIRS')) continue;
    const cost = edgeLen(e) + (e.kind === 'LIFT' ? liftWaitSec : 0);
    (adj[e.from] ||= []).push({ to: e.to, cost, e });
    (adj[e.to] ||= []).push({ to: e.from, cost, e });
  }
  const dist = { [from]: 0 }, prev = {}, done = new Set();
  // shortcut: O(n^2) Dijkstra, fine for ~50 nodes; use a heap for a full campus graph.
  while (true) {
    let u = null;
    for (const k in dist) if (!done.has(k) && (u === null || dist[k] < dist[u])) u = k;
    if (u === null || u === to) break;
    done.add(u);
    for (const { to: v, cost, e } of adj[u] || []) {
      if (dist[u] + cost < (dist[v] ?? Infinity)) { dist[v] = dist[u] + cost; prev[v] = { u, e }; }
    }
  }
  if (dist[to] === undefined) return null;
  const path = [to], edges = [];
  for (let c = to; c !== from; c = prev[c].u) { path.unshift(prev[c].u); edges.unshift(prev[c].e); }
  const metres = Math.round(edges.reduce((s, e) => s + edgeLen(e), 0));
  return { path, edges, metres, etaMin: Math.max(1, Math.ceil(dist[to] / 60)), steps: buildSteps(path, edges), floors: [...new Set(path.map((p) => nodeById[p].floor))] };
}

// Landmark directions, returned as structured steps the client renders in the patient's language.
function turnOf(a, b, c) {
  const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
  const dot = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y);
  if (Math.abs(cross) < 1e-6 && dot > 0) return 'straight';
  return cross > 0 ? 'right' : 'left'; // screen coords: y grows downward
}

function buildSteps(path, edges) {
  const steps = [];
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i], a = nodeById[path[i]], b = nodeById[path[i + 1]];
    if (e.kind === 'LIFT' || e.kind === 'STAIRS') {
      let j = i; // merge consecutive vertical edges into one step
      while (j + 1 < edges.length && edges[j + 1].kind === e.kind) j++;
      const end = nodeById[path[j + 1]];
      steps.push({ t: e.kind === 'LIFT' ? 'lift' : 'stairs', code: a.code, floor: end.floor, up: end.floor > a.floor, node: end.id });
      i = j;
      continue;
    }
    const prevNode = i > 0 ? nodeById[path[i - 1]] : null;
    const turn = prevNode && prevNode.floor === a.floor && edges[i - 1].kind === 'WALK' ? turnOf(prevNode, a, b) : null;
    const last = i === edges.length - 1;
    steps.push({ t: last ? 'arrive' : 'walk', turn: turn === 'straight' ? null : turn, to: b.id, lm: b.lm || null, floor: b.floor });
  }
  if (!edges.length) steps.push({ t: 'here', to: path[0], floor: nodeById[path[0]].floor });
  return steps;
}

// Wait estimate (PRD F4.4): always a range, always rounded up.
export const ceilTo5 = (x) => Math.ceil(x / 5) * 5;
export function estimateRange(avgMin, peopleAhead, breakRemainingMin = 0, factor = 1.3) {
  if (peopleAhead <= 0 && breakRemainingMin <= 0) return { next: true, low: 0, high: 0 };
  const est = avgMin * peopleAhead + Math.max(0, breakRemainingMin);
  const low = Math.max(5, ceilTo5(est));
  return { next: false, low, high: Math.max(low + 5, ceilTo5(est * factor)) };
}

// Priority interleave (PRD F3.3): cycle of P priority then N normal; ratio set by admin only.
export function laneCycle({ priority, normal }) {
  return [...Array(priority).fill('PRIORITY'), ...Array(normal).fill('NORMAL')];
}
export function projectOrder(entries, ratio, cyclePos = 0) {
  const lanes = { PRIORITY: entries.filter((e) => e.lane === 'PRIORITY'), NORMAL: entries.filter((e) => e.lane === 'NORMAL') };
  for (const k in lanes) lanes[k].sort((a, b) => a.seq - b.seq);
  const cyc = laneCycle(ratio), out = [];
  let p = cyclePos;
  while (lanes.PRIORITY.length || lanes.NORMAL.length) {
    const want = cyc[p % cyc.length], other = want === 'PRIORITY' ? 'NORMAL' : 'PRIORITY';
    out.push((lanes[want].length ? lanes[want] : lanes[other]).shift());
    p++;
  }
  // Recalled tokens go back at position 2 (PRD F4.7).
  const forced = out.filter((e) => e.forceFront);
  const rest = out.filter((e) => !e.forceFront);
  rest.splice(Math.min(1, rest.length), 0, ...forced);
  return rest;
}

// Department suggester (PRD F1.4): transparent keyword rules, a suggestion only, never assigns.
export function suggestDepartment(text) {
  const q = (text || '').toLowerCase();
  let best = null, score = 0;
  for (const d of DEPARTMENTS) {
    const s = d.kw.filter((k) => q.includes(k.toLowerCase())).length;
    if (s > score) { best = d.id; score = s; }
  }
  return best ? { departmentId: best, label: 'suggestion', needsConfirmation: true } : null;
}

// Slip search (PRD F6): number-first match so "kamra 12", "room12", "कमरा 12", "Room No. 12" all hit Room 12.
const DIGITS = { '०': 0, '१': 1, '२': 2, '३': 3, '४': 4, '५': 5, '६': 6, '७': 7, '८': 8, '९': 9, '۰': 0, '۱': 1, '۲': 2, '۳': 3, '۴': 4, '۵': 5, '۶': 6, '۷': 7, '۸': 8, '۹': 9, '٠': 0, '١': 1, '٢': 2, '٣': 3, '٤': 4, '٥': 5, '٦': 6, '٧': 7, '٨': 8, '٩': 9 };
export const normDigits = (s) => String(s).replace(/[०-९۰-۹٠-٩]/g, (c) => DIGITS[c]);
export function matchRoomCode(query) {
  const q = normDigits(query).toUpperCase();
  const g = q.match(/G\s*-?\s*0?(\d)/);
  if (g) { const n = NODES.find((x) => x.code === `G-0${g[1]}`); if (n) return n.id; }
  const num = q.match(/(\d{1,3})/);
  if (!num) return null;
  const n = NODES.find((x) => x.kind === 'ROOM' && x.place === 'room' && x.code === String(Number(num[1])));
  return n ? n.id : null;
}

export const spById = Object.fromEntries(SERVICE_POINTS.map((s) => [s.id, s]));
export const deptById = Object.fromEntries(DEPARTMENTS.map((d) => [d.id, d]));

// Localised place names and direction text (used by board, SMS templates, route steps).
export function placeName(lang, nodeId) {
  const n = nodeById[nodeId];
  if (!n) return '';
  const base = t(lang, `p_${n.place}`);
  if (n.place === 'junction' && n.lm) return `${base} (${t(lang, `lm_${n.lm}`)})`;
  return n.code && n.place !== 'waitingHall' ? `${base} ${n.code}` : base;
}
export const floorName = (lang, f) => (f === 0 ? t(lang, 'ground') : `${t(lang, 'floor')} ${f}`);
export function placeWithFloor(lang, nodeId) {
  const n = nodeById[nodeId];
  return n ? `${placeName(lang, nodeId)}, ${floorName(lang, n.floor)}` : '';
}
export function stepText(lang, s) {
  if (s.t === 'lift') return `${t(lang, 'takeLift')} ${s.code} ${t(lang, 'toFloor')} ${floorName(lang, s.floor)}`;
  if (s.t === 'stairs') return `${t(lang, 'takeStairs')} ${s.code} ${t(lang, 'toFloor')} ${floorName(lang, s.floor)}`;
  if (s.t === 'here') return `${t(lang, 'youAreAt')} ${placeName(lang, s.to)}`;
  const place = placeName(lang, s.to);
  if (s.t === 'arrive') return `${s.turn ? t(lang, `turn_${s.turn}`) + ' — ' : ''}${place} — ${t(lang, 'arrived')}`;
  return s.turn ? `${t(lang, `turn_${s.turn}`)}, ${t(lang, 'walkTo')} ${place}` : `${t(lang, 'walkToStart')} ${place}`;
}
