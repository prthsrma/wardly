import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Ticket, Navigation, Search, Siren, Languages, Accessibility, Route, MapPin, ScanLine, BellRing, LayoutDashboard, Check, X,
  Users, Stethoscope, Building2, Mail, Globe, Phone, MessageCircle, ArrowRight, Activity,
} from 'lucide-react';
import { Brand } from '../components.jsx';
import { LANGS, DEPARTMENTS } from '../../shared/hospital.js';
import { api, socket, usePrefs, useT } from '../lib.js';

function useStats() {
  const [s, setS] = useState(null);
  useEffect(() => {
    const load = () => api('/stats').then(setS).catch(() => {});
    load();
    socket.on('update', load);
    const i = setInterval(load, 30000);
    return () => { socket.off('update', load); clearInterval(i); };
  }, []);
  return s;
}

const FEATURES = [
  { i: Ticket, h: 'Three ways in', p: 'ABHA Scan & Share, a 4-step self-service flow with no OTP or Aadhaar, or a helper registering on their own phone.' },
  { i: Languages, h: 'Your language, spoken', p: 'Hindi, Urdu, Dogri, Kashmiri and English. Official sign terms kept in brackets. Voice is optional — switch it on any time.' },
  { i: Accessibility, h: 'A needs profile that travels', p: 'Avoid stairs, wheelchair, low vision, hearing, needs a helper. Routes, alerts and staff screens all change with it.' },
  { i: Route, h: 'One journey token', p: 'The same token moves from doctor to lab to pharmacy automatically. Live position and an honest wait range at every counter.' },
  { i: MapPin, h: 'Landmark directions', p: '"Take Lift B to Floor 1, past the blue pharmacy counter." Step-free when needed. QR stickers instead of beacons.' },
  { i: ScanLine, h: 'Any slip, any system', p: 'Scan a Wardly QR, type a token, or type what is written on a paper slip — "kamra 12" finds Room 12.' },
  { i: Siren, h: 'Emergencies never queue', p: 'Danger signs come first. Any yes shows the way to Emergency and alerts nurses at once. Only staff assess urgency.' },
  { i: BellRing, h: 'Real-time, no phone needed', p: 'Doctor on break? Every estimate updates in a second. Alerts by push, SMS, voice call and the display board.' },
  { i: LayoutDashboard, h: 'Staff consoles + NQAS report', p: 'Doctor, nurse, desk, pharmacy and admin views. Crowding, bottlenecks, closures and a daily stage-wise wait report.' },
];

export default function Landing() {
  const t = useT();
  const { prefs, setPrefs } = usePrefs();
  const s = useStats();
  const english = prefs.lang === 'en';
  return (
    <>
      <section className="hero dots">
        <div className="wrap center">
          {english
            ? <h1>One token. Every counter. <span className="outline">Your language.</span></h1>
            : <h1>{t('heroTitle')}</h1>}
          <p className="sub">Wardly follows every patient after registration — doctor, lab, X-ray, pharmacy — with live queues, step-free directions and an emergency path that never waits.</p>

          <div className="browser" role="region" aria-label="Start here">
            <div className="browser-bar" aria-hidden="true">
              <i style={{ background: '#ff5f57' }} /><i style={{ background: '#febc2e' }} /><i style={{ background: '#28c840' }} />
              <span className="url">wardly · Demo District Hospital, Jammu</span>
            </div>
            <div className="browser-body">
              <div className="browser-main">
                <p className="eyebrow">1 · {t('chooseLanguage')}</p>
                <div className="lang-grid">
                  {LANGS.map((l) => (
                    <button key={l.code} lang={l.code} className="lang-btn" aria-pressed={prefs.lang === l.code} onClick={() => setPrefs({ lang: l.code })}>
                      {l.native}<small>{l.code.toUpperCase()}</small>
                    </button>
                  ))}
                </div>
                <p className="eyebrow mt2">2 · {t('continue')}</p>
                <div className="start-tiles">
                  {[['/register', 'tile tile-primary', Ticket, t('startToken'), t('doorSelfDesc')],
                    ['/navigate', 'tile', Navigation, t('whereGo'), t('tileWhereDesc')],
                    ['/navigate?tab=token', 'tile', Search, t('trackToken'), t('tileTrackDesc')]].map(([to, cls, I, h, s]) => (
                    <Link key={to} to={to} className={cls}>
                      <span className="iconbox"><I aria-hidden="true" /></span>
                      <span className="tile-text"><b>{h}</b><small>{s}</small></span>
                    </Link>
                  ))}
                </div>
                <Link to="/emergency?src=landing" className="cta-red mt" style={{ textDecoration: 'none' }}>
                  <Siren size={28} aria-hidden="true" /><span className="grow"><small style={{ display: 'block', fontWeight: 700, opacity: .9 }}>{t('sign_chest')} · {t('sign_breath')} · {t('sign_bleed')} · {t('sign_faint')}…</small>{t('dangerCta')}</span><ArrowRight aria-hidden="true" />
                </Link>
              </div>
              <aside className="browser-side" aria-label="Live hospital status">
                <div className="row between"><b className="h" style={{ fontSize: '1.2rem' }}>Live right now</b><span className="pill pill-sage"><Activity size={14} aria-hidden="true" />{t('live')}</span></div>
                <div className="mini-grid">
                  <div className="mini-stat"><div className="n">{s?.waitingNow ?? '—'}</div><div className="l">Waiting now</div></div>
                  <div className="mini-stat"><div className="n">{s?.visitsToday ?? '—'}</div><div className="l">Patients today</div></div>
                  <div className="mini-stat"><div className="n">{s?.doctorMedianWait != null ? `${s.doctorMedianWait} min` : '—'}</div><div className="l">Median doctor wait</div></div>
                  <div className="mini-stat"><div className="n">{s?.ackMedianSec != null ? `${s.ackMedianSec} s` : '—'}</div><div className="l">Emergency response</div></div>
                </div>
                <div className="mini-stat">
                  <div className="l mb" style={{ marginBottom: 8 }}>Department load today</div>
                  <div className="dept-bars">
                    {DEPARTMENTS.map((d) => {
                      const x = s?.departments.find((y) => y.id === d.id);
                      return (
                        <div key={d.id} className="dept-bar">
                          <span title={d.names[prefs.lang] || d.names.en}>{d.names[prefs.lang] || d.names.en}</span>
                          <span className={`bar ${x?.full ? 'full' : x?.warn ? 'warn' : ''}`} role="img" aria-label={`${d.names.en} ${x?.pct ?? 0}% of daily capacity`}><span style={{ width: `${Math.min(100, x?.pct ?? 0)}%` }} /></span>
                          <span className="muted">{x ? `~${x.estMin} min` : ''}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </aside>
            </div>
          </div>
        </div>
      </section>

      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">
          {[0, 1].map((k) => ['ABDM SCAN & SHARE', 'DGHS STG 2025 TRIAGE', 'NQAS', 'KAYAKALP', 'WCAG 2.2 AA', 'BHASHINI-READY', 'e-HOSPITAL', 'eSUSHRUT', 'GIGW', 'DPDP ACT 2023', 'NO AADHAAR NEEDED'].map((b) => <span key={b + k}>{b}</span>))}
        </div>
      </div>

      <section className="section" id="problem">
        <div className="wrap">
          <div className="section-head">
            <span className="eyebrow">The problem in numbers</span>
            <h2>Registration got faster. The rest of the visit didn’t.</h2>
          </div>
          <div className="stat-grid">
            <div className="stat"><div className="n">98.6<small> min</small></div><p><b>Average OPD wait</b> for a consultation that lasts about 6.5 minutes.</p></div>
            <div className="stat" style={{ background: 'var(--y)' }}><div className="n">91%</div><p>of patients <b>could not find their way</b> using signs alone.</p></div>
            <div className="stat"><div className="n">69.6%</div><p>of first-time visitors <b>needed a person</b> to guide them.</p></div>
            <div className="stat" style={{ background: 'var(--sage)' }}><div className="n">74.7%</div><p>of patients who waited over 3 hours <b>would not come back.</b></p></div>
          </div>
          <div className="card mt2">
            <h3 style={{ fontSize: '1.4rem' }}>The wait repeats at every counter</h3>
            <div className="col mt">
              {[['Registration', 38.2], ['Doctor', 41.3], ['Sample collection', 49.6], ['Pharmacy', 61]].map(([l, v]) => (
                <div key={l} className="stage-row">
                  <span>{l}</span>
                  <span className="bar" style={{ height: 26, borderWidth: 2 }}><span style={{ width: `${(v / 61) * 100}%`, background: l === 'Pharmacy' ? 'var(--k)' : 'var(--ch)' }} /></span>
                  <b>{v} min</b>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap vs">
          <div className="vs-a">
            <span className="pill">Today</span>
            <h3 className="mt" style={{ fontSize: '2rem' }}>A token that stops at registration</h3>
            <ul>
              {['A new line at every counter, with no idea how long', 'Signs in English only', 'A smartphone and OTP assumed', 'An urgent patient can stand in the OPD line', 'No stage-wise wait data for the hospital'].map((x) => <li key={x}><span className="ic"><X size={16} aria-hidden="true" /></span>{x}</li>)}
            </ul>
          </div>
          <div className="vs-b">
            <span className="pill pill-dark">With Wardly</span>
            <h3 className="mt" style={{ fontSize: '2rem' }}>One token for the whole visit</h3>
            <ul>
              {['Live position and an honest wait range at every counter', 'Five languages, pictures and optional voice', 'Phone optional: kiosk, printed slip, board, SMS', 'Danger signs first — emergencies go straight to a nurse', 'A daily NQAS-ready wait report'].map((x) => <li key={x}><span className="ic"><Check size={16} aria-hidden="true" /></span>{x}</li>)}
            </ul>
          </div>
        </div>
      </section>

      <section className="section dots" id="features">
        <div className="wrap">
          <div className="section-head"><span className="eyebrow">Features</span><h2>Built for the patients signage leaves behind</h2></div>
          <div className="feat-grid">
            {FEATURES.map(({ i: I, h, p }) => (
              <div key={h} className="feat"><span className="iconbox"><I size={30} aria-hidden="true" /></span><h3>{h}</h3><p>{p}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className="section dark" id="how">
        <div className="wrap">
          <div className="section-head"><span className="eyebrow" style={{ color: 'var(--y)' }}>How it works</span><h2>Three steps. No app to install.</h2></div>
          <div className="flow">
            {[['1', 'var(--sage)', 'Check, then register', 'Danger signs come first. Then ABHA, self-service or a helper — under 5 minutes, no Aadhaar.'],
              ['2', 'var(--y)', 'Get one journey token', 'A slip with your token, room, floor, colour line, wait range and a QR to track on any phone.'],
              ['3', '#fff', 'Get guided to every counter', 'Called by board, phone or SMS in your language, with step-free directions to each room.']].map(([n, c, h, p]) => (
              <div key={n} className="flow-step"><div className="circle" style={{ border: `4px solid ${c}`, boxShadow: `0 0 0 6px ${c}33` }}>{n}</div><h3>{h}</h3><p className="muted">{p}</p></div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="section-head"><span className="eyebrow">Who it serves</span><h2>One system, three sides of the counter</h2></div>
          <div className="bento">
            <div style={{ background: 'var(--sage)' }}>
              <span className="pill">Patients &amp; helpers</span><Users size={36} aria-hidden="true" /><h3>Elderly, rural, disabled, first-time</h3>
              <ul><li>Large text, high contrast, read aloud</li><li>Register a relative on your phone</li><li>Printed slip if you have no phone</li></ul>
            </div>
            <div style={{ background: 'var(--y)', boxShadow: 'var(--sh-lg)' }}>
              <span className="pill">Doctors, nurses &amp; counters</span><Stethoscope size={36} aria-hidden="true" /><h3>Simple controls, fewer interruptions</h3>
              <ul><li>Call next, Done + next steps, Break</li><li>Pinned emergency alerts with sound</li><li>Pharmacy sees orders before the patient arrives</li></ul>
            </div>
            <div style={{ background: 'var(--g7)', color: '#fff' }}>
              <span className="pill" style={{ color: '#000' }}>Medical Superintendent</span><Building2 size={36} aria-hidden="true" /><h3>See every bottleneck live</h3>
              <ul><li>Crowding heatmap and queue trends</li><li>Lift closures and evacuation mode</li><li>Daily NQAS / Kayakalp wait report</li></ul>
            </div>
          </div>
        </div>
      </section>

      <section className="section" style={{ background: 'var(--sage)' }}>
        <div className="wrap">
          <div className="section-head"><span className="eyebrow">What the evidence says</span><h2>Designed from the research, not guesses</h2></div>
          <div className="quotes">
            <figure className="quote"><span className="pill pill-dark">Emergency triage</span><blockquote>Many hospital emergency departments have no standard way to sort urgent patients from the rest.</blockquote><p className="muted">So danger signs come first, and nurses decide.</p></figure>
            <figure className="quote"><span className="pill pill-dark">Navigation</span><blockquote>94.4% of patients preferred phone-based directions to hospital signs.</blockquote><p className="muted">So directions open in any browser, with no app to install.</p></figure>
            <figure className="quote"><span className="pill pill-dark">Phone access</span><blockquote>Only 44.7% of people aged 60–69 have a smartphone.</blockquote><p className="muted">So every feature also works without one.</p></figure>
          </div>
        </div>
      </section>

      <section className="section dots center">
        <div className="wrap">
          <h2 style={{ fontSize: 'clamp(2.4rem,6vw,4.6rem)', maxWidth: '16ch', margin: '0 auto' }}>Stop standing in the wrong line.</h2>
          <p className="mt" style={{ fontSize: '1.2rem' }}>Pick your language and get your token in under five minutes.</p>
          <div className="row mt2" style={{ justifyContent: 'center' }}>
            <Link to="/register" className="btn btn-lg btn-dark"><Ticket aria-hidden="true" />{t('startToken')}</Link>
            <Link to="/navigate" className="btn btn-lg"><Navigation aria-hidden="true" />{t('whereGo')}</Link>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="wrap footer-grid">
          <div>
            <Brand onDark />
            <p className="mt" style={{ maxWidth: 360 }}>Smart queue and accessible navigation for government hospital OPDs. Prototype by Team Bugs &amp; Byte, MIET Jammu. All hospital data is simulated.</p>
            <div className="social">
              <a href="mailto:team@example.org" aria-label="Email"><Mail size={18} aria-hidden="true" /></a>
              <a href="/" aria-label="Website"><Globe size={18} aria-hidden="true" /></a>
              <a href="tel:112" aria-label="Emergency 112"><Phone size={18} aria-hidden="true" /></a>
              <a href="/phone" aria-label="SMS simulator"><MessageCircle size={18} aria-hidden="true" /></a>
            </div>
          </div>
          <div><h4>Patients</h4><Link to="/register">{t('startToken')}</Link><Link to="/navigate">{t('whereGo')}</Link><Link to="/navigate?tab=token">{t('trackToken')}</Link><Link to="/emergency?src=footer">{t('emergency')}</Link><Link to="/register?kiosk=1">Kiosk mode</Link></div>
          <div><h4>Hospital staff</h4><Link to="/staff">Staff console</Link><Link to="/board">Display board</Link><Link to="/phone">SMS / IVR simulator</Link><Link to="/staff/qr">QR checkpoint sheet</Link></div>
          <div><h4>Trust</h4><span>No Aadhaar needed, ABHA optional</span><a href="/#problem">Research basis</a><span>Boards show tokens, never names</span><span>Translations awaiting native review</span></div>
        </div>
        <div className="wrap mt2" style={{ borderTop: '1px solid #3a423d', paddingTop: 18, fontSize: '.85rem' }}>In an emergency call 112, or 108 for an ambulance. Wardly never decides whether something is an emergency — hospital staff do.</div>
      </footer>
    </>
  );
}
