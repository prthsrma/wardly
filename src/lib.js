import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { LANGS } from '../shared/hospital.js';
import { t as tr } from '../shared/i18n.js';

export const socket = io({ transports: ['websocket', 'polling'] });

// ---------- storage (per-viewer conveniences only; every access guarded) ----------
export const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

// ---------- API ----------
export async function api(path, { method = 'GET', body, auth } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers.Authorization = `Bearer ${auth}`;
  const res = await fetch(`/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  // A 404 without our JSON error means the page is on a static-only host with no Wardly server behind it.
  const noServer = !json.error && [404, 405].includes(res.status);
  if (!res.ok) { const e = new Error(json.error?.message || (noServer ? 'The Wardly server is not running on this site. This page is static-only (for example on Vercel); deploy the full app on Render, see the README.' : `Request failed (${res.status})`)); e.code = json.error?.code; e.data = json.error; e.status = res.status; e.noServer = noServer; throw e; }
  return json;
}

// Emergency/help alerts never get lost: if the network is down they are queued and retried (S1 offline fail-safe).
const OUTBOX = 'ms-outbox';
export async function sendAlert(body) {
  try { await api('/alerts', { method: 'POST', body }); return 'sent'; }
  catch (e) {
    if (e.status && !e.noServer) throw e; // the server answered with an error: not a network problem
    store.set(OUTBOX, [...store.get(OUTBOX, []), { ...body, queuedAt: Date.now() }]);
    return 'queued';
  }
}
async function flushOutbox() {
  const q = store.get(OUTBOX, []);
  if (!q.length) return;
  const left = [];
  for (const a of q) { try { await api('/alerts', { method: 'POST', body: a }); } catch (e) { if (!e.status || e.noServer) left.push(a); } }
  store.set(OUTBOX, left);
}
setInterval(flushOutbox, 5000);
window.addEventListener('online', flushOutbox);

// ---------- preferences: language, text size, contrast, optional voice ----------
export const Prefs = createContext(null);
export function usePrefsState() {
  const [p, setP] = useState(() => ({ lang: 'en', size: 0, contrast: false, voice: false, speechInput: true, ...store.get('ms-prefs', {}) }));
  useEffect(() => {
    store.set('ms-prefs', p);
    const L = LANGS.find((l) => l.code === p.lang) || LANGS[0];
    const html = document.documentElement;
    html.lang = p.lang === 'doi' ? 'doi' : p.lang;
    html.dir = L.rtl ? 'rtl' : 'ltr';
    html.dataset.size = p.size;
    html.dataset.contrast = p.contrast ? '1' : '0';
  }, [p]);
  return [p, (patch) => setP((x) => ({ ...x, ...patch }))];
}
export const usePrefs = () => useContext(Prefs);
export function useT() {
  const { prefs } = usePrefs();
  return (k, v) => tr(prefs.lang, k, v);
}

// ---------- voice out: clip sequencer → speechSynthesis → caption (PRD F2.5) ----------
let manifest = {};
fetch('/audio/manifest.json').then((r) => r.json()).then((m) => { manifest = m; }).catch(() => {});
const VOICE_LANG = { en: 'en', hi: 'hi', ur: 'ur', doi: 'hi', ks: 'ur' }; // doi/ks: nearest script voice until recorded clips exist

export function caption(text) { window.dispatchEvent(new CustomEvent('ms-caption', { detail: text })); }

function synth(text, lang) {
  if (!('speechSynthesis' in window)) return false;
  const want = VOICE_LANG[lang] || 'en';
  const voice = speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith(want));
  if (!voice && want !== 'en') return false; // no voice for this language: caption only, never block the flow
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  if (voice) u.voice = voice;
  u.lang = voice?.lang || 'en-IN';
  u.rate = 0.92;
  speechSynthesis.speak(u);
  return true;
}

export function speak(text, lang) {
  if (!text) return;
  caption(text);
  synth(text, lang);
}

// parts: [{ key, text }]; plays recorded clips back-to-back when all exist, else speaks the joined text.
export function playSequence(lang, parts) {
  const text = parts.map((p) => p.text).join(' ');
  caption(text);
  const have = manifest[lang] || [];
  if (parts.every((p) => p.key && have.includes(p.key))) {
    let i = 0;
    const next = () => { if (i >= parts.length) return; const a = new Audio(`/audio/${lang}/${parts[i++].key}.mp3`); a.onended = next; a.onerror = next; a.play().catch(next); };
    next();
    return;
  }
  synth(text, lang);
}

// ---------- voice in: browser Web Speech API, only where supported (PRD F2.6) ----------
const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
export const canListen = (lang, prefs) => !!SR && ['en', 'hi', 'ur'].includes(lang) && prefs.speechInput;
export function listen(lang) {
  return new Promise((resolve, reject) => {
    const r = new SR();
    r.lang = LANGS.find((l) => l.code === lang)?.speech || 'en-IN';
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (e) => resolve(e.results[0][0].transcript);
    r.onerror = (e) => reject(e.error);
    r.onend = () => resolve('');
    r.start();
  });
}

// ---------- misc ----------
export const fmtTime = (ms) => (ms ? new Date(ms).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—');
export const minsAgo = (ms) => Math.max(0, Math.round((Date.now() - ms) / 60000));
export function useNow(every = 1000) {
  const [n, setN] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setN(Date.now()), every); return () => clearInterval(i); }, [every]);
  return n;
}
export function useSocket(event, fn, deps = []) {
  useEffect(() => { socket.on(event, fn); return () => socket.off(event, fn); }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}
// Repeating alarm tone for unseen staff flags (WebAudio, no files needed).
let actx;
export function beep() {
  try {
    actx ||= new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'square'; o.frequency.value = 880; g.gain.value = 0.08;
    o.connect(g); g.connect(actx.destination);
    o.start(); o.frequency.setValueAtTime(660, actx.currentTime + 0.18); o.stop(actx.currentTime + 0.4);
  } catch { /* audio blocked until first interaction */ }
}
