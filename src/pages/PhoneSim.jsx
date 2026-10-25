import { useEffect, useState } from 'react';
import { MessageSquare, PhoneCall } from 'lucide-react';
import { api, socket, fmtTime } from '../lib.js';

// Demo-only phone simulator (F8.7): what a basic phone would receive by SMS / IVR. Production: NIC SMS + IVR gateway.
export default function PhoneSim() {
  const [msgs, setMsgs] = useState([]);
  useEffect(() => {
    const load = () => api('/phone').then(setMsgs).catch(() => {});
    load();
    socket.on('update', load);
    return () => socket.off('update', load);
  }, []);
  const byPhone = msgs.reduce((m, x) => ((m[x.to] ||= []).push(x), m), {});
  return (
    <div className="page" style={{ background: 'var(--sage)' }}>
      <div className="wrap col" style={{ gap: 20 }}>
        <div><span className="eyebrow">Demo only</span><h1 className="q-title">SMS &amp; voice call simulator</h1><p className="mt">Messages a basic phone would receive, in the patient’s language. Register with a phone number to see yours appear live.</p></div>
        {!msgs.length && <p className="notice">No messages yet.</p>}
        <div className="phones">
          {Object.entries(byPhone).map(([to, list]) => (
            <div key={to} className="phone">
              <div className="row between" style={{ color: '#ddd', fontWeight: 800, marginBottom: 8 }}><span>+91 {to}</span><span>{list.length}</span></div>
              <div className="phone-screen col" style={{ gap: 8 }}>
                {list.slice(0, 6).map((m) => (
                  <div key={m.id} lang={m.lang} style={{ borderBottom: '1px dashed #6b7a52', paddingBottom: 6 }}>
                    <b style={{ display: 'flex', gap: 6, alignItems: 'center' }}>{m.channel === 'IVR' ? <PhoneCall size={14} aria-hidden="true" /> : <MessageSquare size={14} aria-hidden="true" />}{m.channel === 'IVR' ? 'Voice call' : 'SMS'} · {fmtTime(m.at)}</b>
                    {m.text}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
