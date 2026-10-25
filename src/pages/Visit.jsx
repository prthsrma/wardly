import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { BellRing, Coffee, HeartPulse, Info, MapPin, Navigation, Settings2, WifiOff, CalendarClock, Check, Footprints, Users, TriangleAlert, Ticket } from 'lucide-react';
import { DEPARTMENTS } from '../../shared/hospital.js';
import { placeName, floorName, nodeById } from '../../shared/logic.js';
import { api, useT, usePrefs, socket, store, speak, playSequence, fmtTime, minsAgo, useNow } from '../lib.js';
import { RouteView, DangerSigns, Modal, NEED_ICONS, SpeakBtn, useConfig, CHECKPOINTS, TurnTime } from '../components.jsx';
import { Slip } from './Register.jsx';

const NEEDS = ['avoidStairs', 'wheelchair', 'lowVision', 'hearing', 'needsHelper', 'largeText', 'pregnant'];

export default function Visit() {
  const { token } = useParams();
  const [q] = useSearchParams();
  const t = useT();
  const { prefs, setPrefs } = usePrefs();
  const nav = useNavigate();
  const cfg = useConfig();
  useNow(30000); // re-render so "updated N min ago" stays current offline
  const saved = store.get('ms-visit');
  const sig = q.get('sig') || (saved?.token === token ? saved.sig : null);
  const age = q.get('age');
  const [v, setV] = useState(() => (store.get('ms-last')?.token === token ? store.get('ms-last') : null));
  const [offline, setOffline] = useState(false);
  const [err, setErr] = useState('');
  const [called, setCalled] = useState(null);
  const [worse, setWorse] = useState(false);
  const [showRoute, setShowRoute] = useState(false);
  const [editNeeds, setEditNeeds] = useState(false);
  const [from, setFrom] = useState(store.get('ms-loc') || 'G_ENT');

  const qs = sig ? `sig=${encodeURIComponent(sig)}` : `age=${encodeURIComponent(age || '')}`;
  const load = useCallback(() => api(`/visits/${token}?${qs}`).then((x) => {
    setV(x); setOffline(false); setErr('');
    store.set('ms-last', x);
    store.set('ms-visit', { token: x.token, sig: x.sig, nodeId: x.current?.nodeId });
    if (x.lang !== prefs.lang && !store.get('ms-langset')) { setPrefs({ lang: x.lang }); store.set('ms-langset', true); }
  }).catch((e) => { if (e.status) setErr(e.message); else setOffline(true); }), [token, qs]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const on = () => load(); socket.on('update', on); socket.on('connect', on); return () => { socket.off('update', on); socket.off('connect', on); }; }, [load]);
  useEffect(() => { const off = () => setOffline(true); socket.on('disconnect', off); return () => socket.off('disconnect', off); }, []);
  // Called: flashing full-screen banner + vibration (hearing) + spoken call (if voice on).
  useEffect(() => {
    const on = (c) => {
      if (c.token !== token) return;
      setCalled(c);
      navigator.vibrate?.([500, 200, 500, 200, 900]);
      if (prefs.voice) playSequence(prefs.lang, [{ key: 'w_token', text: t('w_token') }, { key: `tok_${c.token}`, text: c.token.replace('-', ' ') }, { key: 'w_pleaseGo', text: t('w_pleaseGo') }, { key: `node_${c.nodeId}`, text: placeName(prefs.lang, c.nodeId) }]);
    };
    socket.on('called', on);
    return () => socket.off('called', on);
  }, [token, prefs.lang, prefs.voice]); // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return <div className="page"><div className="wrap flow-card card card-lg"><TriangleAlert aria-hidden="true" /><h1 className="q-title mt">{t('notFound')}</h1><p className="mt">{err}</p><Link className="btn btn-dark mt" to="/navigate?tab=token">{t('findToken')}</Link></div></div>;
  if (!v) return <div className="page"><div className="wrap"><p className="pill">Loading…</p></div></div>;

  const c = v.current;
  const dept = DEPARTMENTS.find((d) => d.id === v.deptId);
  const step = v.needs.avoidStairs || v.needs.wheelchair;
  const statusKey = v.status === 'COMPLETED' ? 'COMPLETED' : v.status === 'TOMORROW' ? 'TOMORROW' : v.status === 'REISSUE' ? 'REISSUE' : c?.status || 'WAITING';
  const sayStatus = () => {
    const parts = [`${t('yourToken')} ${v.token}`, t(`status_${statusKey}`)];
    if (c) parts.push(`${t('goTo')} ${placeName(prefs.lang, c.nodeId)}, ${floorName(prefs.lang, c.floor)}`);
    if (c?.est) parts.push(c.est.next ? t('youAreNext') : `${c.est.ahead} ${t('peopleAhead')}, ${c.est.low}–${c.est.high} ${t('minutes')}`);
    if (c?.est?.turnFrom) parts.push(`${t('expectedTurn')} ${fmtTime(c.est.turnFrom)} – ${fmtTime(c.est.turnTo)}`);
    speak(parts.join('. '), prefs.lang);
  };

  return (
    <div className="page" style={{ background: 'var(--paper)' }}>
      <div className="wrap col" style={{ gap: 20 }}>
        {offline && <div className="notice notice-y" role="status"><WifiOff aria-hidden="true" />{t('offline')} · {t('updatedAgo')} {minsAgo(v.updatedAt)} {t('minAgo')}</div>}
        {v.recheckPending && c && (
          <div className="card card-lg" style={{ borderColor: 'var(--red)' }}>
            <DangerSigns compact title={t('recheckTitle')}
              onSign={(s) => api(`/visits/${token}/recheck?${qs}`, { method: 'POST', body: { signs: [s] } }).catch(() => {}).finally(() => nav(`/emergency?signs=${s}&src=worse`))}
              onNone={() => api(`/visits/${token}/recheck?${qs}`, { method: 'POST', body: { signs: [] } }).then(load).catch(() => {})} />
          </div>
        )}

        <div className="status-hero">
          <div className={`card card-lg ${c?.status === 'CALLED' ? 'card-y' : ''}`}>
            <div className="row between">
              <span className="pill pill-dark"><Ticket size={14} aria-hidden="true" />{t('yourToken')}</span>
              <span className="pill">{offline ? <><WifiOff size={14} aria-hidden="true" />{fmtTime(v.updatedAt)}</> : <><span style={{ width: 8, height: 8, borderRadius: 9, background: 'var(--green)', display: 'inline-block' }} />{t('live')}</>}</span>
            </div>
            <div className="token-big mt">{v.token}</div>
            <div className="row mt">
              <b style={{ fontSize: '1.2rem' }}>{dept.names[prefs.lang]}</b>{dept.sign !== dept.names[prefs.lang] && <span className="muted">({dept.sign})</span>}
              {c?.lane === 'PRIORITY' && <span className="pill pill-sage">Priority lane</span>}
            </div>
            <h2 className="mt2" style={{ fontSize: 'clamp(1.8rem,4vw,2.6rem)' }}>{t(`status_${statusKey}`)}</h2>

            {v.status === 'TOMORROW' && <div className="notice notice-y mt"><CalendarClock aria-hidden="true" /><b>{t('arriveBetween')} {fmtTime(v.arrivalWindow.from)} – {fmtTime(v.arrivalWindow.to)}, {new Date(v.arrivalWindow.from).toLocaleDateString('en-IN')}</b></div>}
            {v.status === 'REISSUE' && <div className="notice notice-red mt"><Info aria-hidden="true" />{t('status_REISSUE')}</div>}
            {c?.status === 'MISSED' && v.status !== 'REISSUE' && <div className="notice notice-red mt"><Info aria-hidden="true" />{t('missedBody')}</div>}

            {c && v.status === 'ACTIVE' && (
              <>
                <dl className="kv">
                  <div><dt>{c.status === 'WAITING' ? t('goTo') : t('calledFlash')}</dt><dd>{placeName(prefs.lang, c.nodeId)}</dd></div>
                  <div><dt>{t('floor')}</dt><dd>{floorName(prefs.lang, c.floor)}</dd></div>
                  {c.status === 'WAITING' && <div><dt>{t('peopleAhead')}</dt><dd>{c.est.ahead}</dd></div>}
                  {c.status === 'WAITING' && <div><dt>{t('approxWait')}</dt><dd>{c.est.next ? t('youAreNext') : `${c.est.low}–${c.est.high} ${t('minutes')}`}</dd></div>}
                  {c.spLabel && <div><dt>{t('doctor')}</dt><dd>{c.spLabel}</dd></div>}                </dl>
                {c.status === 'WAITING' && <TurnTime est={c.est} lang={prefs.lang} />}
                {c.spStatus === 'BREAK' && <div className="notice notice-y mt"><Coffee aria-hidden="true" />{t('spBreak')} {fmtTime(c.breakUntil)}</div>}
                {c.spStatus === 'ROUND' && <div className="notice notice-y mt"><Footprints aria-hidden="true" />{t('spRound')}</div>}
                {c.spStatus === 'ABSENT' && <div className="notice notice-red mt"><Users aria-hidden="true" />{t('spAbsent')}</div>}
                {c.waitAnywhere && <div className="notice notice-sage mt"><Coffee aria-hidden="true" />{t('waitAnywhere')}</div>}
              </>
            )}
            <div className="actions mt2">
              {c && v.status === 'ACTIVE' && <button className="btn btn-lg btn-dark" aria-expanded={showRoute} onClick={() => setShowRoute(!showRoute)}><Navigation aria-hidden="true" />{t('takeMeThere')}</button>}
              <button className="btn btn-lg" onClick={sayStatus}><BellRing aria-hidden="true" />{t('readAloud')}</button>
              {v.status === 'ACTIVE' && <button className="btn btn-lg btn-red" onClick={() => setWorse(true)}><HeartPulse aria-hidden="true" />{t('feelWorse')}</button>}
            </div>
          </div>

          <div className="col" style={{ gap: 16 }}>
            <div className="card">
              <h3 style={{ fontSize: '1.3rem' }}>{t('journey')}</h3>
              <ol className="timeline mt">
                {v.history.map((h, i) => (
                  <li key={i}><span className={`dot ${h.status === 'DONE' ? 'done' : ['WAITING', 'CALLED', 'IN_SERVICE', 'MISSED'].includes(h.status) ? 'now' : ''}`}>{h.status === 'DONE' && <Check size={13} aria-hidden="true" />}</span>
                    <span className="grow">{t(`stage_${h.type}`)} · {placeName(prefs.lang, h.nodeId)}</span>{h.doneAt && <small className="muted">{fmtTime(h.doneAt)}</small>}</li>
                ))}
                {v.plan.map((p, i) => <li key={`p${i}`}><span className="dot" /><span className="grow muted">{t('nextStep')}: {t(`stage_${p === 'RETURN' ? 'DOCTOR' : p}`)}</span></li>)}
                {!v.history.length && v.status === 'TOMORROW' && <li><span className="dot now" />{t('status_TOMORROW')}</li>}
              </ol>
            </div>
            <div className="card">
              <div className="row between"><h3 style={{ fontSize: '1.3rem' }}>{t('myNeeds')}</h3><button className="btn btn-sm btn-icon" aria-label={t('myNeeds')} onClick={() => setEditNeeds(true)}><Settings2 size={16} aria-hidden="true" /></button></div>
              <div className="row mt" style={{ gap: 8 }}>
                {NEEDS.filter((k) => v.needs[k]).map((k) => { const I = NEED_ICONS[k]; return <span key={k} className="pill pill-y"><I size={14} aria-hidden="true" />{t(`need_${k}`)}</span>; })}
                {!NEEDS.some((k) => v.needs[k]) && <span className="muted">—</span>}
              </div>
            </div>
            <div className="notice"><Info aria-hidden="true" /><span className="grow">{t('transparency')}</span><SpeakBtn text={t('transparency')} /></div>
          </div>
        </div>

        {showRoute && c && (
          <div className="card card-lg">
            <div className="row between mb">
              <h2 style={{ fontSize: '1.6rem' }}><MapPin style={{ display: 'inline', verticalAlign: '-4px' }} aria-hidden="true" /> {placeName(prefs.lang, c.nodeId)}</h2>
              <label className="row" style={{ fontWeight: 800 }}>{t('iAmAt')}
                <select className="input" style={{ width: 'auto', minHeight: 44 }} value={from} onChange={(e) => { setFrom(e.target.value); store.set('ms-loc', e.target.value); }}>
                  {CHECKPOINTS.map((n) => <option key={n.id} value={n.id}>{placeName(prefs.lang, n.id)} · {floorName(prefs.lang, n.floor)}</option>)}
                </select>
              </label>
            </div>
            <RouteView from={from} to={c.nodeId} avoidStairs={step} closed={cfg?.closed || []} />
          </div>
        )}

        {v.status === 'COMPLETED' && <Feedback v={v} qs={qs} />}
        {v.status !== 'COMPLETED' && <details className="no-print"><summary style={{ cursor: 'pointer', fontWeight: 800 }}>{t('print')}</summary><div className="mt"><Slip visit={v} /><button className="btn mt" onClick={() => window.print()}>{t('print')}</button></div></details>}
      </div>

      {called && (
        <div className="called" role="alertdialog" aria-label={t('status_CALLED')} onClick={() => setCalled(null)}>
          <div>
            <BellRing size={80} style={{ margin: '0 auto' }} aria-hidden="true" />
            <div className="token-big">{called.token}</div>
            <h1 style={{ fontSize: 'clamp(2rem,6vw,4rem)' }}>{t('status_CALLED')}</h1>
            <p style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: 12 }}>{t('calledFlash')}: {placeName(prefs.lang, called.nodeId)}, {floorName(prefs.lang, nodeById[called.nodeId].floor)}</p>
            <button className="btn btn-lg btn-dark mt2" onClick={() => { setCalled(null); setShowRoute(true); }}><Navigation aria-hidden="true" />{t('takeMeThere')}</button>
          </div>
        </div>
      )}
      {worse && (
        <Modal onClose={() => setWorse(false)} label={t('feelWorse')}>
          <DangerSigns compact title={t('feelWorse')} onSign={(s) => { setWorse(false); nav(`/emergency?signs=${s}&src=worse`); }} />
        </Modal>
      )}
      {editNeeds && (
        <Modal onClose={() => setEditNeeds(false)} label={t('myNeeds')}>
          <h2 className="q-title">{t('needsTitle')}</h2>
          <div className="col mt">
            {NEEDS.map((k) => {
              const I = NEED_ICONS[k];
              return <button key={k} className="toggle" aria-pressed={!!v.needs[k]} onClick={() => api(`/visits/${token}/needs?${qs}`, { method: 'POST', body: { needs: { ...v.needs, [k]: !v.needs[k] } } }).then(setV).catch(() => {})}><span className="iconbox"><I aria-hidden="true" /></span>{t(`need_${k}`)}<span className="check">{v.needs[k] && <Check size={18} aria-hidden="true" />}</span></button>;
            })}
          </div>
          <button className="btn btn-dark btn-block mt" onClick={() => setEditNeeds(false)}>{t('close')}</button>
        </Modal>
      )}
    </div>
  );
}

function Feedback({ v, qs }) {
  const t = useT();
  const [done, setDone] = useState(!!v.feedback);
  const faces = ['😞', '🙁', '😐', '🙂', '😄'];
  return (
    <div className="card card-lg card-sage center">
      <h2 className="q-title">{done ? t('thanks') : t('feedbackQ')}</h2>
      {!done && <div className="row mt" style={{ justifyContent: 'center' }}>{faces.map((f, i) => <button key={f} className="btn btn-lg" style={{ fontSize: '2rem' }} aria-label={`${i + 1} of 5`} onClick={() => api(`/visits/${v.token}/feedback?${qs}`, { method: 'POST', body: { score: i + 1 } }).then(() => setDone(true)).catch(() => {})}>{f}</button>)}</div>}
    </div>
  );
}
