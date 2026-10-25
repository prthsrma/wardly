import { useState } from 'react';
import { Search, Printer, RefreshCw, HeartHandshake, BellRing, TicketX } from 'lucide-react';
import Register, { Slip } from '../pages/Register.jsx';
import { api } from '../lib.js';
import { NeedsIcons } from '../components.jsx';
import { AlertCard } from './Nurse.jsx';

export default function Desk({ snap, act, now, token, view }) {
  if (view === 'register') return (
    <div className="grid3">
      <Register assisted auth={token} />
      <SidePanels snap={snap} act={act} now={now} />
    </div>
  );
  if (view === 'lookup') return <Lookup token={token} act={act} />;
  return <SidePanels snap={snap} act={act} now={now} wide />;
}

function SidePanels({ snap, act, now, wide }) {
  return (
    <div className={wide ? 'grid2' : 'col'} style={{ gap: 20, alignItems: 'start' }}>
      <div className="panel">
        <div className="panel-h"><BellRing aria-hidden="true" /><h2>Help calls</h2><span className="pill">{snap.helpCalls.length}</span></div>
        <div className="panel-b col">
          {!snap.helpCalls.length && <p className="muted">No open help calls from kiosks or patients.</p>}
          {snap.helpCalls.map((a) => <AlertCard key={a.id} a={a} now={now} act={act} />)}
        </div>
      </div>
      <div className="panel">
        <div className="panel-h"><HeartHandshake aria-hidden="true" /><h2>Welfare check</h2><span className="pill">{snap.welfare.length}</span></div>
        <div className="panel-b col">
          <p className="muted" style={{ fontSize: '.85rem' }}>Elderly, disabled or “needs helper” patients waiting more than {snap.settings.welfareFactor}× their estimate.</p>
          {!snap.welfare.length && <p className="muted">Nobody needs a check right now.</p>}
          {snap.welfare.map((w) => (
            <div key={w.token} className="notice notice-y" style={{ flexDirection: 'column', gap: 4 }}>
              <b>{w.token} · {w.name}, {w.age}</b>
              <span>{w.spLabel} · waited {w.waitedMin} min (estimate {w.expectedMin})</span>
              <NeedsIcons needs={w.needs} />
            </div>
          ))}
        </div>
      </div>
      <div className="panel">
        <div className="panel-h"><TicketX aria-hidden="true" /><h2>Needs reissue</h2><span className="pill">{snap.reissue.length}</span></div>
        <div className="panel-b col">
          {!snap.reissue.length && <p className="muted">No tokens waiting for reissue.</p>}
          {snap.reissue.map((r) => (
            <div key={r.token} className="row between"><span><b className="kbd">{r.token}</b> {r.name}, {r.age} · missed twice</span><button className="btn btn-sm" onClick={() => act(`/visits/${r.token}/reissue`)}><RefreshCw size={14} aria-hidden="true" />Reissue</button></div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Lookup({ token, act }) {
  const [q, setQ] = useState('');
  const [v, setV] = useState(null);
  const [err, setErr] = useState('');
  const find = async (e) => {
    e?.preventDefault(); setErr('');
    try { setV(await api(`/staff/lookup/${q.trim().toUpperCase()}`, { auth: token })); } catch (x) { setV(null); setErr(x.message); }
  };
  return (
    <div className="col" style={{ maxWidth: 860 }}>
      <form className="row card" onSubmit={find}>
        <input className="input grow" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Token, e.g. A-012" aria-label="Token" required />
        <button className="btn btn-dark"><Search size={18} aria-hidden="true" />Find</button>
      </form>
      {err && <p className="notice notice-red">{err}</p>}
      {v && (
        <>
          <div className="row">
            <span className="pill pill-dark">{v.status}</span>
            <span className="pill">{v.name}, {v.age}</span>
            <NeedsIcons needs={v.needs} />
            <span className="grow" />
            {v.status === 'REISSUE' && <button className="btn" onClick={async () => { await act(`/visits/${v.token}/reissue`); find(); }}><RefreshCw size={16} aria-hidden="true" />Reissue token (audit-logged)</button>}
            <button className="btn btn-dark" onClick={() => window.print()}><Printer size={16} aria-hidden="true" />Reprint slip</button>
          </div>
          <Slip visit={v} />
        </>
      )}
    </div>
  );
}
