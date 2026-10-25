import { useState } from 'react';
import { PackageCheck, PhoneForwarded, CheckCheck, SkipForward, Truck, DoorOpen, DoorClosed } from 'lucide-react';
import { NeedsIcons } from '../components.jsx';
import { fmtTime } from '../lib.js';
import { ago } from './Staff.jsx';
import { QueueTable, LangBadge } from './Doctor.jsx';

// Pharmacy / Lab / X-ray: pre-staged orders arrive before the patient does (F4.3).
export default function Counter({ snap, me, act, now }) {
  const mine = snap.sps.filter((s) => s.queue && (me.role === 'PHARMACY' ? s.type === 'PHARMACY' : ['LAB', 'XRAY'].includes(s.type)));
  const [spId, setSpId] = useState(me.sp || mine[0]?.id);
  const sp = mine.find((s) => s.id === spId) || mine[0];
  const orders = snap.orders.filter((o) => !o.collectedAt && (me.role === 'PHARMACY' || o.type === sp.type));
  const cur = sp.active[0];
  return (
    <>
      <div className="row">
        <div className="tabs" role="tablist">{mine.map((s) => <button key={s.id} role="tab" className="tab" aria-selected={s.id === sp.id} onClick={() => setSpId(s.id)}>{s.label} · {s.waiting}</button>)}</div>
        <span className="grow" />
        {sp.status === 'CLOSED' || sp.status !== 'AVAILABLE'
          ? <button className="btn btn-sm btn-y" onClick={() => act(`/sp/${sp.id}/status`, { status: 'AVAILABLE' })}><DoorOpen size={16} aria-hidden="true" />Open this counter</button>
          : <button className="btn btn-sm" onClick={() => act(`/sp/${sp.id}/status`, { status: 'CLOSED' })}><DoorClosed size={16} aria-hidden="true" />Close counter</button>}
      </div>
      <div className="grid2" style={{ alignItems: 'start' }}>
        <div className="col" style={{ gap: 20 }}>
          <div className="serving">
            <div className="row between"><span className="pill pill-y">At the counter</span><span style={{ color: '#aab' }}>{sp.status}</span></div>
            {cur ? (
              <>
                <div className="token-big mt">{cur.token}</div>
                <div className="row mt" style={{ fontWeight: 800, fontSize: '1.2rem' }}>{cur.name}, {cur.age} <LangBadge lang={cur.lang} /></div>
                <div className="mt"><NeedsIcons needs={cur.needs} /></div>
                <div className="row mt">
                  <button className="btn btn-y" onClick={() => act(`/entries/${cur.id}/done`)}><CheckCheck size={18} aria-hidden="true" />{sp.type === 'PHARMACY' ? 'Collected' : 'Sample / scan done'}</button>
                  {cur.status === 'CALLED' && <button className="btn btn-ghost" style={{ color: '#fff' }} onClick={() => act(`/entries/${cur.id}/skip`)}><SkipForward size={18} aria-hidden="true" />Not here</button>}
                </div>
              </>
            ) : <p className="mt">Nobody at the counter.</p>}
          </div>
          <button className="btn btn-lg btn-dark" disabled={!!cur || !sp.queue.length || sp.status !== 'AVAILABLE'} onClick={() => act(`/sp/${sp.id}/call-next`)}><PhoneForwarded aria-hidden="true" />Call next {sp.queue[0] ? `(${sp.queue[0].token})` : ''}</button>
          <div className="panel"><div className="panel-h"><h2>Queue</h2></div><div className="panel-b" style={{ overflowX: 'auto' }}><QueueTable sp={sp} now={now} /></div></div>
        </div>
        <div className="panel">
          <div className="panel-h"><Truck aria-hidden="true" /><h2>Incoming orders (pre-staged)</h2><span className="pill">{orders.length}</span></div>
          <div className="panel-b col">
            {!orders.length && <p className="muted">No pending orders.</p>}
            {orders.map((o) => {
              const eta = o.etaAt ? o.etaAt - now : null;
              return (
                <div key={o.id} className={`notice ${o.preparedAt ? 'notice-sage' : 'notice-y'}`} style={{ flexDirection: 'column', gap: 6 }}>
                  <div className="row between"><b className="kbd" style={{ fontSize: '1.2rem' }}>{o.token}</b><span className="tag">{o.type}</span></div>
                  <div>{o.items.join(', ') || '—'}</div>
                  <div className="row between">
                    <small className="muted">From {o.createdBy} · {ago(o.createdAt, now)} ago · {o.etaAt ? (eta > 0 ? `arrives in ~${Math.ceil(eta / 60000)} min` : 'patient due now') : 'patient at an earlier step'}</small>
                    {o.preparedAt ? <span className="pill pill-green"><PackageCheck size={14} aria-hidden="true" />Prepared {fmtTime(o.preparedAt)}</span>
                      : <button className="btn btn-sm btn-dark" onClick={() => act(`/orders/${o.id}/prepared`)}><PackageCheck size={14} aria-hidden="true" />Mark prepared</button>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
