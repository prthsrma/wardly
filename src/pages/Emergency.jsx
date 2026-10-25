import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Siren, Phone, Ambulance, CheckCircle2, WifiOff } from 'lucide-react';
import { useT, usePrefs, sendAlert, speak, store } from '../lib.js';
import { RouteView, useConfig, SpeakBtn } from '../components.jsx';
import { nodeById } from '../../shared/logic.js';

// Red screen (F7 + added requirement): shows the way to Casualty, says go now or tell any staff, shows 112/108.
// It never asks for a form or token, and never says anyone can wait. Works offline (cached shell + client-side route).
export default function Emergency() {
  const t = useT();
  const { prefs } = usePrefs();
  const [q] = useSearchParams();
  const cfg = useConfig();
  const [state, setState] = useState('sending');
  const raised = useRef(false);
  const signs = (q.get('signs') || '').split(',').filter(Boolean);
  const from = nodeById[q.get('at')] ? q.get('at') : store.get('ms-loc') || 'G_ENT';

  useEffect(() => {
    if (raised.current) return;
    raised.current = true;
    const v = store.get('ms-visit');
    const src = q.get('src');
    sendAlert({ kind: 'EMERGENCY', signs, token: v?.token, nodeId: from, source: src === 'register' ? (q.get('at') ? 'KIOSK' : 'PHONE') : src === 'worse' ? 'FEEL_WORSE' : 'EMERGENCY_BUTTON' })
      .then(setState).catch(() => setState('queued'));
    speak(`${t('emTitle')}. ${t('emBody')}`, prefs.lang);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="red-screen" role="alert">
      <div className="wrap col" style={{ maxWidth: 920, gap: 22 }}>
        <div className="row"><Siren size={56} aria-hidden="true" /><h1>{t('emTitle')}</h1></div>
        <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
          <p style={{ fontSize: '1.45rem', fontWeight: 800 }} className="grow">{t('emBody')}</p>
          <SpeakBtn text={`${t('emTitle')}. ${t('emBody')}`} className="btn btn-icon" />
        </div>
        <div className="row" style={{ gap: 10, fontWeight: 800 }} role="status" aria-live="polite">
          {state === 'sent' && <span className="pill" style={{ color: '#000' }}><CheckCircle2 size={16} aria-hidden="true" />{t('emAlerted')}</span>}
          {state === 'queued' && <span className="pill" style={{ color: '#000' }}><WifiOff size={16} aria-hidden="true" />{t('emQueued')}</span>}        </div>
        <div className="grid2">
          <a className="call-btn" href="tel:112"><Phone size={34} aria-hidden="true" />{t('call112')}</a>
          <a className="call-btn" href="tel:108"><Ambulance size={34} aria-hidden="true" />{t('call108')}</a>
        </div>
        <div className="card card-lg">
          <h2 style={{ fontSize: '1.6rem' }} className="mb">{t('emRoute')}</h2>
          <RouteView from={from} to="G_ED" avoidStairs closed={cfg?.closed || []} compact />
        </div>
      </div>
    </div>
  );
}
