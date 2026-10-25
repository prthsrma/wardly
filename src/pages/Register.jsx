import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { ShieldCheck, UserRound, Users, Mic, Printer, Navigation, ArrowLeft, Timer, HandHelping, Siren, Check, Delete, CalendarClock, Volume2, Lightbulb, RotateCcw } from 'lucide-react';
import { LANGS, DEPARTMENTS, FLOORS } from '../../shared/hospital.js';
import { suggestDepartment, findRoute, nodeById, placeName, floorName } from '../../shared/logic.js';
import { api, usePrefs, useT, speak, canListen, listen, store, sendAlert, fmtTime } from '../lib.js';
import { DangerSigns, Icon, SpeakBtn, Modal, NEED_ICONS, TurnTime } from '../components.jsx';

const NEEDS = ['avoidStairs', 'wheelchair', 'lowVision', 'hearing', 'needsHelper', 'largeText', 'pregnant'];

export default function Register({ assisted = false, auth, onDone }) {
  const t = useT();
  const { prefs, setPrefs } = usePrefs();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const kiosk = params.get('kiosk') === '1';
  const [step, setStep] = useState('lang');
  const [door, setDoor] = useState(assisted ? 'ASSISTED' : null);
  const [p, setP] = useState({ name: '', age: '', gender: '', phone: '', abha: '' });
  const [helperPhone, setHelperPhone] = useState('');
  const [dept, setDept] = useState(null);
  const [needs, setNeeds] = useState({});
  const [nextDay, setNextDay] = useState(false);
  const [cfg, setCfg] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [redSent, setRedSent] = useState(null);
  const [helper, setHelper] = useState(false);
  const started = useRef(Date.now());
  const top = useRef(null);

  useEffect(() => { api('/config').then(setCfg).catch(() => {}); }, [step]);
  useEffect(() => { top.current?.focus(); window.scrollTo({ top: 0 }); }, [step]);

  const go = (s) => { setErr(''); setStep(s); };
  const onSign = async (sign) => {
    if (!assisted) return nav(`/emergency?signs=${sign}&src=register${kiosk ? '&at=G_REG' : ''}`);
    const r = await sendAlert({ kind: 'EMERGENCY', signs: [sign], nodeId: 'G_REG', source: 'STAFF' }).catch(() => 'error');
    setRedSent(r);
  };
  const reset = () => { setStep('lang'); setDoor(assisted ? 'ASSISTED' : null); setP({ name: '', age: '', gender: '', phone: '', abha: '' }); setHelperPhone(''); setDept(null); setNeeds({}); setNextDay(false); setResult(null); setRedSent(null); started.current = Date.now(); };

  const submit = async () => {
    setBusy(true); setErr('');
    try {
      const r = await api('/visits', { method: 'POST', auth, body: { door, departmentId: dept, needs, nextDay, helperPhone, patient: { ...p, age: Number(p.age), lang: prefs.lang } } });
      setResult({ ...r.visit, seconds: Math.round((Date.now() - started.current) / 1000) });
      if (!assisted) store.set('ms-visit', { token: r.visit.token, sig: r.visit.sig, nodeId: r.visit.current?.nodeId });
      go('slip');
      onDone?.(r.visit);
    } catch (e) {
      setErr(e.code === 'DUPLICATE' ? `${t('duplicate')} ${e.data?.token}` : e.message);
    } finally { setBusy(false); }
  };

  const stepNo = { details: 1, dept: 2, needs: 3, slip: 4 }[step];
  return (
    <div className={assisted ? '' : 'page dots'}>
      <div className={assisted ? '' : 'wrap'}>
        <div className="flow-card">
          <div className="row between mb no-print">
            <div className="row">
              {step !== 'lang' && step !== 'slip' && <button className="btn btn-sm" onClick={() => go({ danger: 'lang', door: 'danger', details: assisted ? 'danger' : 'door', dept: door === 'ABHA' ? 'door' : 'details', needs: 'dept' }[step])}><ArrowLeft size={16} aria-hidden="true" />{t('back')}</button>}
              {stepNo && <span className="pill pill-dark">{t('step')} {stepNo} {t('of')} 4</span>}
            </div>
            <div className="row">
              <span className="pill" title="Target ≤ 4.15 min per door"><Timer size={14} aria-hidden="true" /><Elapsed since={started.current} stop={!!result} /></span>
              {kiosk && <button className="btn btn-sm btn-sage" onClick={async () => { await sendAlert({ kind: 'KIOSK_HELP', nodeId: 'G_REG', source: 'KIOSK', note: 'Kiosk 1, registration hall' }).catch(() => {}); setHelper(true); }}><HandHelping size={16} aria-hidden="true" />{t('callHelper')}</button>}
            </div>
          </div>
          {stepNo && <div className="stepper no-print" aria-hidden="true">{[1, 2, 3, 4].map((n) => <i key={n} className={n <= stepNo ? 'on' : ''} />)}</div>}
          {helper && <div className="notice notice-sage mb" role="status"><HandHelping aria-hidden="true" />{t('helperComing')}</div>}

          <div className={`card card-lg ${step === 'slip' ? 'card-flat' : ''}`} style={step === 'slip' ? { padding: 0, border: 0, background: 'transparent' } : {}} tabIndex={-1} ref={top}>
            {step === 'lang' && (
              <div className="col" style={{ gap: 20 }}>
                <h1 className="q-title">{t('chooseLanguage')}</h1>
                {assisted && <p className="muted">Pick the patient’s language — it travels with the token to boards, SMS and staff screens.</p>}
                <div className="lang-grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))' }}>
                  {LANGS.map((l) => (
                    <button key={l.code} lang={l.code} className="lang-btn" style={{ minHeight: 88, fontSize: '1.5rem' }} aria-pressed={prefs.lang === l.code}
                      onClick={() => { setPrefs({ lang: l.code }); if (prefs.voice) speak(l.native, l.code); }}>{l.native}<small>{l.code.toUpperCase()}</small></button>
                  ))}
                </div>
                <button className="btn btn-lg btn-dark" onClick={() => go('danger')}>{t('continue')}</button>
              </div>
            )}

            {step === 'danger' && (redSent
              ? <div className="col"><div className="cta-red"><Siren size={34} aria-hidden="true" /><span>{redSent === 'queued' ? t('emQueued') : `${t('emAlerted')} ${t('emBody')}`}</span></div><button className="btn" onClick={reset}><RotateCcw size={16} aria-hidden="true" />New registration</button></div>
              : <DangerSigns title={t('dangerTitle')} onSign={onSign} onNone={() => go(assisted ? 'details' : 'door')} />)}

            {step === 'door' && (
              <div className="col" style={{ gap: 18 }}>
                <h1 className="q-title">{t('howRegister')}</h1>
                <div className="choice-grid doors">
                  {[['ABHA', ShieldCheck, t('doorAbha'), t('doorAbhaDesc')], ['SELF', UserRound, t('doorSelf'), t('doorSelfDesc')], ['ASSISTED', Users, t('doorHelper'), t('doorHelperDesc')]].map(([d, I, h, s]) => (
                    <button key={d} className="choice" aria-pressed={door === d} onClick={() => { setDoor(d); if (d !== 'ABHA') go('details'); }}>
                      <span className="iconbox"><I aria-hidden="true" /></span><b>{h}</b><small>{s}</small>
                    </button>
                  ))}
                </div>
                {door === 'ABHA' && <AbhaLookup onProfile={(pr) => { setP({ name: pr.name, age: String(pr.age), gender: pr.gender, phone: pr.phone || '', abha: pr.abha }); go('dept'); }} />}
              </div>
            )}

            {step === 'details' && <Details p={p} setP={setP} door={door} helperPhone={helperPhone} setHelperPhone={setHelperPhone} onNext={() => go('dept')} />}

            {step === 'dept' && (
              <DeptStep cfg={cfg} dept={dept} setDept={setDept} onNext={(full) => { if (full) setNextDay(true); go('needs'); }} />
            )}

            {step === 'needs' && (
              <div className="col" style={{ gap: 18 }}>
                <h1 className="q-title">{t('needsTitle')}</h1>
                <div className="choice-grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))' }}>
                  {NEEDS.map((k) => {
                    const I = NEED_ICONS[k];
                    return (
                      <button key={k} className="toggle" aria-pressed={!!needs[k]} onClick={() => { const v = !needs[k]; setNeeds({ ...needs, [k]: v, ...(k === 'wheelchair' && v ? { avoidStairs: true } : {}) }); if (k === 'largeText') setPrefs({ size: v ? 2 : 0 }); }}>
                        <span className="iconbox"><I aria-hidden="true" /></span>{t(`need_${k}`)}<span className="check">{needs[k] && <Check size={18} aria-hidden="true" />}</span>
                      </button>
                    );
                  })}
                </div>
                {nextDay && <div className="notice notice-y"><CalendarClock aria-hidden="true" />{DEPARTMENTS.find((d) => d.id === dept).names[prefs.lang]} {t('capacityFull')}</div>}
                <div className="notice notice-sage"><ShieldCheck aria-hidden="true" /><span className="grow">{t('consent')}</span><SpeakBtn text={t('consent')} /></div>
                {err && <p className="notice notice-red" role="alert">{err}</p>}
                <button className="btn btn-lg btn-dark" disabled={busy} onClick={submit}>{nextDay ? t('tomorrowToken') : t('getToken')}</button>
              </div>
            )}

            {step === 'slip' && result && (
              <div className="col">
                <Slip visit={result} needs={needs} />
                <div className="row no-print">
                  <button className="btn btn-lg" onClick={() => window.print()}><Printer aria-hidden="true" />{t('print')}</button>
                  {!assisted && <Link className="btn btn-lg btn-dark" to={`/visit/${result.token}?sig=${result.sig}`}><Navigation aria-hidden="true" />{t('trackLive')}</Link>}
                  {(assisted || kiosk) && <button className="btn btn-lg btn-y" onClick={reset}><RotateCcw aria-hidden="true" />Next patient</button>}
                  <span className="pill"><Timer size={14} aria-hidden="true" />Registered in {Math.floor(result.seconds / 60)}:{String(result.seconds % 60).padStart(2, '0')}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Elapsed({ since, stop }) {
  const [n, setN] = useState(Date.now());
  useEffect(() => { if (stop) return undefined; const i = setInterval(() => setN(Date.now()), 1000); return () => clearInterval(i); }, [stop]);
  const s = Math.round((n - since) / 1000);
  return <span className="kbd">{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</span>;
}

function AbhaLookup({ onProfile }) {
  const t = useT();
  const [abha, setAbha] = useState('');
  const [err, setErr] = useState('');
  const fetchIt = async (e) => {
    e.preventDefault(); setErr('');
    try { onProfile((await api('/abdm/scan-share', { method: 'POST', body: { abhaAddress: abha } })).profile); } catch (x) { setErr(x.message); }
  };
  return (
    <form className="card card-sage card-flat col" onSubmit={fetchIt}>
      <label className="field">{t('abhaPrompt')}<input className="input" value={abha} onChange={(e) => setAbha(e.target.value)} placeholder="name@abdm" autoComplete="off" required /></label>
      <p className="muted" style={{ fontSize: '.85rem' }}>Mock ABDM gateway (simulated). Try: ramesh.kumar@abdm, shabnam.bano@abdm, om.prakash@abdm, aisha.dar@abdm, gurpreet.kaur@abdm</p>
      {err && <p className="notice notice-red" role="alert">{err}</p>}
      <button className="btn btn-dark">{t('abhaFetch')}</button>
    </form>
  );
}

function Details({ p, setP, door, helperPhone, setHelperPhone, onNext }) {
  const t = useT();
  const { prefs } = usePrefs();
  const [usedVoice, setUsedVoice] = useState(false);
  const [listening, setListening] = useState(false);
  const [readback, setReadback] = useState(false);
  const [err, setErr] = useState('');
  const mic = canListen(prefs.lang, prefs);
  const hear = async () => {
    setListening(true);
    try { const text = (await listen(prefs.lang)).trim(); if (text) { setP({ ...p, name: text.slice(0, 60) }); setUsedVoice(true); } } catch { /* tap fallback stays */ }
    setListening(false);
  };
  const digit = (d) => setP({ ...p, age: d === 'del' ? p.age.slice(0, -1) : (p.age + d).replace(/^0+(?=\d)/, '').slice(0, 3) });
  const next = () => {
    const age = Number(p.age);
    if (!p.name.trim() || p.age === '' || age > 120 || !p.gender) return setErr(`${t('patientName')} · ${t('age')} · ${t('gender')}`);
    setErr('');
    if (usedVoice) { setReadback(true); speak(`${t('readBack')} ${p.name}, ${p.age}. ${t('correct')}`, prefs.lang); return; }
    onNext();
  };
  return (
    <div className="col" style={{ gap: 18 }}>
      <label className="field">{t('patientName')}
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <input className="input" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} autoComplete="off" maxLength={60} />
          {mic && <button type="button" className="btn btn-icon" aria-pressed={listening} aria-label={t('speak')} onClick={hear}><Mic aria-hidden="true" /></button>}
        </div>
      </label>
      {listening && <p className="pill pill-y" role="status">{t('listening')}</p>}
      {mic && <p className="muted" style={{ fontSize: '.82rem' }}>{t('speechNotice')}</p>}
      <div className="row" style={{ alignItems: 'flex-start', gap: 28 }}>
        <div className="field">{t('age')}
          <input className="age-display" inputMode="numeric" value={p.age} onChange={(e) => setP({ ...p, age: e.target.value.replace(/\D/g, '').slice(0, 3) })} aria-label={t('age')} />
          <div className="numpad" role="group" aria-label={`${t('age')} keypad`}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0'].map((d) => (
              <button key={d} type="button" className="btn" onClick={() => digit(d)} aria-label={d === 'del' ? 'Delete' : d}>{d === 'del' ? <Delete aria-hidden="true" /> : d}</button>
            ))}
          </div>
        </div>
        <div className="col grow">
          <span className="field">{t('gender')}</span>
          <div className="row">
            {[['M', t('male')], ['F', t('female')], ['O', t('other')]].map(([g, l]) => <button key={g} type="button" className="btn btn-lg" style={{ minWidth: 110 }} aria-pressed={p.gender === g} onClick={() => setP({ ...p, gender: g })}>{l}</button>)}
          </div>
          <label className="field mt">{door === 'ASSISTED' ? t('helperPhone') : t('phoneOptional')}
            <input className="input" type="tel" inputMode="numeric" maxLength={10} value={door === 'ASSISTED' ? helperPhone : p.phone}
              onChange={(e) => (door === 'ASSISTED' ? setHelperPhone : (v) => setP({ ...p, phone: v }))(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="98XXXXXXXX" />
          </label>
        </div>
      </div>
      {err && <p className="notice notice-red" role="alert">{err}</p>}
      <button className="btn btn-lg btn-dark" onClick={next}>{t('next')}</button>
      {readback && (
        <Modal onClose={() => setReadback(false)} label={t('readBack')}>
          <p className="muted">{t('readBack')}</p>
          <h2 className="q-title">{p.name}, {p.age}</h2>
          <p className="mt" style={{ fontSize: '1.2rem', fontWeight: 800 }}>{t('correct')}</p>
          <div className="row mt">
            <button className="btn btn-lg btn-dark grow" onClick={() => { setReadback(false); onNext(); }}>{t('yes')}</button>
            <button className="btn btn-lg grow" onClick={() => { setReadback(false); setUsedVoice(false); }}>{t('no')}</button>
            <button className="btn btn-lg btn-icon" aria-label={t('readAloud')} onClick={() => speak(`${t('readBack')} ${p.name}, ${p.age}. ${t('correct')}`, prefs.lang)}><Volume2 aria-hidden="true" /></button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function DeptStep({ cfg, dept, setDept, onNext }) {
  const t = useT();
  const { prefs } = usePrefs();
  const [q, setQ] = useState('');
  const [sugg, setSugg] = useState(undefined);
  const [full, setFull] = useState(false);
  const mic = canListen(prefs.lang, prefs);
  const load = (id) => cfg?.departments.find((d) => d.id === id)?.load;
  const next = () => { if (load(dept)?.full) setFull(true); else onNext(false); };
  return (
    <div className="col" style={{ gap: 18 }}>
      <h1 className="q-title">{t('chooseDept')}</h1>
      <div className="choice-grid">
        {DEPARTMENTS.map((d) => {
          const l = load(d.id);
          return (
            <div key={d.id} style={{ position: 'relative' }}>
              <button className="choice" style={{ width: '100%' }} aria-pressed={dept === d.id} onClick={() => setDept(d.id)}>
                <span className="iconbox"><Icon name={d.icon} size={26} /></span>
                <b>{d.names[prefs.lang]}</b>{d.sign !== d.names[prefs.lang] && <small>({d.sign})</small>}
                {l?.full ? <span className="pill pill-red">Full today</span> : l?.warn ? <span className="pill pill-amber">Almost full</span> : null}
              </button>
              <span style={{ position: 'absolute', top: 10, insetInlineEnd: 10 }}><SpeakBtn text={`${d.names[prefs.lang]} (${d.sign})`} className="btn btn-sm btn-icon btn-ghost" /></span>
            </div>
          );
        })}
      </div>
      {dept && load(dept)?.warn && !load(dept)?.full && <div className="notice notice-y" role="status">{DEPARTMENTS.find((d) => d.id === dept).names[prefs.lang]} {t('capacityWarn')}</div>}
      <details className="card card-flat" style={{ background: 'var(--paper)' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 800 }}><Lightbulb size={18} style={{ display: 'inline', verticalAlign: '-3px' }} aria-hidden="true" /> {t('notSure')}</summary>
        <div className="row mt" style={{ flexWrap: 'nowrap' }}>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('symptomsPh')} aria-label={t('notSure')} />
          {mic && <button className="btn btn-icon" aria-label={t('speak')} onClick={async () => { try { const x = await listen(prefs.lang); if (x) { setQ(x); setSugg(suggestDepartment(x)); } } catch { /* tap fallback */ } }}><Mic aria-hidden="true" /></button>}
          <button className="btn btn-dark" onClick={() => setSugg(suggestDepartment(q))}>{t('next')}</button>
        </div>
        {sugg === null && <p className="notice mt">{t('noSuggestion')}</p>}
        {sugg && (
          <div className="notice notice-y mt" style={{ alignItems: 'center' }}>
            <Icon name={DEPARTMENTS.find((d) => d.id === sugg.departmentId).icon} />
            <div className="grow"><small className="pill">{t('suggestion')}</small><div style={{ fontWeight: 800, fontSize: '1.2rem', marginTop: 4 }}>{DEPARTMENTS.find((d) => d.id === sugg.departmentId).names[prefs.lang]}</div></div>
            <button className="btn btn-dark" onClick={() => { setDept(sugg.departmentId); setSugg(undefined); }}><Check size={18} aria-hidden="true" />{t('yes')}</button>
          </div>
        )}
      </details>
      <button className="btn btn-lg btn-dark" disabled={!dept} onClick={next}>{t('next')}</button>
      {full && (
        <Modal onClose={() => setFull(false)} label={t('capacityFull')}>
          <CalendarClock size={40} aria-hidden="true" />
          <h2 className="q-title mt">{DEPARTMENTS.find((d) => d.id === dept).names[prefs.lang]} {t('capacityFull')}</h2>
          <div className="row mt2">
            <button className="btn btn-lg btn-dark" onClick={() => { setFull(false); onNext(true); }}>{t('tomorrowToken')}</button>
            <button className="btn btn-lg" onClick={() => setFull(false)}>{t('back')}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// OPD slip: token, room, floor, doctor, people ahead, wait range, signed QR, colour line + landmark (no-phone path).
export function Slip({ visit, needs = {} }) {
  const t = useT();
  const { prefs } = usePrefs();
  const lang = visit.lang || prefs.lang;
  const [qr, setQr] = useState('');
  const url = `${window.location.origin}/visit/${visit.token}?sig=${visit.sig}`;
  useEffect(() => { QRCode.toDataURL(url, { margin: 1, width: 320 }).then(setQr).catch(() => {}); }, [url]);
  const c = visit.current;
  const route = useMemo(() => (c ? findRoute('G_REG', c.nodeId, { avoidStairs: needs.avoidStairs || needs.wheelchair || visit.needs?.avoidStairs || visit.needs?.wheelchair }) : null), [c?.nodeId]); // eslint-disable-line react-hooks/exhaustive-deps
  const lm = route?.steps.find((s) => s.lm)?.lm;
  const dest = c && nodeById[c.nodeId];
  const line = dest && FLOORS[dest.floor];
  const dept = DEPARTMENTS.find((d) => d.id === visit.deptId);
  return (
    <div className="slip printable" role="region" aria-label={t('yourToken')}>
      <div className="slip-head"><b className="h" style={{ fontSize: '1.2rem' }}>Wardly · Demo District Hospital</b><span>{new Date().toLocaleDateString('en-IN')}</span></div>
      <div className="slip-body">
        <div>
          <div className="muted" style={{ fontWeight: 800 }}>{t('yourToken')}</div>
          <div className="token-big">{visit.token}</div>
          <div style={{ fontWeight: 800, fontSize: '1.2rem', marginTop: 6 }}>{dept.names[lang]} {dept.sign !== dept.names[lang] && <span className="muted">({dept.sign})</span>}</div>
          {visit.status === 'TOMORROW' ? (
            <div className="notice notice-y mt"><CalendarClock aria-hidden="true" /><b>{t('arriveBetween')} {fmtTime(visit.arrivalWindow.from)} – {fmtTime(visit.arrivalWindow.to)} ({new Date(visit.arrivalWindow.from).toLocaleDateString('en-IN')})</b></div>
          ) : c && (
            <>
              <dl className="kv">
                <div><dt>{t('goTo')}</dt><dd>{placeName(lang, c.nodeId)}</dd></div>
                <div><dt>{t('floor')}</dt><dd>{floorName(lang, dest.floor)}</dd></div>
                {c.spLabel && <div><dt>{t('doctor')}</dt><dd>{c.spLabel}</dd></div>}
                {c.est && <div><dt>{t('approxWait')}</dt><dd>{c.est.next ? t('youAreNext') : `${c.est.low}–${c.est.high} ${t('minutes')} · ${c.est.ahead} ${t('peopleAhead')}`}</dd></div>}
              </dl>
              <TurnTime est={c.est} lang={lang} />
              <p className="line-chip mt"><i style={{ background: line.colour }} />{t('follow')} {t(`line_${line.line}`)}{lm ? ` · ${t('near')} ${t(`lm_${lm}`)}` : ''} · {floorName(lang, dest.floor)}</p>
            </>
          )}
          <p className="muted mt" style={{ fontSize: '.8rem' }}>{t('transparency')}</p>
        </div>
        <div className="center">
          {qr && <img className="slip-qr" src={qr} alt={`QR code to track token ${visit.token}`} />}
          <p className="muted" style={{ fontSize: '.78rem', maxWidth: 170, marginTop: 6 }}>{t('scanToTrack')}</p>
        </div>
      </div>
    </div>
  );
}
