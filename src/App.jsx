import { useEffect, useMemo, useState } from 'react';
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { Ticket, Menu } from 'lucide-react';
import { Prefs, usePrefsState, usePrefs, useT, speak, socket, store } from './lib.js';
import { Brand, PrefBar, SafetyDock, RouteView, useConfig } from './components.jsx';
import { NODES } from '../shared/hospital.js';
import { findRoute } from '../shared/logic.js';
import Landing from './pages/Landing.jsx';
import Register from './pages/Register.jsx';
import Visit from './pages/Visit.jsx';
import Navigate_ from './pages/Navigate.jsx';
import Emergency from './pages/Emergency.jsx';
import Board from './pages/Board.jsx';
import PhoneSim from './pages/PhoneSim.jsx';
import QrSheet from './pages/QrSheet.jsx';
import Staff from './staff/Staff.jsx';

function PublicNav() {
  const t = useT();
  return (
    <>
      <PrefBar />
      <header className="nav no-print">
        <div className="wrap">
          <Brand />
          <nav className="nav-links" aria-label="Main">
            <a href="/#how">How it works</a>
            <a href="/#features">Features</a>
            <Link to="/navigate">{t('whereGo')}</Link>
            <Link to="/board">Display board</Link>
            <Link to="/staff">Staff</Link>
          </nav>
          <Link to="/register" className="btn btn-dark nav-cta" style={{ marginInlineStart: 'auto' }}><Ticket size={18} aria-hidden="true" />{t('startToken')}</Link>
          <details className="nav-menu">
            <summary className="btn btn-icon" aria-label="Menu"><Menu aria-hidden="true" /></summary>
            <div className="nav-menu-panel" onClick={(e) => { e.currentTarget.closest('details').open = false; }}>
              <Link to="/register" className="btn btn-dark btn-block"><Ticket size={18} aria-hidden="true" />{t('startToken')}</Link>
              <a href="/#how">How it works</a>
              <a href="/#features">Features</a>
              <Link to="/navigate">{t('whereGo')}</Link>
              <Link to="/navigate?tab=token">{t('trackToken')}</Link>
              <Link to="/board">Display board</Link>
              <Link to="/staff">Staff</Link>
            </div>
          </details>
        </div>
      </header>
    </>
  );
}

function Caption() {
  const [text, setText] = useState('');
  useEffect(() => {
    let tm;
    const on = (e) => { setText(e.detail); clearTimeout(tm); tm = setTimeout(() => setText(''), 6000); };
    window.addEventListener('ms-caption', on);
    return () => window.removeEventListener('ms-caption', on);
  }, []);
  return text ? <div className="caption no-print" role="status" aria-live="polite">{text}</div> : null;
}

// Evacuation mode (S5): every patient screen switches to the nearest step-free exit.
function Evacuation({ closed }) {
  const t = useT();
  const from = store.get('ms-loc') || store.get('ms-visit')?.nodeId || 'G_ENT';
  const exit = useMemo(() => {
    const exits = NODES.filter((n) => n.kind === 'EXIT' || n.kind === 'ENTRANCE');
    return exits.map((n) => ({ id: n.id, r: findRoute(from, n.id, { avoidStairs: true, closed }) })).filter((x) => x.r).sort((a, b) => a.r.metres - b.r.metres)[0];
  }, [from, closed]);
  useEffect(() => { speak(`${t('evacTitle')}. ${t('evacBody')}`, store.get('ms-prefs')?.lang || 'en'); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="evac" role="alertdialog" aria-label={t('evacTitle')}>
      <div className="wrap col" style={{ maxWidth: 860 }}>
        <h1 style={{ fontSize: 'clamp(2.2rem,6vw,4rem)' }}>{t('evacTitle')}</h1>
        <p style={{ fontSize: '1.3rem', color: '#fff' }}>{t('evacBody')}</p>
        <div className="card card-lg">{exit ? <RouteView from={from} to={exit.id} avoidStairs closed={closed} compact /> : <p className="notice notice-red">{t('noStepFree')}</p>}</div>
      </div>
    </div>
  );
}

function Shell() {
  const loc = useLocation();
  const { prefs } = usePrefs();
  const cfg = useConfig();
  const [evac, setEvac] = useState(false);
  useEffect(() => setEvac(!!cfg?.evacuation), [cfg?.evacuation]);
  useEffect(() => { const on = ({ on: v }) => setEvac(v); socket.on('evacuation', on); return () => socket.off('evacuation', on); }, []);

  // Optional voice: when ON, any button/link speaks its label on click. OFF by default.
  useEffect(() => {
    if (!prefs.voice) return undefined;
    const on = (e) => {
      const el = e.target.closest('button, a, [role="tab"], [role="button"]');
      if (!el || el.closest('[data-nospeak]') || el.hasAttribute('data-nospeak')) return;
      const text = el.getAttribute('aria-label') || el.innerText;
      if (text?.trim()) speak(text.trim().replace(/\s+/g, ' '), prefs.lang);
    };
    document.addEventListener('click', on, true);
    return () => document.removeEventListener('click', on, true);
  }, [prefs.voice, prefs.lang]);

  const isStaff = loc.pathname.startsWith('/staff') && loc.pathname !== '/staff/qr';
  const isBoard = loc.pathname.startsWith('/board');
  const isRed = loc.pathname.startsWith('/emergency');
  return (
    <>
      <a href="#main" className="sr-only">Skip to content</a>
      {!isStaff && !isBoard && <PublicNav />}
      <main id="main">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/register" element={<Register />} />
          <Route path="/visit/:token" element={<Visit />} />
          <Route path="/navigate" element={<Navigate_ />} />
          <Route path="/track" element={<Navigate to="/navigate?tab=token" replace />} />
          <Route path="/emergency" element={<Emergency />} />
          <Route path="/board" element={<Board />} />
          <Route path="/phone" element={<PhoneSim />} />
          <Route path="/staff/qr" element={<QrSheet />} />
          <Route path="/staff/*" element={<Staff />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {!isRed && <SafetyDock showHelp={!isStaff && !isBoard} />}
      <Caption />
      {evac && !isStaff && !isBoard && <Evacuation closed={cfg?.closed || []} />}
    </>
  );
}

export default function App() {
  const [prefs, setPrefs] = usePrefsState();
  return (
    <Prefs.Provider value={{ prefs, setPrefs }}>
      <Shell />
    </Prefs.Provider>
  );
}
