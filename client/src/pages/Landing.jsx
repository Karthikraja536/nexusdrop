import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import useStore from '../store/useStore';
import { generateRoomCode } from '../utils/codeGenerator';

export default function Landing() {
  const navigate = useNavigate();
  const [hJ, setHJ] = useState(false);

  const handleCreate = () => {
    useStore.setState({ isHost: true, roomCode: generateRoomCode() });
    navigate('/host');
  };
  const handleJoin = () => {
    useStore.setState({ isHost: false });
    navigate('/join');
  };

  return (
    <div style={{
      background: '#000', minHeight: '100dvh', color: '#fff',
      fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Display','Inter',sans-serif",
      overflowX: 'hidden', position: 'relative',
    }}>

      {/* Subtle top glow */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: 'radial-gradient(ellipse 70% 40% at 50% -5%, rgba(255,255,255,0.05) 0%, transparent 70%)',
      }} />

      {/* Grid lines */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.02) 1px,transparent 1px)',
        backgroundSize: '80px 80px',
        maskImage: 'radial-gradient(ellipse 90% 60% at 50% 0%, black 30%, transparent 100%)',
      }} />

      {/* ── Navbar ── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px clamp(20px,4vw,40px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        backdropFilter: 'blur(24px)', background: 'rgba(0,0,0,0.75)',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>
          <div style={{ width: 26, height: 26, borderRadius: 7, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#000', fontSize: 13, fontWeight: 800 }}>N</span>
          </div>
          NexusDrop
        </div>

        {/* Nav actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={handleJoin}
            style={{ fontSize: 13, fontWeight: 500, padding: '7px 16px', borderRadius: 9, background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.55)', cursor: 'pointer' }}
            onMouseEnter={e => { e.currentTarget.style.color='#fff'; e.currentTarget.style.borderColor='rgba(255,255,255,0.2)'; }}
            onMouseLeave={e => { e.currentTarget.style.color='rgba(255,255,255,0.55)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.1)'; }}
          >Join a Drop</button>
          <button
            onClick={handleCreate}
            style={{ fontSize: 13, fontWeight: 600, padding: '7px 18px', borderRadius: 9, background: '#fff', border: 'none', color: '#000', cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.opacity='0.88'}
            onMouseLeave={e => e.currentTarget.style.opacity='1'}
          >Create a Drop</button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={{
        position: 'relative', zIndex: 1,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', textAlign: 'center',
        minHeight: '100dvh', padding: '110px clamp(20px,5vw,80px) 60px',
      }}>
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}
        >
          {/* Badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, marginBottom: 36,
            fontSize: 11, fontWeight: 500, letterSpacing: '0.09em', textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 100, padding: '5px 14px',
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(255,255,255,0.5)', display: 'inline-block' }} />
            WebRTC · Zero Cloud · Private
          </div>

          {/* Headline */}
          <h1 style={{
            fontSize: 'clamp(44px, 9vw, 88px)', fontWeight: 700,
            letterSpacing: '-0.04em', lineHeight: 0.95, marginBottom: 24, color: '#fff',
          }}>
            Instant<br />File Sharing.
          </h1>

          {/* Sub */}
          <p style={{
            fontSize: 'clamp(14px, 1.8vw, 16px)', color: 'rgba(255,255,255,0.38)',
            lineHeight: 1.65, maxWidth: 380, marginBottom: 48,
          }}>
            Peer-to-peer transfers over your local network.<br />
            No accounts. No servers. No file size limits.
          </p>

          {/* CTAs */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <motion.button
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.96 }}
              onClick={handleCreate}
              style={{ fontSize: 14, fontWeight: 600, padding: '13px 30px', borderRadius: 11, background: '#fff', color: '#000', border: 'none', cursor: 'pointer', letterSpacing: '-0.01em' }}
            >
              Create a Drop →
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.96 }}
              onClick={handleJoin}
              onMouseEnter={() => setHJ(true)}
              onMouseLeave={() => setHJ(false)}
              style={{
                fontSize: 14, fontWeight: 500, padding: '13px 30px', borderRadius: 11,
                background: 'rgba(255,255,255,0.05)', cursor: 'pointer', letterSpacing: '-0.01em',
                border: `1px solid ${hJ ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.1)'}`,
                color: hJ ? '#fff' : 'rgba(255,255,255,0.6)',
                transition: 'all 0.2s',
              }}
            >
              Join a Drop
            </motion.button>
          </div>
        </motion.div>


      </section>

      {/* ── Infinite Marquee ── */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: '16px 0', overflow: 'hidden',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(16px)',
        zIndex: 10,
        display: 'flex',
      }}>
        <div style={{ display: 'flex', width: '200%', minWidth: 'max-content' }} className="animate-marquee">
          {/* First set */}
          <div style={{ width: '50%', display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.15em', whiteSpace: 'nowrap' }}>WebRTC Technology</span>
            <span style={{ color: 'rgba(255,255,255,0.15)', margin: '0 4vw' }}>✦</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.15em', whiteSpace: 'nowrap' }}>Zero Cloud Storage</span>
            <span style={{ color: 'rgba(255,255,255,0.15)', margin: '0 4vw' }}>✦</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.15em', whiteSpace: 'nowrap' }}>End-to-End Encrypted</span>
            <span style={{ color: 'rgba(255,255,255,0.15)', margin: '0 4vw' }}>✦</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.15em', whiteSpace: 'nowrap' }}>No File Size Limits</span>
            <span style={{ color: 'rgba(255,255,255,0.15)', margin: '0 4vw' }}>✦</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.15em', whiteSpace: 'nowrap' }}>Instant Local Discovery</span>
            <span style={{ color: 'rgba(255,255,255,0.15)', margin: '0 4vw' }}>✦</span>
          </div>
          {/* Duplicate for infinite scroll */}
          <div style={{ width: '50%', display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.15em', whiteSpace: 'nowrap' }}>WebRTC Technology</span>
            <span style={{ color: 'rgba(255,255,255,0.15)', margin: '0 4vw' }}>✦</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.15em', whiteSpace: 'nowrap' }}>Zero Cloud Storage</span>
            <span style={{ color: 'rgba(255,255,255,0.15)', margin: '0 4vw' }}>✦</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.15em', whiteSpace: 'nowrap' }}>End-to-End Encrypted</span>
            <span style={{ color: 'rgba(255,255,255,0.15)', margin: '0 4vw' }}>✦</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.15em', whiteSpace: 'nowrap' }}>No File Size Limits</span>
            <span style={{ color: 'rgba(255,255,255,0.15)', margin: '0 4vw' }}>✦</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.15em', whiteSpace: 'nowrap' }}>Instant Local Discovery</span>
            <span style={{ color: 'rgba(255,255,255,0.15)', margin: '0 4vw' }}>✦</span>
          </div>
        </div>
      </div>
    </div>
  );
}
