import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ClipboardDocumentIcon, CheckIcon } from '@heroicons/react/24/outline';
import useStore from '../store/useStore';
import { useNavigate } from 'react-router-dom';
import { springSnap } from '../components/ui';
import PeerOrbit from '../components/PeerOrbit';
import DropZone from '../components/DropZone';
import QRDisplay from '../components/QRDisplay';
import ChatOverlay from '../components/ChatOverlay';
import ActiveTransfersGrid from '../components/ActiveTransfersGrid';

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:       '#000',
  surface:  'rgba(255,255,255,0.03)',
  border:   'rgba(255,255,255,0.08)',
  borderHi: 'rgba(255,255,255,0.15)',
  text:     '#fff',
  sub:      'rgba(255,255,255,0.4)',
  muted:    'rgba(255,255,255,0.18)',
  danger:   'rgba(255,80,72,1)',
  dangerBg: 'rgba(255,80,72,0.1)',
  dangerBd: 'rgba(255,80,72,0.25)',
  success:  '#34d399',
};

const panel = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: 16,
  backdropFilter: 'blur(24px)',
};

const font = "-apple-system,BlinkMacSystemFont,'SF Pro Display','Inter',sans-serif";

export default function HostRoom() {
  const roomCode  = useStore(s => s.roomCode);
  const peers     = useStore(s => s.peers);
  const pending   = useStore(s => s.pendingJoiners);
  const navigate  = useNavigate();
  const [copied,   setCopied]   = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);

  useEffect(() => { if (!roomCode) navigate('/'); }, [roomCode, navigate]);

  useEffect(() => {
    const t = setInterval(() => setTimeLeft(p => p <= 1 ? 30 : p - 1), 1000);
    return () => clearInterval(t);
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const segments = roomCode ? roomCode.split('-') : [];

  return (
    <div style={{ background: C.bg, minHeight: '100dvh', color: C.text, fontFamily: font, overflowX: 'hidden' }}>

      {/* Subtle top glow */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: 'radial-gradient(ellipse 60% 30% at 50% -5%, rgba(255,255,255,0.04) 0%, transparent 70%)' }} />

      {/* ── Top bar ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 40,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px clamp(16px,3vw,32px)',
        borderBottom: `1px solid ${C.border}`,
        backdropFilter: 'blur(24px)', background: 'rgba(0,0,0,0.8)',
      }}>
        {/* Logo + status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 26, height: 26, borderRadius: 7, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#000', fontSize: 13, fontWeight: 800 }}>N</span>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em' }}>Host Dashboard</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.success, boxShadow: `0 0 6px ${C.success}` }} />
              <span style={{ fontSize: 11, color: C.sub, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 500 }}>
                {peers.length} peer{peers.length !== 1 ? 's' : ''} connected
              </span>
            </div>
          </div>
        </div>

        {/* Header actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => useStore.getState().toggleChat()}
            style={{ fontSize: 13, fontWeight: 500, padding: '7px 16px', borderRadius: 9, background: C.surface, border: `1px solid ${C.border}`, color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}
            onMouseEnter={e => { e.currentTarget.style.color='#fff'; e.currentTarget.style.borderColor=C.borderHi; }}
            onMouseLeave={e => { e.currentTarget.style.color='rgba(255,255,255,0.6)'; e.currentTarget.style.borderColor=C.border; }}
          >Chat</button>
          <button
            onClick={() => navigate('/')}
            style={{ fontSize: 13, fontWeight: 500, padding: '7px 16px', borderRadius: 9, background: C.dangerBg, border: `1px solid ${C.dangerBd}`, color: C.danger, cursor: 'pointer' }}
            onMouseEnter={e => { e.currentTarget.style.background='rgba(255,80,72,0.18)'; }}
            onMouseLeave={e => { e.currentTarget.style.background=C.dangerBg; }}
          >End Session</button>
        </div>
      </header>

      {/* ── Main layout ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0,1fr) 300px',
        gap: 16,
        maxWidth: 1280,
        margin: '0 auto',
        padding: 'clamp(16px,2.5vw,24px) clamp(16px,3vw,32px)',
      }}
        className="host-grid"
      >
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

          {/* Room code card */}
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
            style={{ ...panel, padding: 'clamp(24px,4vw,40px) clamp(20px,3vw,32px)', textAlign: 'center', position: 'relative', overflow: 'hidden' }}
          >
            {/* Rotating border glow */}
            <div style={{
              position: 'absolute', inset: 0, borderRadius: 16, pointerEvents: 'none',
              background: 'conic-gradient(from 0deg, transparent 0%, rgba(255,255,255,0.06) 40%, rgba(255,255,255,0.18) 50%, rgba(255,255,255,0.06) 60%, transparent 100%)',
              animation: 'spin 8s linear infinite',
            }} />

            <div style={{ position: 'relative', zIndex: 1 }}>
              {/* Code display */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'clamp(12px,2.5vw,24px)', marginBottom: 16, flexWrap: 'wrap' }}>
                {segments.map((seg, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'clamp(12px,2.5vw,24px)' }}>
                    <span style={{
                      fontFamily: 'ui-monospace,monospace', fontWeight: 700,
                      fontSize: 'clamp(28px,5vw,52px)', letterSpacing: '0.1em',
                      color: '#fff', textTransform: 'uppercase',
                      textShadow: '0 0 20px rgba(255,255,255,0.15)',
                    }}>{seg}</span>
                    {i < segments.length - 1 && (
                      <span style={{ color: 'rgba(255,255,255,0.12)', fontSize: 'clamp(28px,5vw,52px)', fontWeight: 200, lineHeight: 1 }}>|</span>
                    )}
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, color: C.muted, letterSpacing: '0.05em', textTransform: 'uppercase', fontWeight: 500 }}>
                  Share this code to invite devices
                </span>
                <motion.button
                  whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.9 }}
                  onClick={handleCopy}
                  style={{ width: 30, height: 30, borderRadius: '50%', background: C.surface, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                >
                  {copied
                    ? <CheckIcon style={{ width: 14, height: 14, color: C.success, strokeWidth: 3 }} />
                    : <ClipboardDocumentIcon style={{ width: 14, height: 14, color: C.sub }} />
                  }
                </motion.button>
              </div>

              <AnimatePresence>
                {copied && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    style={{ position: 'absolute', bottom: -40, left: '50%', transform: 'translateX(-50%)',
                      background: C.surface, border: `1px solid ${C.borderHi}`, backdropFilter: 'blur(12px)',
                      padding: '6px 16px', borderRadius: 100, fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }}
                  >Copied!</motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          {/* Pending joiners */}
          <AnimatePresence>
            {pending.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                style={{ overflow: 'hidden' }}
              >
                <div style={{ ...panel, padding: '20px 24px', border: '1px solid rgba(59,130,246,0.25)', background: 'rgba(59,130,246,0.04)' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#60a5fa', marginBottom: 14 }}>
                    Pending Requests
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {pending.map(j => (
                      <div key={j.socketId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 16px' }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 500 }}>{j.name}</div>
                          <div style={{ fontSize: 11, color: C.sub, textTransform: 'capitalize', marginTop: 2 }}>{j.type}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => useStore.getState().denyPendingJoiner(j.socketId)}
                            style={{ fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 100, background: C.surface, border: `1px solid ${C.border}`, color: C.sub, cursor: 'pointer' }}>Deny</button>
                          <button onClick={() => useStore.getState().acceptPendingJoiner(j.socketId)}
                            style={{ fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 100, background: '#fff', border: 'none', color: '#000', cursor: 'pointer' }}>Accept</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* QR + Drop zone row */}
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}
            style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}
          >
            {/* QR panel */}
            <div style={{ ...panel, padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <QRDisplay roomCode={roomCode} />
              <div style={{ width: '100%', height: 2, borderRadius: 2, overflow: 'hidden', background: 'rgba(255,255,255,0.05)' }}>
                <motion.div
                  initial={{ width: '100%' }} animate={{ width: '0%' }}
                  transition={{ duration: 30, ease: 'linear', repeat: Infinity }}
                  style={{ height: '100%', background: '#fff', borderRadius: 2 }}
                />
              </div>
              <div style={{ fontSize: 11, color: C.muted, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 500 }}>
                Refreshes in {timeLeft}s
              </div>
            </div>

            {/* Drop zone */}
            <div style={{ flex: 1, minWidth: 240 }}>
              <DropZone />
            </div>
          </motion.div>

          {/* Active transfers */}
          <ActiveTransfersGrid />
        </div>

        {/* Right column — peers panel */}
        <div style={{ position: 'sticky', top: 72, height: 'calc(100vh - 88px)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ ...panel, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '20px 16px 16px' }}>
            {/* Panel header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, paddingBottom: 14, borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.success, boxShadow: `0 0 6px ${C.success}`, animation: 'pulse 2s infinite' }} />
                <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.success }}>Live</span>
              </div>
              <span style={{ fontSize: 11, color: C.muted, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 500 }}>{peers.length} Peers</span>
            </div>

            {/* Orbit */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
              <PeerOrbit peers={peers} />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto', paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
              <button
                onClick={() => useStore.getState().toggleChat()}
                style={{ width: '100%', height: 44, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = C.borderHi}
                onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
              >Chat</button>
              <button
                onClick={() => navigate('/')}
                style={{ width: '100%', height: 44, background: C.dangerBg, border: `1px solid ${C.dangerBd}`, borderRadius: 10, color: C.danger, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,80,72,0.18)'}
                onMouseLeave={e => e.currentTarget.style.background = C.dangerBg}
              >End Session</button>
            </div>
          </div>
        </div>
      </div>

      {/* Responsive: collapse to single column on mobile */}
      <style>{`
        @media (max-width: 768px) {
          .host-grid {
            grid-template-columns: 1fr !important;
          }
        }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
      `}</style>

      <ChatOverlay />
    </div>
  );
}
