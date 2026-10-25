import { Siren, CheckCircle2, MapPin, Timer, ShieldCheck, BellRing } from 'lucide-react';
import { TRIAGE } from '../../shared/hospital.js';
import { placeName } from '../../shared/logic.js';
import { NeedsIcons } from '../components.jsx';
import { ago, signLabel } from './Staff.jsx';
import { LangBadge } from './Doctor.jsx';

// STG timer: Red = immediate, Yellow = 30 min, Green = 60 min (DGHS STG 2025).
function StgTimer({ a, now }) {
  if (!a.colour) return null;
  const target = TRIAGE[a.colour].targetMin * 60000;
  const left = a.colourAt + target - now;
  if (a.colour === 'RED') return <span className="pill pill-red"><Timer size={14} aria-hidden="true" />Immediate · {ago(a.colourAt, now)} since triage</span>;
  return <span className={`pill ${left < 0 ? 'pill-red' : 'pill-amber'}`}><Timer size={14} aria-hidden="true" />{left < 0 ? `Over STG target by ${ago(now + left, now)}` : `${Math.ceil(left / 60000)} min left of ${TRIAGE[a.colour].targetMin}`}</span>;
}

export function AlertCard({ a, now, act, canTriage }) {
  return (
    <div className={`alert-card ${!a.ackAt ? 'raised' : ''} ${a.colour ? `c-${a.colour}` : ''}`}>
      <div className="row between">
        <div className="row">
          {a.kind === 'EMERGENCY' ? <Siren color="var(--red)" aria-hidden="true" /> : <BellRing aria-hidden="true" />}
          <b style={{ fontSize: '1.1rem' }}>{a.kind === 'EMERGENCY' ? 'Emergency' : a.kind === 'HELP' ? 'Urgent help' : a.kind === 'KIOSK_HELP' ? 'Kiosk help' : 'No step-free route'}</b>
          <span className="tag">{a.source}</span>
          {a.escalationLevel > 0 && <span className="pill pill-dark">Escalated → {a.escalationLevel === 1 ? 'second nurse' : 'ED in-charge'}</span>}
        </div>
        <span className="pill">{a.ackAt ? `Ack in ${Math.round((a.ackAt - a.raisedAt) / 1000)}s by ${a.ackBy}` : `Raised ${ago(a.raisedAt, now)} ago`}</span>
      </div>
      {a.signs.length > 0 && <div className="row">{a.signs.map((s) => <span key={s} className="pill pill-red">{signLabel[s] || s}</span>)}</div>}
      <div className="row">
        {a.nodeId && <span className="pill"><MapPin size={14} aria-hidden="true" />{placeName('en', a.nodeId)}</span>}
        {a.token && <span className="pill pill-dark">Token {a.token}</span>}
        {a.lang && <LangBadge lang={a.lang} />}
        {a.needs && <NeedsIcons needs={a.needs} />}
        {a.note && <span className="muted">{a.note}</span>}
      </div>
      {a.status !== 'RESOLVED' && (
        <div className="row">
          {!a.ackAt && <button className="btn btn-sm btn-dark" onClick={() => act(`/alerts/${a.id}/ack`)}><CheckCircle2 size={18} aria-hidden="true" />Acknowledge</button>}
          {canTriage && a.kind === 'EMERGENCY' && (
            <div className="row" role="group" aria-label="DGHS triage colour">
              {Object.keys(TRIAGE).map((c) => <button key={c} className={`tri tri-${c}`} aria-pressed={a.colour === c} onClick={() => act(`/alerts/${a.id}/colour`, { colour: c })}>{TRIAGE[c].label} · {TRIAGE[c].desc}</button>)}
            </div>
          )}
          <StgTimer a={a} now={now} />
          <span className="grow" />
          <button className="btn btn-sm" onClick={() => act(`/alerts/${a.id}/resolve`)}><ShieldCheck size={16} aria-hidden="true" />Resolve</button>
        </div>
      )}
      {a.status === 'RESOLVED' && <span className="muted">Resolved · {a.colour ? `triaged ${a.colour} by ${a.colourBy}` : 'no triage colour'}</span>}
    </div>
  );
}

export default function Nurse({ snap, me, act, now }) {
  const open = snap.alerts.filter((a) => a.status !== 'RESOLVED');
  const done = snap.alerts.filter((a) => a.status === 'RESOLVED').slice(0, 8);
  const rank = (a) => (!a.ackAt ? 0 : a.colour === 'RED' ? 1 : a.colour === 'YELLOW' ? 2 : a.colour ? 3 : 1.5);
  return (
    <>
      <div className="kpis">
        <div className="kpi"><div className="n">{open.filter((a) => !a.ackAt).length}</div><div className="l">Waiting for acknowledgement</div></div>
        <div className="kpi"><div className="n">{open.filter((a) => a.colour === 'RED').length}</div><div className="l">Red (immediate)</div></div>
        <div className="kpi"><div className="n">{open.length}</div><div className="l">Open alerts</div></div>
        <div className="kpi"><div className="n">{snap.settings.escalateSec}s</div><div className="l">Escalation step</div></div>
      </div>
      <div className="notice notice-sage"><ShieldCheck aria-hidden="true" /><span>Patients report danger signs; the software only raises the alarm. <b>You</b> assess and set the DGHS colour. Downgrades are audit-logged.</span></div>
      <div className="col" style={{ gap: 14 }}>
        {!open.length && <p className="card">No open alerts. New alerts appear here instantly with sound.</p>}
        {[...open].sort((a, b) => rank(a) - rank(b) || b.raisedAt - a.raisedAt).map((a) => <AlertCard key={a.id} a={a} now={now} act={act} canTriage={['NURSE', 'DOCTOR'].includes(me.role)} />)}
      </div>
      {done.length > 0 && <div className="panel"><div className="panel-h"><h2>Recently resolved</h2></div><div className="panel-b col">{done.map((a) => <AlertCard key={a.id} a={a} now={now} act={act} />)}</div></div>}
    </>
  );
}
