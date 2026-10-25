import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Stethoscope, Eye, Bone, Baby, HeartPulse, Hand, Smile, Ear, HeartCrack, Wind, Droplets, BedSingle, Brain, Bandage, Flame,
  Siren, HandHelping, Volume2, VolumeX, Contrast, Type, Accessibility, Footprints, EarOff, EyeOff, UserRound, X, Check,
  ArrowUp, CornerUpLeft, CornerUpRight, MapPin, Navigation, Phone, Map as MapIcon, Baby as Pregnant, TriangleAlert, Clock,
} from 'lucide-react';
import { LANGS, NODES, EDGES, FLOORS, DANGER_SIGNS } from '../shared/hospital.js';
import { findRoute, nodeById, stepText, placeName, floorName, edgeClosed } from '../shared/logic.js';
import { usePrefs, useT, speak, sendAlert, api, store, socket, fmtTime } from './lib.js';
import { t as tr } from '../shared/i18n.js';

export const ICONS = { Stethoscope, Eye, Bone, Baby, HeartPulse, Hand, Smile, Ear, HeartCrack, Wind, Droplets, BedSingle, Brain, Bandage, Flame };
export const Icon = ({ name, size = 24, ...p }) => { const C = ICONS[name] || Stethoscope; return <C size={size} aria-hidden="true" {...p} />; };

export const NEED_ICONS = { avoidStairs: Footprints, wheelchair: Accessibility, lowVision: EyeOff, hearing: EarOff, needsHelper: HandHelping, largeText: Type, pregnant: Pregnant };
export function NeedsIcons({ needs, labels = true }) {
  const on = Object.entries(needs || {}).filter(([k, v]) => v && k !== 'largeText');
  if (!on.length) return null;
  const L = { avoidStairs: 'No stairs', wheelchair: 'Wheelchair', lowVision: 'Low vision', hearing: 'Hearing', needsHelper: 'Helper', pregnant: 'Pregnant' };
  return <span className="needs-icons">{on.map(([k]) => { const C = NEED_ICONS[k]; return <span key={k} title={L[k]}><C size={14} aria-hidden="true" />{labels && L[k]}</span>; })}</span>;
}

// Dark logo on light backgrounds, lime logo on dark backgrounds (staff sidebar, board, footer).
export function Brand({ to = '/', onDark = false }) {
  return (
    <Link to={to} className="brand" aria-label="Wardly home">
      <img className="mark" src={onDark ? '/icon-lime.svg' : '/icon.svg'} alt="" />Wardly
    </Link>
  );
}

export function SpeakBtn({ text, label, className = 'btn btn-sm btn-icon' }) {
  const { prefs } = usePrefs();
  const t = useT();
  return (
    <button type="button" className={className} data-nospeak onClick={(e) => { e.stopPropagation(); speak(text, prefs.lang); }} aria-label={`${label || t('readAloud')}: ${text}`} title={t('readAloud')}>
      <Volume2 size={18} aria-hidden="true" />
    </button>
  );
}

// Language, text size, contrast and the optional voice toggle (voice is OFF unless the user turns it on).
export function PrefBar() {
  const { prefs, setPrefs } = usePrefs();
  const t = useT();
  return (
    <div className="prefbar no-print" role="region" aria-label="Display and language settings">
      <div className="wrap">
        <span className="sr-only">{t('chooseLanguage')}</span>
        {LANGS.map((l) => (
          <button key={l.code} lang={l.code} aria-pressed={prefs.lang === l.code} onClick={() => setPrefs({ lang: l.code })}>{l.native}</button>
        ))}
        <span className="sep" aria-hidden="true" />
        <span aria-hidden="true"><Type size={16} /></span>
        {[0, 1, 2].map((s) => <button key={s} aria-pressed={prefs.size === s} aria-label={`${t('textSize')} ${s + 1}`} onClick={() => setPrefs({ size: s })} style={{ fontSize: 12 + s * 3 }}>A</button>)}
        <button aria-pressed={prefs.contrast} onClick={() => setPrefs({ contrast: !prefs.contrast })}><Contrast size={14} style={{ display: 'inline', verticalAlign: '-2px' }} aria-hidden="true" /> {t('contrast')}</button>
        <button aria-pressed={prefs.voice} data-nospeak onClick={() => { const v = !prefs.voice; setPrefs({ voice: v }); if (v) speak(t('voice'), prefs.lang); else speechSynthesis?.cancel(); }}>
          {prefs.voice ? <Volume2 size={14} style={{ display: 'inline', verticalAlign: '-2px' }} aria-hidden="true" /> : <VolumeX size={14} style={{ display: 'inline', verticalAlign: '-2px' }} aria-hidden="true" />} {t('voice')}: {prefs.voice ? 'ON' : 'OFF'}
        </button>
      </div>
    </div>
  );
}

export function Modal({ onClose, children, label }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

// Emergency + "I need urgent help" on every screen, before and after registration.
export function SafetyDock({ showHelp = true }) {
  const t = useT();
  const nav = useNavigate();
  const [ask, setAsk] = useState(false);
  const [sent, setSent] = useState(null);
  const send = async () => {
    const v = store.get('ms-visit');
    const r = await sendAlert({ kind: 'HELP', token: v?.token, nodeId: store.get('ms-loc'), source: 'PHONE' }).catch(() => 'sent');
    setSent(r); setAsk(false);
  };
  return (
    <>
      <div className="dock no-print">
        <button className="btn btn-red" onClick={() => nav('/emergency?src=button')}><Siren size={20} aria-hidden="true" />{t('emergency')} · 112</button>
        {showHelp && <button className="btn btn-y" onClick={() => setAsk(true)}><HandHelping size={20} aria-hidden="true" />{t('urgentHelp')}</button>}
      </div>
      {ask && (
        <Modal onClose={() => setAsk(false)} label={t('urgentHelp')}>
          <h2 className="q-title">{t('helpConfirm')}</h2>
          <div className="row mt2">
            <button className="btn btn-lg btn-dark grow" onClick={send} autoFocus><HandHelping aria-hidden="true" />{t('sendFlag')}</button>
            <button className="btn btn-lg" onClick={() => setAsk(false)}>{t('no')}</button>
          </div>
          <p className="notice notice-red mt"><Siren size={20} aria-hidden="true" />{t('dangerCta')}</p>
        </Modal>
      )}
      {sent && (
        <Modal onClose={() => setSent(null)} label={t('helpTitle')}>
          <div className="iconbox" style={{ background: 'var(--y)', width: 64, height: 64 }}><Check size={34} aria-hidden="true" /></div>
          <h2 className="q-title mt">{t('helpTitle')}</h2>
          <p className="mt" style={{ fontSize: '1.15rem' }}>{sent === 'queued' ? t('emQueued') : t('helpBody')}</p>
          <div className="row mt2">
            <button className="btn btn-red btn-lg" onClick={() => { setSent(null); nav('/emergency?src=button'); }}><Siren aria-hidden="true" />{t('emergency')}</button>
            <a className="btn btn-lg" href="tel:112"><Phone aria-hidden="true" />{t('call112')}</a>
            <button className="btn btn-lg btn-ghost" onClick={() => setSent(null)}>{t('close')}</button>
          </div>
        </Modal>
      )}
    </>
  );
}

// Danger-sign list. Tapping any sign goes straight to the red screen: no token, no form.
export function DangerSigns({ onSign, onNone, title, compact }) {
  const t = useT();
  const { prefs } = usePrefs();
  return (
    <div className="col" style={{ gap: 16 }}>
      {title && <h2 className="q-title">{title}</h2>}
      {!compact && <p style={{ fontSize: '1.1rem' }}>{t('dangerIntro')}</p>}
      <div className="danger-grid">
        {DANGER_SIGNS.map((s) => (
          <div key={s.id} style={{ position: 'relative' }}>
            <button className="danger" style={{ width: '100%', paddingInlineEnd: 56 }} onClick={() => onSign(s.id)}>
              <span className="iconbox"><Icon name={s.icon} /></span>
              <span className="grow">{t(`sign_${s.id}`)}</span>
            </button>
            <span style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', insetInlineEnd: 10 }}><SpeakBtn text={t(`sign_${s.id}`)} className="btn btn-sm btn-icon btn-ghost" /></span>
          </div>
        ))}
      </div>
      <div className="cta-red" role="note"><Siren size={30} aria-hidden="true" /><span className="grow">{t('dangerCta')}</span><SpeakBtn text={t('dangerCta')} /></div>
      {onNone && <button className="btn btn-lg btn-dark" onClick={onNone}>{t('dangerNone')} <span aria-hidden="true">{prefs.lang === 'ur' || prefs.lang === 'ks' ? '←' : '→'}</span></button>}
    </div>
  );
}

export function useConfig() {
  const [cfg, setCfg] = useState(() => store.get('ms-config'));
  useEffect(() => {
    let alive = true;
    const load = () => api('/config').then((c) => { if (alive) { setCfg(c); store.set('ms-config', c); } }).catch(() => {});
    const onUpdate = ({ scopes }) => { if (scopes.some((s) => ['nav', 'evacuation', 'settings', 'all', 'queues'].includes(s))) load(); };
    load();
    socket.on('update', onUpdate);
    return () => { alive = false; socket.off('update', onUpdate); };
  }, []);
  return cfg;
}

const STEP_ICON = { lift: ArrowUp, stairs: Footprints, arrive: MapPin, here: MapPin, walk: Navigation };

// Landmark directions + optional map. Computed in the browser, so it still works offline (emergency fail-safe).
export function RouteView({ from = 'G_ENT', to, avoidStairs, closed = [], onNoRoute, compact }) {
  const t = useT();
  const { prefs } = usePrefs();
  const [showMap, setShowMap] = useState(false);
  const route = useMemo(() => (to ? findRoute(from, to, { avoidStairs, closed }) : null), [from, to, avoidStairs, closed.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (to && !route && onNoRoute) onNoRoute(); }, [route, to]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!to) return null;
  if (!route) return <div className="notice notice-red"><TriangleAlert aria-hidden="true" /><b>{t('noStepFree')}</b></div>;
  const texts = route.steps.map((s) => stepText(prefs.lang, s));
  const dest = nodeById[to];
  const line = FLOORS[dest.floor];
  return (
    <div className="col">
      <div className="row between">
        <div className="row">
          <span className="pill pill-dark"><Footprints size={14} aria-hidden="true" />{route.metres} m · {route.etaMin} {t('walkMin')}</span>
          <span className="line-chip"><i style={{ background: line.colour }} />{t('follow')} {t(`line_${line.line}`)}</span>
          {avoidStairs && <span className="pill pill-sage"><Accessibility size={14} aria-hidden="true" />{t('need_avoidStairs')}</span>}
        </div>
        <div className="row">
          <button className="btn btn-sm" onClick={() => speak(texts.join('. '), prefs.lang)}><Volume2 size={16} aria-hidden="true" />{t('readAloud')}</button>
          {!compact && <button className="btn btn-sm" aria-pressed={showMap} onClick={() => setShowMap(!showMap)}><MapIcon size={16} aria-hidden="true" />{showMap ? t('hideMap') : t('showMap')}</button>}
        </div>
      </div>
      <ol className="steps">
        {route.steps.map((s, i) => {
          const C = s.turn === 'left' ? CornerUpLeft : s.turn === 'right' ? CornerUpRight : STEP_ICON[s.t];
          return (
            <li key={i} className={i === route.steps.length - 1 ? 'last' : ''}>
              <span className="num">{i + 1}</span><C size={22} aria-hidden="true" />
              <span className="grow">{texts[i]}{s.lm && s.t === 'walk' ? <small className="muted"> — {t('near')} {t(`lm_${s.lm}`)}</small> : null}</span>
              <SpeakBtn text={texts[i]} className="btn btn-sm btn-icon btn-ghost" />
            </li>
          );
        })}
      </ol>
      {(showMap || compact) && <FloorMap route={route} closed={closed} />}
    </div>
  );
}

// SVG floor plan generated from seed coordinates (no tiles, no paid maps).
export function FloorMap({ route, closed = [], highlight }) {
  const t = useT();
  const { prefs } = usePrefs();
  const floors = route ? route.floors : [0];
  const [floor, setFloor] = useState(floors[0]);
  useEffect(() => setFloor(floors[0]), [route]); // eslint-disable-line react-hooks/exhaustive-deps
  const nodes = NODES.filter((n) => n.floor === floor);
  const edges = EDGES.filter((e) => e.kind === 'WALK' && nodeById[e.from].floor === floor);
  const pts = route ? route.path.map((id) => nodeById[id]).filter((n) => n.floor === floor) : [];
  const start = route && nodeById[route.path[0]], end = route && nodeById[route.path.at(-1)];
  const line = FLOORS[floor];
  return (
    <div className="map">
      <div className="row" style={{ padding: 10, borderBottom: '2px solid #000', background: '#fff' }} role="tablist" aria-label="Floors">
        {FLOORS.map((f) => (
          <button key={f.n} role="tab" className="tab" aria-selected={floor === f.n} onClick={() => setFloor(f.n)}>
            {floorName(prefs.lang, f.n)}{route?.floors.includes(f.n) ? ' •' : ''}
          </button>
        ))}
        <span className="line-chip" style={{ marginInlineStart: 'auto' }}><i style={{ background: line.colour }} />{t(`line_${line.line}`)}</span>
      </div>
      <svg viewBox="0 0 1000 600" role="img" aria-label={`${floorName(prefs.lang, floor)} map`}>
        <rect x="10" y="10" width="980" height="580" rx="16" fill="#fff" stroke="#000" strokeWidth="3" />
        {edges.map((e) => {
          const a = nodeById[e.from], b = nodeById[e.to];
          const shut = edgeClosed(e, closed);
          return <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={shut ? '#d62828' : '#cfd6d3'} strokeWidth={shut ? 6 : 26} strokeDasharray={shut ? '12 8' : undefined} strokeLinecap="round" />;
        })}
        {edges.map((e) => { const a = nodeById[e.from], b = nodeById[e.to]; return edgeClosed(e, closed) ? null : <line key={`c${e.id}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={line.colour} strokeWidth="3" opacity=".55" />; })}
        {pts.length > 1 && <polyline points={pts.map((n) => `${n.x},${n.y}`).join(' ')} fill="none" stroke="#000" strokeWidth="14" strokeLinejoin="round" strokeLinecap="round" />}
        {pts.length > 1 && <polyline points={pts.map((n) => `${n.x},${n.y}`).join(' ')} fill="none" stroke="#ffe17c" strokeWidth="6" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="2 14" />}
        {nodes.map((n) => {
          const label = n.kind === 'JUNCTION' ? (n.lm ? t(`lm_${n.lm}`) : '') : placeName(prefs.lang, n.id);
          const isRoom = ['ROOM', 'ENTRANCE', 'EXIT'].includes(n.kind);
          const fill = n.place === 'casualty' ? '#d62828' : n.kind === 'LIFT' ? '#b7c6c2' : n.kind === 'STAIRS' ? '#e9ecef' : n.kind === 'JUNCTION' ? '#ffe17c' : highlight === n.id ? '#ffe17c' : '#fff';
          return (
            <g key={n.id}>
              {isRoom || n.kind === 'LIFT' || n.kind === 'STAIRS'
                ? <rect x={n.x - 52} y={n.y - 22} width="104" height="44" rx="8" fill={fill} stroke="#000" strokeWidth="2.5" />
                : <circle cx={n.x} cy={n.y} r="11" fill={fill} stroke="#000" strokeWidth="2.5" />}
              <text x={n.x} y={isRoom || n.kind === 'LIFT' || n.kind === 'STAIRS' ? n.y + 5 : n.y - 18} textAnchor="middle" fontSize={label.length > 14 ? 11 : 13} fontWeight="800" fill={n.place === 'casualty' ? '#fff' : '#000'}>{label.length > 18 ? label.slice(0, 17) + '…' : label}</text>
            </g>
          );
        })}
        {start && start.floor === floor && <g><circle cx={start.x} cy={start.y} r="18" fill="#000" /><text x={start.x} y={start.y + 5} textAnchor="middle" fill="#ffe17c" fontWeight="900" fontSize="14">●</text><text x={start.x} y={start.y + 44} textAnchor="middle" fontWeight="900" fontSize="13">You are here</text></g>}
        {end && end.floor === floor && <g><circle cx={end.x} cy={end.y - 34} r="14" fill="#ffe17c" stroke="#000" strokeWidth="3" /><text x={end.x} y={end.y - 29} textAnchor="middle" fontWeight="900" fontSize="14">★</text></g>}
      </svg>
    </div>
  );
}

export const CHECKPOINTS = NODES.filter((n) => n.cp);

// Expected clock time of the patient's turn, from live service-time data at that counter.
export function TurnTime({ est, lang }) {
  const t = (k, v) => tr(lang, k, v);
  if (!est?.turnFrom) return null;
  return (
    <div className="turn">
      <span className="iconbox"><Clock aria-hidden="true" /></span>
      <div className="col" style={{ gap: 2 }}>
        <span className="turn-l">{t('expectedTurn')}</span>
        <span className="turn-t">{fmtTime(est.turnFrom)} – {fmtTime(est.turnTo)}</span>
        <small className="muted">{est.samples ? t('basisData', { n: est.samples, m: est.avgMin }) : t('basisDefault', { m: est.avgMin })}</small>
      </div>
    </div>
  );
}

export function UserBadge({ name }) {
  return <span className="pill"><UserRound size={14} aria-hidden="true" />{name}</span>;
}
export { X, Check };
