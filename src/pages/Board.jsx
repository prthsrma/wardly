import { useEffect, useState } from 'react';
import { Volume2, VolumeX, Coffee, Footprints, UserX } from 'lucide-react';
import { LANGS, DEPARTMENTS } from '../../shared/hospital.js';
import { placeName, floorName, nodeById } from '../../shared/logic.js';
import { t } from '../../shared/i18n.js';
import { api, socket, playSequence, useNow, fmtTime } from '../lib.js';
import { Brand } from '../components.jsx';

// Display board (F10): tokens only, never names (S3). Calls are announced in each patient's own language.
export default function Board() {
  const [b, setB] = useState(null);
  const [sound, setSound] = useState(false);
  const [ann, setAnn] = useState(null);
  const [tick, setTick] = useState(0);
  const now = useNow(1000);
  useEffect(() => {
    const load = () => api('/board').then(setB).catch(() => {});
    load();
    socket.on('update', load); socket.on('connect', load);
    return () => { socket.off('update', load); socket.off('connect', load); };
  }, []);
  useEffect(() => { const i = setInterval(() => setTick((x) => x + 1), 6000); return () => clearInterval(i); }, []);
  useEffect(() => {
    const on = (c) => {
      setAnn(c);
      setTimeout(() => setAnn((a) => (a === c ? null : a)), 9000);
      if (sound) {
        const L = c.lang;
        playSequence(L, [
          { key: 'w_token', text: t(L, 'w_token') }, { key: `letter_${c.token[0]}`, text: c.token[0] }, { key: `num_${+c.token.slice(2)}`, text: String(+c.token.slice(2)) },
          { key: 'w_pleaseGo', text: t(L, 'w_pleaseGo') }, { key: `node_${c.nodeId}`, text: placeName(L, c.nodeId) }, { key: `floor_${nodeById[c.nodeId].floor}`, text: floorName(L, nodeById[c.nodeId].floor) },
        ]);
      }
    };
    socket.on('called', on);
    return () => socket.off('called', on);
  }, [sound]);

  const lang = LANGS[tick % LANGS.length].code;
  if (b?.evacuation) return (
    <div className="board" style={{ background: '#000', display: 'grid', placeItems: 'center' }}>
      <div className="col center" style={{ gap: 18 }}>{LANGS.map((l) => <div key={l.code} lang={l.code}><h1 style={{ color: 'var(--y)', fontSize: '2.6rem' }}>{t(l.code, 'evacTitle')}</h1><p style={{ fontSize: '1.3rem' }}>{t(l.code, 'evacBody')}</p></div>)}</div>
    </div>
  );
  return (
    <div className="board">
      <div className="board-head">
        <Brand to="/board" onDark />
        <h1 style={{ fontSize: '1.8rem', color: 'var(--y)' }}>{lang === 'en' ? 'Now serving' : `${t(lang, 'nowServing')} · Now serving`}</h1>
        <span className="grow" />
        <span className="kbd" style={{ fontSize: '1.6rem' }}>{new Date(now).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
        <button className="btn btn-sm" onClick={() => setSound(!sound)} aria-pressed={sound}>{sound ? <Volume2 size={16} aria-hidden="true" /> : <VolumeX size={16} aria-hidden="true" />}{sound ? 'Sound on' : 'Enable sound'}</button>
      </div>
      <div className="board-grid">
        {b?.points.map((p) => {
          const d = DEPARTMENTS.find((x) => x.id === p.dept);
          return (
            <div key={p.id} className="bcard">
              <div className="bcard-h"><span>{placeName('en', p.nodeId)} · {floorName('en', nodeById[p.nodeId].floor)}</span><span lang={lang}>{d ? d.names[lang] : t(lang, `stage_${p.type}`)}</span></div>
              <div className="bcard-b">
                <div className="now">{p.serving || '—'}</div>
                <div className="col" style={{ gap: 6 }}>
                  {p.status === 'BREAK' && <span className="pill pill-amber"><Coffee size={14} aria-hidden="true" />Break till {fmtTime(p.breakUntil)}</span>}
                  {p.status === 'ROUND' && <span className="pill pill-amber"><Footprints size={14} aria-hidden="true" />Ward round</span>}
                  {p.status === 'ABSENT' && <span className="pill pill-red"><UserX size={14} aria-hidden="true" />Absent</span>}
                  <span style={{ fontSize: '.75rem', color: '#9aa5a0', fontWeight: 800 }}>{t(lang, 'upNext').toUpperCase()}</span>
                  <div className="nx">{p.next.length ? p.next.map((x) => <span key={x}>{x}</span>) : <span>—</span>}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="ticker" lang={lang} aria-live="polite">{t(lang, 'transparency')}</div>
      {ann && (
        <div className="announce" role="alert">
          <div className="box">
            <div className="token-big">{ann.token}</div>
            <p lang={ann.lang} style={{ fontSize: '2rem', fontWeight: 800, marginTop: 10 }}>{t(ann.lang, 'w_pleaseGo')} {placeName(ann.lang, ann.nodeId)}, {floorName(ann.lang, nodeById[ann.nodeId].floor)}</p>
            {ann.lang !== 'en' && <p style={{ fontSize: '1.3rem', marginTop: 6 }}>Please go to {placeName('en', ann.nodeId)}, {floorName('en', nodeById[ann.nodeId].floor)}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
