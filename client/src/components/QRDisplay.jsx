import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export default function QRDisplay({ roomCode }) {
  const [qrDataUrl, setQrDataUrl] = useState('');

  useEffect(() => {
    if (!roomCode) return;
    QRCode.toDataURL(roomCode, {
      width: 300,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    })
    .then(url => setQrDataUrl(url))
    .catch(err => console.error('QR Generate Error', err));
  }, [roomCode]);

  return (
    <div style={{ background: '#fff', padding: 12, borderRadius: 16, border: '1px solid rgba(255,255,255,0.2)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {qrDataUrl ? (
        <img src={qrDataUrl} alt="Room QR Code" style={{ width: 220, height: 220, display: 'block', borderRadius: 8 }} />
      ) : (
        <div style={{ width: 220, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000' }}>
          Generating...
        </div>
      )}
    </div>
  );
}
