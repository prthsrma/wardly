import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LogOut, Siren, HandHelping, LayoutDashboard, Stethoscope, ClipboardList, Pill, FlaskConical, Monitor, Smartphone, QrCode, ShieldAlert, Route, FileBarChart, History, Users, Search, BellRing, Bell } from 'lucide-react';
import { STAFF } from '../../shared/hospital.js';
import { placeName } from '../../shared/logic.js';
import { api, socket, beep, useNow } from '../lib.js';
import { Brand, Modal } from '../components.jsx';
import Doctor from './Doctor.jsx';
import Nurse from './Nurse.jsx';
import Desk from './Desk.jsx';
import Counter from './Counter.jsx';
import Admin from './Admin.jsx';

const ROLE_VIEWS = {
  DESK: [['register', 'Assisted registration', ClipboardList], ['lookup', 'Patient lookup', Search], ['help', 'Help & welfare', HandHelping], ['queues', 'Queues & transfers', Users]],
  DOCTOR: [['doctor', 'My OPD queue', Stethoscope]],
  NURSE: [['nurse', 'Emergency alerts', Siren]],
  PHARMACY: [['counter', 'Pharmacy counter', Pill]],
  LAB: [['counter', 'Lab & X-ray', FlaskConical]],
  ADMIN: [['overview', 'Live overview', LayoutDashboard], ['queues', 'All queues', Users], ['alerts', 'Alerts log', Siren], ['safety', 'Navigation & safety', Route], ['report', 'Daily report', FileBarChart], ['audit', 'Audit log', History]],
};
const KIND = { EMERGENCY: 'EMERGENCY', HELP: 'URGENT HELP', KIOSK_HELP: 'KIOSK HELP', NO_ROUTE: 'NO STEP-FREE ROUTE' };
export const ago = (ms, now = Date.now()) => { const s = Math.max(0, Math.round((now - ms) / 1000)); return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`; };
export const signLabel = { chest: 'Chest pain', breath: 'Trouble breathing', bleed: 'Heavy bleeding', faint: 'Fainting / not waking', stroke: 'Stroke signs', injury: 'Serious injury', burn: 'Severe burn', pregnant: 'Pregnancy bleeding/pain', child: 'Very unwell child' };

export default function Staff() {
  const [session, setSession] = useState(() => { try { return JSON.parse(sessionStorage.getItem('ms-staff')); } catch { return null; } });
  const logout = () => { try { sessionStorage.removeItem('ms-staff'); } catch { /* ignore */ } setSession(null); };
  if (!session) return <Login onLogin={(s) => { try { sessionStorage.setItem('ms-staff', JSON.stringify(s)); } catch { /* ignore */ } setSession(s); }} />;
  return <Console session={session} onLogout={logout} />;
}

function Login({ onLogin }) {
  const [id, setId] = useState('');
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    try { onLogin(await api('/staff/login', { method: 'POST', body: { staffId: id, pin } })); } catch (x) { setErr(x.message); }
  };
  const roles = ['DESK', 'DOCTOR', 'NURSE', 'PHARMACY', 'LAB', 'ADMIN'];
  return (
    <div className="login">
      <div className="login-l dots">
        <Brand />
        <div><span className="pill pill-dark">Hospital staff</span><h1 className="mt" style={{ fontSize: 'clamp(2.4rem,5vw,4rem)' }}>Staff console</h1><p className="mt" style={{ fontSize: '1.1rem' }}>Desk, doctor, triage nurse, pharmacy, lab and Medical Superintendent views. Each role sees only its own actions.</p></div>
        <form className="card card-lg col" onSubmit={submit}>
          <label className="field">Staff ID<input className="input" value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" required /></label>
          <label className="field">PIN<input className="input" type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} autoComplete="current-password" required /></label>
          {err && <p className="notice notice-red" role="alert">{err}</p>}
          <button className="btn btn-lg btn-dark">Sign in</button>
        </form>
        <div className="row"><Link className="btn btn-sm" to="/board"><Monitor size={16} aria-hidden="true" />Display board</Link><Link className="btn btn-sm" to="/phone"><Smartphone size={16} aria-hidden="true" />SMS simulator</Link><Link className="btn btn-sm" to="/staff/qr"><QrCode size={16} aria-hidden="true" />QR stickers</Link></div>
      </div>
      <div className="login-r">
        <h2 style={{ fontSize: '1.6rem' }}>Demo accounts</h2>
        <p className="muted mt mb">Prototype only — tap an account to fill it in. Open different roles in different browser tabs to see real-time updates.</p>
        {roles.map((r) => (
          <div key={r} className="mb">
            <div className="side-sec" style={{ color: 'var(--muted)', margin: '8px 0' }}>{r}</div>
            <div className="acc-grid">
              {STAFF.filter((s) => s.role === r).map((s) => (
                <button key={s.id} className="acc" aria-pressed={id === s.id} onClick={() => { setId(s.id); setPin(s.pin); }}>
                  <b>{s.name}</b><div className="muted" style={{ fontSize: '.8rem' }}>{s.id} · PIN {s.pin}</div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Console({ session, onLogout }) {
  const { staff: me, token } = session;
  const views = ROLE_VIEWS[me.role];
  const [view, setView] = useState(views[0][0]);
  const [snap, setSnap] = useState(null);
  const [toast, setToast] = useState(null);
  const [flagged, setFlagged] = useState(false);
  const now = useNow(1000);
  const timer = useRef(null);

  const load = useCallback(() => api('/staff/snapshot', { auth: token }).then(setSnap).catch((e) => { if (e.status === 401) onLogout(); }), [token]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    load();
    const on = () => { clearTimeout(timer.current); timer.current = setTimeout(load, 80); };
    socket.on('update', on); socket.on('connect', on);
    const i = setInterval(load, 15000);
    return () => { socket.off('update', on); socket.off('connect', on); clearInterval(i); };
  }, [load]);

  // Unseen flags stay pinned at the top with a repeating sound until a staff member marks them seen.
  const urgent = snap?.urgent || [];
  useEffect(() => {
    if (!urgent.length) return undefined;
    beep();
    const i = setInterval(beep, 2500);
    return () => clearInterval(i);
  }, [urgent.length]);

  const act = async (path, body, method = 'POST') => {
    try { const r = await api(path, { method, body, auth: token }); load(); return r; }
    catch (e) { setToast(e.message); setTimeout(() => setToast(null), 4000); return null; }
  };
  const myNode = me.sp ? snap?.sps.find((s) => s.id === me.sp)?.nodeId : 'G_REG';
  const raiseFlag = async () => { if (await act('/alerts', { kind: 'EMERGENCY', nodeId: myNode, source: 'STAFF', note: `Raised by ${me.name}` })) setFlagged(true); };
  const canAckEmergency = ['NURSE', 'DOCTOR'].includes(me.role);
  const title = views.find((v) => v[0] === view)?.[1];
  const props = { snap, me, act, now, token, setView };

  return (
    <div className="staff">
      <aside className="side" aria-label="Staff navigation">
        <Brand to="/staff" onDark />
        <div className="side-sec">{me.role}</div>
        {views.map(([k, l, I]) => <button key={k} className="side-link" aria-current={view === k ? 'page' : undefined} onClick={() => setView(k)}><I size={18} aria-hidden="true" />{l}</button>)}
        <div className="side-sec">Screens</div>
        <Link className="side-link" to="/board" target="_blank"><Monitor size={18} aria-hidden="true" />Display board</Link>
        <Link className="side-link" to="/phone" target="_blank"><Smartphone size={18} aria-hidden="true" />SMS simulator</Link>
        <Link className="side-link" to="/staff/qr" target="_blank"><QrCode size={18} aria-hidden="true" />QR stickers</Link>
        <div className="me">
          <b style={{ color: '#fff' }}>{me.name}</b>
          <div style={{ fontSize: '.8rem' }}>{me.role}{me.sp ? ` · ${me.sp}` : ''}</div>
          <button className="btn btn-sm mt btn-block" onClick={onLogout}><LogOut size={14} aria-hidden="true" />Sign out</button>
        </div>
      </aside>
      <div>
        {urgent.length > 0 && (
          <div className="urgent" role="alert" aria-live="assertive">
            {urgent.map((a) => (
              <div key={a.id} className={`urgent-item ${a.kind !== 'EMERGENCY' ? 'help' : ''}`}>
                {a.kind === 'EMERGENCY' ? <Siren aria-hidden="true" /> : <BellRing aria-hidden="true" />}
                <span>{KIND[a.kind]}{a.signs.length ? ` · ${a.signs.map((s) => signLabel[s] || s).join(', ')}` : ''}{a.nodeId ? ` · ${placeName('en', a.nodeId)}` : ''}{a.token ? ` · token ${a.token}` : ''}{a.note ? ` · ${a.note}` : ''}</span>
                <span className="pill" style={{ color: '#000' }}>{ago(a.raisedAt, now)}</span>
                {a.escalationLevel > 0 && <span className="pill pill-dark">Escalated → {a.escalationLevel === 1 ? 'second nurse' : 'ED in-charge'}</span>}
                {a.kind === 'EMERGENCY' && !canAckEmergency
                  ? <span className="pill" style={{ color: '#000' }}>Nurses alerted</span>
                  : <button className="btn btn-sm" onClick={() => act(`/alerts/${a.id}/ack`)}>Mark as seen</button>}
              </div>
            ))}
          </div>
        )}
        <div className="topbar">
          <h1>{title}</h1>
          <span className="grow" />
          {snap?.evacuation && <span className="pill pill-red"><ShieldAlert size={14} aria-hidden="true" />Evacuation mode ON</span>}
          <span className="pill"><Bell size={14} aria-hidden="true" />{urgent.length} unseen</span>
          <button className="btn btn-red btn-sm" onClick={raiseFlag}><Siren size={16} aria-hidden="true" />Raise emergency flag</button>
        </div>
        <div className="main">
          {!snap ? <p className="pill">Loading…</p> : (
            <>
              {view === 'doctor' && <Doctor {...props} />}
              {view === 'nurse' && <Nurse {...props} />}
              {view === 'counter' && <Counter {...props} />}
              {['register', 'lookup', 'help'].includes(view) && <Desk {...props} view={view} />}
              {['overview', 'queues', 'alerts', 'safety', 'report', 'audit'].includes(view) && <Admin {...props} view={view} />}
            </>
          )}
        </div>
      </div>
      {toast && <div className="caption" role="alert" style={{ background: 'var(--red)' }}>{toast}</div>}
      {flagged && (
        <Modal onClose={() => setFlagged(false)} label="Flag raised">
          <Siren size={40} color="var(--red)" aria-hidden="true" />
          <h2 className="q-title mt">Emergency flag sent</h2>
          <p className="mt">All nurse consoles have been alerted with your location. If it is not acknowledged in {snap?.settings.escalateSec || 60} seconds it escalates automatically.</p>
          <button className="btn btn-dark mt2" onClick={() => setFlagged(false)}>Close</button>
        </Modal>
      )}
    </div>
  );
}
