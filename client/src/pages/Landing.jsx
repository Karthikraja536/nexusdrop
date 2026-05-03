import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import useStore from '../store/useStore';
import { generateRoomCode } from '../utils/codeGenerator';

const Sparkles = () => (
  <div style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none', zIndex: 10 }}>
    {[...Array(5)].map((_, i) => (
      <motion.div
        key={i}
        animate={{
          y: [0, -40],
          x: [0, (i % 2 === 0 ? 1 : -1) * (Math.random() * 20)],
          opacity: [0, 0.8, 0],
          scale: [0, Math.random() * 0.6 + 0.4, 0]
        }}
        transition={{ duration: 1.5 + Math.random(), repeat: Infinity, delay: Math.random() * 2, ease: "easeOut" }}
        style={{
          position: 'absolute', left: '20%', top: '50%',
          width: 3, height: 3, borderRadius: '50%', background: '#fff',
          boxShadow: '0 0 6px rgba(255,255,255,0.8)'
        }}
      />
    ))}
  </div>
);

const MagicButton = ({ text, icon, onClick, variant = 'primary' }) => {
  const isPrimary = variant === 'primary';
  const [isHovered, setIsHovered] = useState(false);
  
  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.98 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      animate={isPrimary ? {
        boxShadow: [
          'inset 0 2px 2px rgba(255,255,255,0.4), inset 0 -2px 4px rgba(0,0,0,0.25), 0 0 0 4px rgba(168, 85, 247, 0.2), 0 8px 24px rgba(139, 92, 246, 0.4)',
          'inset 0 2px 2px rgba(255,255,255,0.4), inset 0 -2px 4px rgba(0,0,0,0.25), 0 0 0 8px rgba(168, 85, 247, 0.3), 0 12px 36px rgba(139, 92, 246, 0.6)',
          'inset 0 2px 2px rgba(255,255,255,0.4), inset 0 -2px 4px rgba(0,0,0,0.25), 0 0 0 4px rgba(168, 85, 247, 0.2), 0 8px 24px rgba(139, 92, 246, 0.4)'
        ],
        backgroundPosition: ['0% 50%', '100% 50%', '0% 50%']
      } : {}}
      transition={{ 
        boxShadow: { repeat: Infinity, duration: 2, ease: "easeInOut" },
        backgroundPosition: { repeat: Infinity, duration: 4, ease: "easeInOut" }
      }}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 28px',
        borderRadius: 999,
        background: isPrimary 
          ? 'linear-gradient(135deg, #8B5CF6 0%, #D946EF 100%)' 
          : 'rgba(20, 20, 30, 0.5)',
        backgroundSize: isPrimary ? '200% 200%' : 'auto',
        border: isPrimary ? 'none' : '1px solid rgba(255,255,255,0.1)',
        color: '#fff', cursor: 'pointer',
        backdropFilter: isPrimary ? 'none' : 'blur(16px)',
        WebkitBackdropFilter: isPrimary ? 'none' : 'blur(16px)',
        position: 'relative',
        overflow: 'visible', /* Allow particles to fly out */
      }}
    >
      {/* Hide overflow specifically for the background shimmer, not the whole button */}
      <div style={{ position: 'absolute', inset: 0, borderRadius: 999, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
        {/* Shimmer Sweep Animation */}
        {isPrimary && (
          <motion.div
            animate={{ left: ['-100%', '200%'] }}
            transition={{ repeat: Infinity, duration: 0.8, ease: 'linear', repeatDelay: 3 }}
            style={{
              position: 'absolute', top: 0, bottom: 0, width: '30%',
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.1) 45%, rgba(255,255,255,0.5) 50%, rgba(255,255,255,0.1) 55%, transparent 100%)',
              transform: 'skewX(-25deg)',
            }}
          />
        )}
      </div>

      {isPrimary && <Sparkles />}

      <motion.div 
        animate={isPrimary ? { scale: [1, 1.05, 1], opacity: [0.9, 1, 0.9] } : {}}
        transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
        style={{ display: 'flex', color: isPrimary ? '#fff' : 'rgba(255,255,255,0.7)', transform: 'translateY(-1px)', zIndex: 2, position: 'relative' }}
      >
        {icon}
      </motion.div>
      <span style={{ 
        fontSize: 16, fontWeight: 600, letterSpacing: '0.01em', 
        fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Display','Inter',sans-serif",
        textShadow: isPrimary ? '0 1px 2px rgba(0,0,0,0.2)' : 'none',
        zIndex: 2, position: 'relative'
      }}>
        {text}
      </span>
    </motion.button>
  );
};

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
      background: 'linear-gradient(180deg, #AC68F2 0%, #4E00C9 40%, #1A1E4C 100%)',
      minHeight: '100dvh', color: '#fff',
      fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Display','Inter',sans-serif",
      overflowX: 'hidden', position: 'relative',
    }}>

      {/* Subtle Twilight Glow */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: 'radial-gradient(circle at 50% 10%, rgba(255,255,255,0.15) 0%, transparent 60%)'
      }} />

      {/* Wavy Pattern Overlay */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'100\' height=\'20\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M0 10 Q 25 2, 50 10 T 100 10\' fill=\'none\' stroke=\'rgba(255,255,255,0.1)\' stroke-width=\'1\'/%3E%3C/svg%3E")',
        backgroundSize: '100px 20px',
        backgroundRepeat: 'repeat',
        maskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 70%)',
        WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 70%)'
      }} />

      {/* ── Navbar ── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px clamp(20px,4vw,40px)',
        background: 'transparent',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', color: '#fff' }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10,
            background: 'linear-gradient(135deg, #ffffff 0%, #e0e0e0 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(255,255,255,0.15), inset 0 2px 0 rgba(255,255,255,0.8), inset 0 -1px 0 rgba(0,0,0,0.1)'
          }}>
            <span style={{ color: '#050508', fontSize: 16, fontFamily: "'Anton', sans-serif", letterSpacing: 0, transform: 'translateY(1px)' }}>N</span>
          </div>
          NexusDrop
        </div>

        {/* Nav actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={handleJoin}
            style={{ fontSize: 13, fontWeight: 600, padding: '8px 18px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', transition: 'all 0.2s', backdropFilter: 'blur(8px)' }}
            onMouseEnter={e => { e.currentTarget.style.color='#fff'; e.currentTarget.style.background='rgba(255,255,255,0.08)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.15)'; }}
            onMouseLeave={e => { e.currentTarget.style.color='rgba(255,255,255,0.6)'; e.currentTarget.style.background='rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.08)'; }}
          >Join a Drop</button>
          <button
            onClick={handleCreate}
            style={{ fontSize: 13, fontWeight: 700, padding: '8px 20px', borderRadius: 10, background: 'linear-gradient(180deg, #FFFFFF 0%, #F5F5F5 100%)', border: 'none', color: '#3A0099', cursor: 'pointer', boxShadow: '0 4px 12px rgba(255,255,255,0.15), inset 0 1px 0 rgba(255,255,255,1)', transition: 'all 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.transform='translateY(-1px)'; e.currentTarget.style.boxShadow='0 6px 16px rgba(255,255,255,0.2), inset 0 1px 0 rgba(255,255,255,1)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='0 4px 12px rgba(255,255,255,0.15), inset 0 1px 0 rgba(255,255,255,1)'; }}
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



          {/* Headline */}
          <h1 style={{
            fontFamily: "'Anton', sans-serif",
            fontSize: 'clamp(54px, 11vw, 110px)', fontWeight: 'normal',
            letterSpacing: '0.02em', lineHeight: 0.9, marginBottom: 24,
            textTransform: 'uppercase',
            background: 'linear-gradient(180deg, #FFFFFF 0%, #A0B0D0 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            display: 'inline-block',
            filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.4))'
          }}>
            Instant<br />File Sharing
          </h1>

          {/* Sub */}
          <p style={{
            fontFamily: "'Emilio Test', serif",
            fontStyle: 'italic',
            fontSize: 'clamp(15px, 2vw, 18px)', color: 'rgba(255,255,255,0.45)',
            lineHeight: 1.65, maxWidth: 380, marginBottom: 48,
          }}>
            Peer-to-peer transfers over your local network.<br />
            No accounts. No servers. No file size limits.
          </p>

          {/* CTAs */}
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
            <MagicButton
              text="Create a Drop"
              onClick={handleCreate}
              variant="primary"
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: 2 }}>
                  <path d="M12 2C12 7.52285 16.4772 12 22 12C16.4772 12 12 16.4772 12 22C12 16.4772 7.52285 12 2 12C7.52285 12 12 7.52285 12 2Z"/>
                  <path d="M19 2C19 4.20914 20.7909 6 23 6C20.7909 6 19 7.79086 19 10C19 7.79086 17.2091 6 15 6C17.2091 6 19 4.20914 19 2Z"/>
                </svg>
              }
            />
            <MagicButton
              text="Join a Drop"
              onClick={handleJoin}
              variant="secondary"
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 2 }}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              }
            />
          </div>
        </motion.div>


      </section>

      {/* ── Infinite Marquee ── */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: '16px 0', overflow: 'hidden',
        background: 'transparent',
        zIndex: 10,
        display: 'flex',
      }}>
        <div style={{ display: 'flex', width: '200%', minWidth: 'max-content' }} className="animate-marquee">
          {/* First set */}
          <div style={{ width: '50%', display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
            <span style={{ fontFamily: "'Clash Display', sans-serif", fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>WebRTC Technology</span>
            <span style={{ color: 'rgba(255,255,255,0.2)', margin: '0 4vw', display: 'flex', alignItems: 'center' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C12 6.627 17.373 12 24 12C17.373 12 12 17.373 12 24C12 17.373 6.627 12 0 12C6.627 12 12 6.627 12 0Z"/></svg>
            </span>
            <span style={{ fontFamily: "'Clash Display', sans-serif", fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>Zero Cloud Storage</span>
            <span style={{ color: 'rgba(255,255,255,0.2)', margin: '0 4vw', display: 'flex', alignItems: 'center' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C12 6.627 17.373 12 24 12C17.373 12 12 17.373 12 24C12 17.373 6.627 12 0 12C6.627 12 12 6.627 12 0Z"/></svg>
            </span>
            <span style={{ fontFamily: "'Clash Display', sans-serif", fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>End-to-End Encrypted</span>
            <span style={{ color: 'rgba(255,255,255,0.2)', margin: '0 4vw', display: 'flex', alignItems: 'center' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C12 6.627 17.373 12 24 12C17.373 12 12 17.373 12 24C12 17.373 6.627 12 0 12C6.627 12 12 6.627 12 0Z"/></svg>
            </span>
            <span style={{ fontFamily: "'Clash Display', sans-serif", fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>No File Size Limits</span>
            <span style={{ color: 'rgba(255,255,255,0.2)', margin: '0 4vw', display: 'flex', alignItems: 'center' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C12 6.627 17.373 12 24 12C17.373 12 12 17.373 12 24C12 17.373 6.627 12 0 12C6.627 12 12 6.627 12 0Z"/></svg>
            </span>
            <span style={{ fontFamily: "'Clash Display', sans-serif", fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>Instant Local Discovery</span>
            <span style={{ color: 'rgba(255,255,255,0.2)', margin: '0 4vw', display: 'flex', alignItems: 'center' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C12 6.627 17.373 12 24 12C17.373 12 12 17.373 12 24C12 17.373 6.627 12 0 12C6.627 12 12 6.627 12 0Z"/></svg>
            </span>
          </div>
          {/* Duplicate for infinite scroll */}
          <div style={{ width: '50%', display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
            <span style={{ fontFamily: "'Clash Display', sans-serif", fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>WebRTC Technology</span>
            <span style={{ color: 'rgba(255,255,255,0.2)', margin: '0 4vw', display: 'flex', alignItems: 'center' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C12 6.627 17.373 12 24 12C17.373 12 12 17.373 12 24C12 17.373 6.627 12 0 12C6.627 12 12 6.627 12 0Z"/></svg>
            </span>
            <span style={{ fontFamily: "'Clash Display', sans-serif", fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>Zero Cloud Storage</span>
            <span style={{ color: 'rgba(255,255,255,0.2)', margin: '0 4vw', display: 'flex', alignItems: 'center' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C12 6.627 17.373 12 24 12C17.373 12 12 17.373 12 24C12 17.373 6.627 12 0 12C6.627 12 12 6.627 12 0Z"/></svg>
            </span>
            <span style={{ fontFamily: "'Clash Display', sans-serif", fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>End-to-End Encrypted</span>
            <span style={{ color: 'rgba(255,255,255,0.2)', margin: '0 4vw', display: 'flex', alignItems: 'center' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C12 6.627 17.373 12 24 12C17.373 12 12 17.373 12 24C12 17.373 6.627 12 0 12C6.627 12 12 6.627 12 0Z"/></svg>
            </span>
            <span style={{ fontFamily: "'Clash Display', sans-serif", fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>No File Size Limits</span>
            <span style={{ color: 'rgba(255,255,255,0.2)', margin: '0 4vw', display: 'flex', alignItems: 'center' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C12 6.627 17.373 12 24 12C17.373 12 12 17.373 12 24C12 17.373 6.627 12 0 12C6.627 12 12 6.627 12 0Z"/></svg>
            </span>
            <span style={{ fontFamily: "'Clash Display', sans-serif", fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>Instant Local Discovery</span>
            <span style={{ color: 'rgba(255,255,255,0.2)', margin: '0 4vw', display: 'flex', alignItems: 'center' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C12 6.627 17.373 12 24 12C17.373 12 12 17.373 12 24C12 17.373 6.627 12 0 12C6.627 12 12 6.627 12 0Z"/></svg>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
