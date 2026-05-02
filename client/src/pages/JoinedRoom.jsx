import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon, ArrowDownTrayIcon, PlusIcon } from '@heroicons/react/24/outline';
import { ComputerDesktopIcon } from '@heroicons/react/24/solid';
import { ChatBubbleLeftIcon } from '@heroicons/react/24/solid';
import { useNavigate } from 'react-router-dom';
import { useRef, useEffect, useState } from 'react';
import useStore from '../store/useStore';
import { TransferManager } from '../utils/transferManager';
import ChatOverlay from '../components/ChatOverlay';
import ActiveTransfersGrid from '../components/ActiveTransfersGrid';

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

const font = "-apple-system,BlinkMacSystemFont,'SF Pro Display','Inter',sans-serif";

export default function JoinedRoom() {
  const roomCode        = useStore(s => s.roomCode);
  const isDisconnected  = useStore(s => s.isDisconnected);
  const peers           = useStore(s => s.peers);
  const activeTransfers = useStore(s => s.activeTransfers);
  const navigate        = useNavigate();
  const fileInputRef    = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => { if (!roomCode) navigate('/'); }, [roomCode, navigate]);

  const handleFiles = (files) => {
    if (!files || files.length === 0) return;
    Array.from(files).forEach(file => {
      peers.forEach(peer => {
        if ((peer.dataChannel && peer.dataChannel.readyState === 'open') || peer.relayMode) {
          TransferManager.sendFile(peer, file, (fileId, progress, speed, transport) => {
            useStore.getState().updateTransferProgress(fileId, { name: file.name, type: file.type, size: file.size, direction: 'upload', peerId: peer.id }, progress, speed, transport);
            if (progress === 100) useStore.getState().completeTransfer(fileId, { name: file.name, type: file.type, size: file.size, direction: 'upload' }, null);
          });
        }
      });
    });
  };

  return (
    <div
      style={{ background: C.bg, minHeight: '100dvh', color: C.text, fontFamily: font, overflowX: 'hidden', position: 'relative' }}
      onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={e => { if (e.currentTarget === e.target) setIsDragging(false); }}
      onDrop={e => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
    >
      <input type="file" multiple className="hidden" ref={fileInputRef} onChange={e => handleFiles(e.target.files)} />

      {/* Subtle glow */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: 'radial-gradient(ellipse 60% 30% at 50% -5%, rgba(255,255,255,0.04) 0%, transparent 70%)' }} />

      {/* Global drag overlay */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 16, zIndex: 200,
              background: 'rgba(255,255,255,0.03)',
              border: '2px dashed rgba(255,255,255,0.25)',
              borderRadius: 20, backdropFilter: 'blur(8px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <ArrowDownTrayIcon style={{ width: 48, height: 48, color: 'rgba(255,255,255,0.5)', margin: '0 auto 12px', animation: 'bounce 1s infinite' }} />
              <p style={{ fontSize: 18, fontWeight: 600, color: '#fff' }}>Drop to send</p>
              <p style={{ fontSize: 13, color: C.sub, marginTop: 4 }}>Files will be sent to all connected devices</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Header ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 40,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px clamp(16px,3vw,32px)',
        borderBottom: `1px solid ${C.border}`,
        backdropFilter: 'blur(24px)', background: 'rgba(0,0,0,0.8)',
      }}>
        {/* Device info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: C.surface, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <ComputerDesktopIcon style={{ width: 18, height: 18, color: 'rgba(255,255,255,0.5)' }} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.2 }}>
              {peers.length > 0
                ? peers.length === 1 ? peers[0].name : `${peers.length} Devices Connected`
                : 'Host Device'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.success, boxShadow: `0 0 6px ${C.success}` }} />
              <span style={{ fontSize: 11, fontFamily: 'ui-monospace,monospace', color: C.sub, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                {roomCode}
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => useStore.getState().toggleChat()}
            style={{ width: 38, height: 38, borderRadius: 10, background: C.surface, border: `1px solid ${C.border}`, color: C.sub, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onMouseEnter={e => { e.currentTarget.style.color='#fff'; e.currentTarget.style.borderColor=C.borderHi; }}
            onMouseLeave={e => { e.currentTarget.style.color=C.sub; e.currentTarget.style.borderColor=C.border; }}
          >
            <ChatBubbleLeftIcon style={{ width: 17, height: 17 }} />
          </button>
          <button
            onClick={() => { useStore.getState().reset(); navigate('/'); }}
            style={{ width: 38, height: 38, borderRadius: 10, background: C.dangerBg, border: `1px solid ${C.dangerBd}`, color: C.danger, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onMouseEnter={e => e.currentTarget.style.background='rgba(255,80,72,0.18)'}
            onMouseLeave={e => e.currentTarget.style.background=C.dangerBg}
          >
            <XMarkIcon style={{ width: 17, height: 17, strokeWidth: 2.5 }} />
          </button>
        </div>
      </header>

      {/* ── Content ── */}
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: 'clamp(16px,2.5vw,24px) clamp(16px,3vw,32px)', position: 'relative', zIndex: 1 }}>

        {/* Empty state — no transfers yet */}
        {Object.keys(activeTransfers || {}).length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            style={{
              border: '2px dashed rgba(255,255,255,0.08)',
              borderRadius: 16, padding: 'clamp(48px,8vw,80px) 24px',
              textAlign: 'center', marginBottom: 20,
            }}
          >
            <div style={{ fontSize: 36, marginBottom: 16 }}>↑</div>
            <p style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 6 }}>Drop files anywhere</p>
            <p style={{ fontSize: 13, color: C.sub, marginBottom: 24 }}>
              Or tap the + button to browse and send files to the host
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{ fontSize: 13, fontWeight: 600, padding: '10px 24px', borderRadius: 10, background: '#fff', color: '#000', border: 'none', cursor: 'pointer' }}
            >Browse Files</button>
          </motion.div>
        )}

        {/* Active transfers */}
        <ActiveTransfersGrid />
      </div>

      {/* ── FAB ── */}
      <motion.button
        whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}
        onClick={() => fileInputRef.current?.click()}
        style={{
          position: 'fixed', bottom: 32, right: 32,
          width: 56, height: 56, borderRadius: '50%',
          background: '#fff', color: '#000', border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 8px 32px rgba(255,255,255,0.15)', cursor: 'pointer', zIndex: 50,
        }}
      >
        <PlusIcon style={{ width: 24, height: 24, strokeWidth: 2.5 }} />
      </motion.button>

      {/* ── Disconnected overlay ── */}
      <AnimatePresence>
        {isDisconnected && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <motion.div
              initial={{ scale: 0.92, y: 16 }} animate={{ scale: 1, y: 0 }}
              style={{ textAlign: 'center', padding: '0 24px' }}
            >
              <div style={{ width: 72, height: 72, borderRadius: '50%', background: C.dangerBg, border: `1px solid ${C.dangerBd}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                <XMarkIcon style={{ width: 32, height: 32, color: C.danger, strokeWidth: 2.5 }} />
              </div>
              <p style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>Session Ended</p>
              <p style={{ fontSize: 14, color: C.sub, marginBottom: 28 }}>The host disconnected from the session.</p>
              <button
                onClick={() => { useStore.getState().reset(); navigate('/'); }}
                style={{ fontSize: 14, fontWeight: 600, padding: '12px 28px', borderRadius: 11, background: '#fff', color: '#000', border: 'none', cursor: 'pointer' }}
              >Return Home</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes bounce { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-8px); } }
      `}</style>

      <ChatOverlay />
    </div>
  );
}
