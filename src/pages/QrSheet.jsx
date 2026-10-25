import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Printer } from 'lucide-react';
import { placeName, floorName } from '../../shared/logic.js';
import { CHECKPOINTS } from '../components.jsx';

// Printable QR checkpoint stickers ("You are here" without beacons, F5.4).
export default function QrSheet() {
  const [codes, setCodes] = useState({});
  useEffect(() => {
    Promise.all(CHECKPOINTS.map((n) => QRCode.toDataURL(`${window.location.origin}/navigate?cp=${n.id}`, { margin: 1, width: 240 }).then((u) => [n.id, u])))
      .then((x) => setCodes(Object.fromEntries(x)));
  }, []);
  return (
    <div className="page">
      <div className="wrap">
        <div className="row between no-print mb"><h1 className="q-title">QR checkpoint stickers</h1><button className="btn btn-dark" onClick={() => window.print()}><Printer aria-hidden="true" />Print sheet</button></div>
        <div className="printable" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 14 }}>
          {CHECKPOINTS.map((n) => (
            <div key={n.id} className="card center" style={{ boxShadow: 'none' }}>
              {codes[n.id] && <img src={codes[n.id]} alt={`QR for ${placeName('en', n.id)}`} style={{ width: 150, margin: '0 auto' }} />}
              <b style={{ display: 'block', marginTop: 8 }}>{placeName('en', n.id)}</b>
              <span lang="hi">{placeName('hi', n.id)}</span>
              <div className="muted" style={{ fontSize: '.8rem' }}>{floorName('en', n.floor)} · Scan: You are here</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
