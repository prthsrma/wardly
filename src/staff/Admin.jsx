import { useState } from 'react';
import { ShieldAlert, Download, Printer, RotateCcw, Play, Pause, TriangleAlert } from 'lucide-react';
import { CLOSABLE } from '../../shared/hospital.js';
import { api, fmtTime } from '../lib.js';
import { AlertCard } from './Nurse.jsx';

// Medical Superintendent / admin views (F9, F11, S5).
export default function Admin({ snap, me, act, now, token, view }) {
  const isAdmin = me.role === 'ADMIN';
  const r = snap.report;
  if (view === 'queues') return (
    <div className="panel"><div className="panel-h"><h2>All service points</h2></div><div className="panel-b" style={{ overflowX: 'auto' }}>
      <table className="table"><thead><tr><th>Point</th><th>Type</th><th>Status</th><th>Waiting</th><th>New-join est.</th><th>Avg min</th><th>Transfer queue to</th></tr></thead><tbody>
        {snap.sps.map((s) => (
          <tr key={s.id} className={s.status !== 'AVAILABLE' ? 'hl' : ''}>
            <td><b>{s.label}</b></td><td>{s.type}</td>
            <td>{isAdmin ? <select className="input" style={{ minHeight: 34, padding: 2 }} value={s.status} onChange={(e) => act(`/sp/${s.id}/status`, { status: e.target.value, breakUntil: Date.now() + 15 * 60000 })}>{['AVAILABLE', 'BREAK', 'ROUND', 'ABSENT', 'CLOSED'].map((x) => <option key={x}>{x}</option>)}</select> : s.status}</td>
            <td>{s.waiting}</td><td>{s.estNewMin} min</td><td>{s.avgMin}</td>
            <td>{s.type === 'DOCTOR' && s.waiting > 0 && <select className="input" style={{ minHeight: 34, padding: 2 }} value="" onChange={(e) => e.target.value && act(`/sp/${s.id}/transfer`, { toId: e.target.value })}><option value="">Move all…</option>{snap.sps.filter((x) => x.type === 'DOCTOR' && x.id !== s.id).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>}</td>
          </tr>
        ))}
      </tbody></table></div></div>
  );
  if (view === 'alerts') return <div className="col">{snap.alerts.length ? snap.alerts.map((a) => <AlertCard key={a.id} a={a} now={now} act={act} />) : <p className="card">No alerts.</p>}</div>;
  if (view === 'audit') return (
    <div className="panel"><div className="panel-h"><h2>Audit log</h2></div><div className="panel-b"><table className="table"><thead><tr><th>Time</th><th>Staff</th><th>Action</th><th>Target</th></tr></thead><tbody>
      {snap.audit.map((a) => <tr key={a.id}><td>{fmtTime(a.at)}</td><td>{a.staffName || a.staff}</td><td><span className="tag">{a.action}</span></td><td>{a.target}</td></tr>)}
    </tbody></table></div></div>
  );
  if (view === 'safety') return <Safety snap={snap} act={act} />;
  if (view === 'report') return (
    <div className="col">
      <div className="row no-print">
        <button className="btn btn-dark" onClick={() => act('/reports/daily', undefined, 'GET')}>Generate now</button>
        <button className="btn" onClick={async () => { const res = await fetch('/api/reports/daily?format=csv', { headers: { Authorization: `Bearer ${token}` } }); const u = URL.createObjectURL(await res.blob()); const a = document.createElement('a'); a.href = u; a.download = `wardly-report-${r.date}.csv`; a.click(); }}><Download size={16} aria-hidden="true" />CSV</button>
        <button className="btn" onClick={() => window.print()}><Printer size={16} aria-hidden="true" />Print / PDF</button>
      </div>
      <div className="card printable">
        <h2>Daily OPD quality report · {r.hospital} · {r.date}</h2><p className="muted">{r.format}. Simulated data.</p>
        <div className="kpis mt"><Kpi n={r.visits} l="Visits" /><Kpi n={r.completed} l="Completed" /><Kpi n={`${r.over60Pct}%`} l="Waits > 60 min" /><Kpi n={r.alerts.ackMedianSec != null ? `${r.alerts.ackMedianSec} s` : '—'} l="Alert ack median" /><Kpi n={r.alerts.ackMaxSec != null ? `${r.alerts.ackMaxSec} s` : '—'} l="Alert ack max" /><Kpi n={r.missedTurns} l="Missed turns" /></div>
        <table className="table mt"><thead><tr><th>Stage</th><th>Served</th><th>Median wait</th><th>% over 60 min</th></tr></thead><tbody>{r.stages.map((s) => <tr key={s.stage}><td>{STAGE[s.stage]}</td><td>{s.served}</td><td>{s.medianWaitMin} min</td><td>{s.over60Pct}%</td></tr>)}</tbody></table>
        <table className="table mt"><thead><tr><th>Department</th><th>Load</th><th>Capacity</th></tr></thead><tbody>{r.departments.map((d) => <tr key={d.id}><td>{d.name}</td><td>{d.today}</td><td>{d.cap} ({d.pct}%)</td></tr>)}</tbody></table>
      </div>
    </div>
  );
  // overview
  const maxWait = Math.max(1, ...r.stages.map((s) => s.medianWaitMin || 0));
  return (
    <>
      <div className="kpis">
        <Kpi n={r.visits} l="Patients today" /><Kpi n={snap.sps.reduce((s, x) => s + x.waiting, 0)} l="Waiting now" />
        <Kpi n={`${r.stages.find((s) => s.stage === 'DOCTOR')?.medianWaitMin ?? '—'} min`} l="Median doctor wait" /><Kpi n={`${r.over60Pct}%`} l="Waits > 60 min" />
        <Kpi n={r.alerts.ackMedianSec != null ? `${r.alerts.ackMedianSec} s` : '—'} l="Emergency ack (median)" /><Kpi n={`${snap.sps.filter((s) => s.status === 'AVAILABLE').length}/${snap.sps.length}`} l="Points open" />
      </div>
      {snap.bottlenecks.map((b) => <div key={b.spId} className="notice notice-red"><TriangleAlert aria-hidden="true" /><b>{b.msg}</b></div>)}
      <div className="grid2">
        <div className="panel"><div className="panel-h"><h2>Median wait per stage</h2></div><div className="panel-b col">
          {r.stages.map((s) => <div key={s.stage} className="dept-bar" style={{ gridTemplateColumns: '110px 1fr 60px', fontSize: '.85rem' }}><span>{STAGE[s.stage]}</span><span className="bar" style={{ height: 18 }}><span style={{ width: `${((s.medianWaitMin || 0) / maxWait) * 100}%` }} /></span><b>{s.medianWaitMin} min</b></div>)}
        </div></div>
        <div className="panel"><div className="panel-h"><h2>Crowding (waiting vs seats)</h2></div><div className="panel-b heat">
          {snap.crowding.map((z) => <div key={z.id} style={{ background: z.alert ? '#ffc9c9' : z.pct > 50 ? 'var(--y)' : 'var(--sage)' }}><b>{z.label}</b><div className="h" style={{ fontSize: '1.8rem' }}>{z.pct}%</div><small>{z.waiting} / {z.seats} seats{z.alert ? ' · open overflow area' : ''}</small></div>)}
        </div></div>
      </div>
      <div className="panel"><div className="panel-h"><h2>Department load vs capacity</h2></div><div className="panel-b col">
        {snap.loads.map((d) => <div key={d.id} className="dept-bar" style={{ gridTemplateColumns: '160px 1fr 90px' }}><span>{d.name}</span><span className={`bar ${d.full ? 'full' : d.warn ? 'warn' : ''}`} style={{ height: 18 }}><span style={{ width: `${Math.min(100, d.pct)}%` }} /></span><b>{d.today}/{d.cap}</b></div>)}
      </div></div>
    </>
  );
}

const STAGE = { REGISTRATION: 'Registration', DOCTOR: 'Doctor', LAB: 'Lab test', XRAY: 'X-ray', PHARMACY: 'Pharmacy', BILLING: 'Billing' };
const Kpi = ({ n, l }) => <div className="kpi"><div className="n">{n}</div><div className="l">{l}</div></div>;

function Safety({ snap, act }) {
  const [ratio, setRatio] = useState(snap.settings.priorityRatio);
  const [esc, setEsc] = useState(snap.settings.escalateSec);
  return (
    <div className="grid2" style={{ alignItems: 'start' }}>
      <div className="panel"><div className="panel-h"><h2>Lift & corridor closures</h2></div><div className="panel-b col">
        {CLOSABLE.map((c) => { const shut = snap.closed.includes(c.id); return <button key={c.id} className="toggle" aria-pressed={shut} onClick={() => act(`/admin/closures/${c.id}`)}>{c.label}<span className="check">{shut ? '✕' : ''}</span></button>; })}
        <p className="muted" style={{ fontSize: '.85rem' }}>Closing re-routes every active patient; wheelchair users with no step-free route trigger a desk alert.</p>
      </div></div>
      <div className="col" style={{ gap: 20 }}>
        <div className="panel"><div className="panel-h"><ShieldAlert aria-hidden="true" /><h2>Evacuation mode</h2></div><div className="panel-b">
          <button className={`btn btn-lg btn-block ${snap.evacuation ? 'btn-dark' : 'btn-red'}`} onClick={() => act('/admin/evacuation', { on: !snap.evacuation })}>{snap.evacuation ? 'Turn evacuation OFF' : 'Start evacuation (all screens + boards)'}</button>
        </div></div>
        <div className="panel"><div className="panel-h"><h2>Settings</h2></div><div className="panel-b col">
          <label className="row">Priority : normal <input className="input" style={{ width: 70 }} type="number" min="1" value={ratio.priority} onChange={(e) => setRatio({ ...ratio, priority: +e.target.value })} /> : <input className="input" style={{ width: 70 }} type="number" min="0" value={ratio.normal} onChange={(e) => setRatio({ ...ratio, normal: +e.target.value })} /></label>
          <label className="row">Escalate after (s) <input className="input" style={{ width: 90 }} type="number" value={esc} onChange={(e) => setEsc(+e.target.value)} /></label>
          <button className="btn btn-dark" onClick={() => act('/admin/settings', { priorityRatio: ratio, escalateSec: esc }, 'PATCH')}>Save settings</button>
        </div></div>
        <div className="panel"><div className="panel-h"><h2>Demo controls</h2></div><div className="panel-b row">
          <button className="btn" onClick={() => act('/admin/sim', { on: !snap.sim })}>{snap.sim ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}{snap.sim ? 'Stop live simulation' : 'Start live simulation'}</button>
          <button className="btn btn-red" onClick={() => confirm('Reset all demo data?') && act('/admin/reset')}><RotateCcw size={16} aria-hidden="true" />Reset demo</button>
        </div></div>
      </div>
    </div>
  );
}
