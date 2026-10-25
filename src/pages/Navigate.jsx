import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Fuse from 'fuse.js';
import { Ticket, FileText, ScanLine, MapPin, Accessibility, Search, Camera } from 'lucide-react';
import { NODES, DEPARTMENTS, SERVICE_POINTS, LANGS } from '../../shared/hospital.js';
import { matchRoomCode, placeName, floorName, nodeById } from '../../shared/logic.js';
import { t as tr } from '../../shared/i18n.js';
import { useT, usePrefs, store } from '../lib.js';
import { RouteView, useConfig, CHECKPOINTS } from '../components.jsx';

// Every searchable place with its names in all 5 languages + department names + official sign terms (F6).
const PLACES = NODES.filter((n) => ['ROOM', 'ENTRANCE', 'EXIT'].includes(n.kind)).map((n) => {
  const sp = SERVICE_POINTS.find((s) => s.nodeId === n.id && s.dept);
  const d = sp && DEPARTMENTS.find((x) => x.id === sp.dept);
  const names = LANGS.map((l) => placeName(l.code, n.id));
  if (d) names.push(...Object.values(d.names), d.sign, `${d.sign} OPD`, sp.label);
  if (n.place === 'pharmacy') names.push('dawai', 'medicine counter', 'chemist');
  if (n.place === 'lab') names.push('blood test', 'sample', 'khoon jaanch', 'G-04');
  if (n.place === 'casualty') names.push('emergency', 'casualty', 'ED');
  return { id: n.id, names };
});
const fuse = new Fuse(PLACES, { keys: ['names'], threshold: 0.38, ignoreLocation: true });

export default function NavigatePage() {
  const t = useT();
  const { prefs } = usePrefs();
  const nav = useNavigate();
  const [q] = useSearchParams();
  const cfg = useConfig();
  const [tab, setTab] = useState(q.get('tab') || 'slip');
  const [from, setFrom] = useState(q.get('cp') && nodeById[q.get('cp')] ? q.get('cp') : store.get('ms-loc') || 'G_ENT');
  const [to, setTo] = useState(nodeById[q.get('to')] ? q.get('to') : null);
  const [avoid, setAvoid] = useState(false);
  const [text, setText] = useState('');
  const [tok, setTok] = useState(store.get('ms-visit')?.token || '');
  const [age, setAge] = useState('');
  useEffect(() => { if (q.get('cp')) store.set('ms-loc', q.get('cp')); }, [q]);

  const results = useMemo(() => {
    if (!text.trim()) return [];
    const exact = matchRoomCode(text);
    const fz = fuse.search(text).slice(0, 6).map((r) => r.item.id);
    return [...new Set([...(exact ? [exact] : []), ...fz])];
  }, [text]);

  const setLoc = (id) => { setFrom(id); store.set('ms-loc', id); };
  return (
    <div className="page dots">
      <div className="wrap col" style={{ gap: 20, maxWidth: 960 }}>
        <h1 className="q-title">{t('whereGo')}</h1>
        <div className="card card-lg col">
          <div className="tabs" role="tablist">
            {[['token', Ticket, t('enterToken')], ['slip', FileText, t('paperSlip')], ['scan', ScanLine, t('scanQr')]].map(([k, I, l]) => (
              <button key={k} role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k)}><I size={16} style={{ display: 'inline', verticalAlign: '-3px' }} aria-hidden="true" /> {l}</button>
            ))}
          </div>

          {tab === 'token' && (
            <form className="row" style={{ alignItems: 'flex-end' }} onSubmit={(e) => { e.preventDefault(); const s = store.get('ms-visit'); nav(s?.token === tok.toUpperCase() ? `/visit/${s.token}?sig=${s.sig}` : `/visit/${tok.toUpperCase()}?age=${age}`); }}>
              <label className="field grow">{t('enterToken')}<input className="input" value={tok} onChange={(e) => setTok(e.target.value.toUpperCase())} placeholder="A-047" required pattern="[A-Ha-h]-?\d{1,3}" /></label>
              <label className="field" style={{ width: 120 }}>{t('age')}<input className="input" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ''))} /></label>
              <button className="btn btn-lg btn-dark"><Search aria-hidden="true" />{t('findToken')}</button>
            </form>
          )}

          {tab === 'slip' && (
            <div className="col">
              <label className="field">{t('paperSlip')}<input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('paperPh')} autoComplete="off" /></label>
              <div className="result-list" aria-live="polite">
                {results.map((id) => (
                  <button key={id} className="btn" style={{ justifyContent: 'flex-start' }} aria-pressed={to === id} onClick={() => setTo(id)}>
                    <MapPin size={18} aria-hidden="true" />{placeName(prefs.lang, id)} · {floorName(prefs.lang, nodeById[id].floor)}
                    {SERVICE_POINTS.find((s) => s.nodeId === id && s.dept) && <span className="muted"> — {DEPARTMENTS.find((d) => d.id === SERVICE_POINTS.find((s) => s.nodeId === id && s.dept).dept).names[prefs.lang]}</span>}
                  </button>
                ))}
                {text.trim() && !results.length && <p className="notice">{t('notFound')}</p>}
              </div>
            </div>
          )}

          {tab === 'scan' && <Scanner onCode={(raw) => {
            const m = String(raw).match(/(?:cp[=/])([A-Z0-9_]+)/i);
            if (m && nodeById[m[1]]) { setLoc(m[1]); setTab('slip'); return; }
            const v = String(raw).match(/\/visit\/([A-H]-\d{3})\?sig=([\w-]+)/);
            if (v) nav(`/visit/${v[1]}?sig=${v[2]}`);
          }} />}

          <hr className="rule" style={{ margin: '6px 0' }} />
          <div className="row">
            <label className="row" style={{ fontWeight: 800 }}>{t('iAmAt')}
              <select className="input" style={{ width: 'auto', minHeight: 48 }} value={from} onChange={(e) => setLoc(e.target.value)}>
                {CHECKPOINTS.map((n) => <option key={n.id} value={n.id}>{placeName(prefs.lang, n.id)} · {floorName(prefs.lang, n.floor)}</option>)}
              </select>
            </label>
            <button className="toggle" style={{ width: 'auto', minHeight: 48, boxShadow: 'none', transform: 'none' }} aria-pressed={avoid} onClick={() => setAvoid(!avoid)}><Accessibility aria-hidden="true" />{t('need_avoidStairs')} / {t('need_wheelchair')}</button>
          </div>
        </div>

        {to && (
          <div className="card card-lg">
            <h2 className="mb" style={{ fontSize: '1.7rem' }}>{tr(prefs.lang, 'destination')}: {placeName(prefs.lang, to)}</h2>
            <RouteView from={from} to={to} avoidStairs={avoid} closed={cfg?.closed || []} />
          </div>
        )}
      </div>
    </div>
  );
}

// QR scanning via the browser's built-in BarcodeDetector (no library). Hidden where unsupported.
function Scanner({ onCode }) {
  const t = useT();
  const video = useRef(null);
  const [state, setState] = useState('idle');
  const supported = 'BarcodeDetector' in window && navigator.mediaDevices?.getUserMedia;
  useEffect(() => () => video.current?.srcObject?.getTracks().forEach((x) => x.stop()), []);
  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.current.srcObject = stream; await video.current.play(); setState('on');
      const det = new window.BarcodeDetector({ formats: ['qr_code'] });
      const tick = async () => {
        if (!video.current?.srcObject) return;
        const codes = await det.detect(video.current).catch(() => []);
        if (codes[0]) { stream.getTracks().forEach((x) => x.stop()); setState('idle'); onCode(codes[0].rawValue); return; }
        requestAnimationFrame(tick);
      };
      tick();
    } catch { setState('denied'); }
  };
  if (!supported) return <p className="notice">QR scanning needs Chrome/Edge on Android or a camera. Use “{t('paperSlip')}” or pick “{t('iAmAt')}” below instead.</p>;
  return (
    <div className="col">
      <video ref={video} playsInline muted style={{ width: '100%', maxHeight: 320, borderRadius: 12, border: '2px solid #000', background: '#000', display: state === 'on' ? 'block' : 'none' }} />
      {state !== 'on' && <button className="btn btn-lg btn-dark" onClick={start}><Camera aria-hidden="true" />{t('scanQr')}</button>}
      {state === 'denied' && <p className="notice notice-red">Camera blocked. Pick your location below instead.</p>}
    </div>
  );
}
