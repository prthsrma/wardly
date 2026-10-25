import { useState } from 'react';
import { PhoneForwarded, Play, SkipForward, CheckCheck, Coffee, Footprints, UserX, UserCheck, RotateCcw, EarOff, Clock } from 'lucide-react';
import { LANGS } from '../../shared/hospital.js';
import { placeName } from '../../shared/logic.js';
import { NeedsIcons, Modal } from '../components.jsx';
import { fmtTime } from '../lib.js';
import { ago } from './Staff.jsx';

export const LangBadge = ({ lang }) => <span className="pill pill-sage" lang={lang}>{LANGS.find((l) => l.code === lang)?.native}</span>;

export function QueueTable({ sp, now, actions }) {
  if (!sp.queue.length) return <p className="muted">No one waiting.</p>;
  return (
    <table className="table">
      <thead><tr><th>#</th><th>Token</th><th>Patient</th><th>Lane</th><th>Lang</th><th>Needs</th><th>Waiting</th><th>Est.</th>{actions && <th />}</tr></thead>
      <tbody>
        {sp.queue.map((e, i) => (
          <tr key={e.id} className={e.lane === 'PRIORITY' ? 'hl' : ''}>
            <td>{i + 1}</td><td><b className="kbd">{e.token}</b></td><td>{e.name} · {e.age} · {e.gender}</td>
            <td>{e.lane === 'PRIORITY' ? <span className="tag" style={{ background: 'var(--y)' }}>Priority</span> : <span className="tag">Normal</span>}</td>
            <td><LangBadge lang={e.lang} /></td><td><NeedsIcons needs={e.needs} labels={false} /></td>
            <td>{ago(e.joinedAt, now)}</td><td>{e.est?.next ? 'Next' : `${e.est?.low}–${e.est?.high}m`}</td>
            {actions && <td>{actions(e)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const TESTS = ['CBC', 'Blood sugar', 'Urine routine', 'LFT', 'KFT', 'Lipid profile'];
const XRAYS = ['Chest X-ray', 'Knee X-ray', 'Spine X-ray', 'Hand/wrist X-ray'];

export default function Doctor({ snap, me, act, now }) {
  const sp = snap.sps.find((s) => s.id === me.sp);
  const [done, setDone] = useState(null);
  const [mins, setMins] = useState(15);
  if (!sp) return <p className="notice">No service point linked to this account.</p>;
  const cur = sp.active[0];
  return (
    <>
      <div className="row between">
        <div className="row">
          <span className="pill pill-dark">{placeName('en', sp.nodeId)}</span>
          <span className={`pill ${sp.status === 'AVAILABLE' ? 'pill-green' : sp.status === 'ABSENT' ? 'pill-red' : 'pill-amber'}`}>{sp.status}{sp.breakUntil ? ` until ${fmtTime(sp.breakUntil)}` : ''}</span>
          <span className="pill"><Clock size={14} aria-hidden="true" />avg {sp.avgMin} min / patient</span>
        </div>
        <div className="row" role="group" aria-label="Doctor status">
          <button className="btn btn-sm" aria-pressed={sp.status === 'AVAILABLE'} onClick={() => act(`/sp/${sp.id}/status`, { status: 'AVAILABLE' })}><UserCheck size={16} aria-hidden="true" />Available</button>
          <select className="input" style={{ width: 'auto', minHeight: 36, padding: '2px 8px' }} value={mins} onChange={(e) => setMins(+e.target.value)} aria-label="Break length">{[10, 15, 20, 30, 45, 60].map((m) => <option key={m} value={m}>{m} min</option>)}</select>
          <button className="btn btn-sm" aria-pressed={sp.status === 'BREAK'} onClick={() => act(`/sp/${sp.id}/status`, { status: 'BREAK', breakUntil: Date.now() + mins * 60000 })}><Coffee size={16} aria-hidden="true" />Break</button>
          <button className="btn btn-sm" aria-pressed={sp.status === 'ROUND'} onClick={() => act(`/sp/${sp.id}/status`, { status: 'ROUND', breakUntil: Date.now() + mins * 60000 })}><Footprints size={16} aria-hidden="true" />Ward round</button>
          <button className="btn btn-sm" aria-pressed={sp.status === 'ABSENT'} onClick={() => act(`/sp/${sp.id}/status`, { status: 'ABSENT' })}><UserX size={16} aria-hidden="true" />Absent</button>
        </div>
      </div>

      <div className="grid3">
        <div className="col" style={{ gap: 20 }}>
          <div className="serving">
            <div className="row between"><span className="pill pill-y">Now serving</span><span style={{ color: '#aab' }}>{sp.waiting} waiting</span></div>
            {cur ? (
              <>
                <div className="token-big mt">{cur.token}</div>
                <div className="row mt" style={{ fontSize: '1.3rem', fontWeight: 800 }}>{cur.name} · {cur.age} · {cur.gender} <LangBadge lang={cur.lang} />{cur.lane === 'PRIORITY' && <span className="pill pill-y">Priority</span>}</div>
                <div className="mt"><NeedsIcons needs={cur.needs} /></div>
                {cur.needs.hearing && cur.status === 'CALLED' && <div className="notice notice-y mt" style={{ color: '#000' }}><EarOff aria-hidden="true" /><b>Hard of hearing — please go to the patient in the waiting area.</b></div>}
                <p className="mt" style={{ color: '#ccd' }}>{cur.status === 'CALLED' ? `Called ${ago(cur.calledAt, now)} ago` : `In consultation for ${ago(cur.startedAt, now)}`}</p>
                <div className="row mt">
                  {cur.status === 'CALLED' && <button className="btn btn-y" onClick={() => act(`/entries/${cur.id}/start`)}><Play size={18} aria-hidden="true" />Start consult</button>}
                  <button className="btn" onClick={() => setDone(cur)}><CheckCheck size={18} aria-hidden="true" />Done + next steps</button>
                  {cur.status === 'CALLED' && <button className="btn btn-ghost" style={{ color: '#fff' }} onClick={() => act(`/entries/${cur.id}/skip`)}><SkipForward size={18} aria-hidden="true" />Not here (skip)</button>}
                </div>
              </>
            ) : <p className="mt" style={{ fontSize: '1.2rem' }}>No patient in the room.</p>}
          </div>
          <button className="btn btn-lg btn-dark" disabled={!!cur || !sp.queue.length || sp.status !== 'AVAILABLE'} onClick={() => act(`/sp/${sp.id}/call-next`)}>
            <PhoneForwarded aria-hidden="true" />Call next {sp.queue[0] ? `(${sp.queue[0].token})` : ''}
          </button>
          {cur && <p className="muted" style={{ marginTop: -10 }}>Finish the current patient before calling the next.</p>}
          <div className="panel">
            <div className="panel-h"><h2>Queue</h2><span className="muted">Priority interleave {snap.settings.priorityRatio.priority}:{snap.settings.priorityRatio.normal} (set by admin)</span></div>
            <div className="panel-b" style={{ overflowX: 'auto' }}><QueueTable sp={sp} now={now} /></div>
          </div>
        </div>
        <div className="col" style={{ gap: 20 }}>
          <div className="panel">
            <div className="panel-h"><h2>Missed turns</h2></div>
            <div className="panel-b col">
              {!sp.missed.length && <p className="muted">None in the last hour.</p>}
              {sp.missed.map((e) => (
                <div key={e.id} className="row between">
                  <span><b className="kbd">{e.token}</b> {e.name} · {ago(e.missedAt, now)} ago · miss {e.misses}/2</span>
                  <button className="btn btn-sm" disabled={e.misses >= 2 || now - e.missedAt > snap.settings.recallWindowMin * 60000} onClick={() => act(`/entries/${e.id}/recall`)}><RotateCcw size={14} aria-hidden="true" />Recall</button>
                </div>
              ))}
              <p className="muted" style={{ fontSize: '.8rem' }}>Recall within {snap.settings.recallWindowMin} min puts the token back at position 2. After two misses the desk reissues.</p>
            </div>
          </div>
          <div className="notice notice-sage"><span>Waiting patients' estimates update instantly when you change status. Software never changes queue order for urgency — use <b>Raise emergency flag</b> to call a nurse.</span></div>
        </div>
      </div>
      {done && <DoneModal entry={done} onClose={() => setDone(null)} onSubmit={async (steps) => { await act(`/entries/${done.id}/done`, { nextSteps: steps }); setDone(null); }} />}
    </>
  );
}

function DoneModal({ entry, onClose, onSubmit }) {
  const [lab, setLab] = useState([]);
  const [xray, setXray] = useState([]);
  const [ret, setRet] = useState(false);
  const [meds, setMeds] = useState('');
  const toggle = (arr, set, v) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const steps = [
    ...(lab.length ? [{ type: 'LAB', items: lab }] : []),
    ...(xray.length ? [{ type: 'XRAY', items: xray }] : []),
    ...(ret ? [{ type: 'RETURN' }] : []),
    ...(meds.trim() ? [{ type: 'PHARMACY', items: meds.split(',').map((m) => m.trim()).filter(Boolean) }] : []),
  ];
  return (
    <Modal onClose={onClose} label="Done and next steps">
      <h2 className="q-title">Done · {entry.token}</h2>
      <p className="muted mt">Pick next steps. The token joins those queues automatically and the counters see the order before the patient arrives.</p>
      <div className="col mt">
        <b>Lab tests</b>
        <div className="row">{TESTS.map((x) => <button key={x} className="btn btn-sm" aria-pressed={lab.includes(x)} onClick={() => toggle(lab, setLab, x)}>{x}</button>)}</div>
        <b>X-ray</b>
        <div className="row">{XRAYS.map((x) => <button key={x} className="btn btn-sm" aria-pressed={xray.includes(x)} onClick={() => toggle(xray, setXray, x)}>{x}</button>)}</div>
        <button className="toggle" aria-pressed={ret} onClick={() => setRet(!ret)}>Return to me with reports<span className="check">{ret && '✓'}</span></button>
        <label className="field">Pharmacy (comma-separated)<input className="input" value={meds} onChange={(e) => setMeds(e.target.value)} placeholder="Paracetamol 500mg x10, ORS x5" /></label>
      </div>
      <div className="notice mt"><b>Route:</b>&nbsp;{steps.length ? steps.map((s) => s.type === 'RETURN' ? 'Back to doctor' : s.type[0] + s.type.slice(1).toLowerCase()).join(' → ') : 'Finish visit'}</div>
      <div className="row mt">
        <button className="btn btn-lg btn-dark grow" onClick={() => onSubmit(steps)}>{steps.length ? 'Send to next step' : 'Finish visit'}</button>
        <button className="btn btn-lg" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}
