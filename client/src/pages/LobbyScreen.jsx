import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ComputerDesktopIcon, XMarkIcon } from '@heroicons/react/24/solid';
import { useNavigate } from 'react-router-dom';
import useStore from '../store/useStore';
import { GlassPanel, RadarRing, fadeUp } from '../components/ui';

export default function LobbyScreen() {
  const navigate = useNavigate();
  const roomCode = useStore(state => state.roomCode);

  // Guard: if store cleared, go home
  useEffect(() => {
    if (!roomCode) navigate('/');
  }, [roomCode, navigate]);
  
  const hostPeerId = useStore(state => state.hostPeerId);
  const [status, setStatus] = useState('waiting');
  
  useEffect(() => {
    if (hostPeerId) {
      setStatus('admitted');
      const t = setTimeout(() => navigate('/room'), 800);
      return () => clearTimeout(t);
    }
  }, [hostPeerId, navigate]);

  return (
    <div className="relative min-h-[100dvh] bg-darkBg text-textPrimary flex flex-col items-center justify-center overflow-hidden">
      <div className="aurora-bg opacity-70 mix-blend-screen">
        <div className="aurora-blob blob-1"></div>
        <div className="aurora-blob blob-2" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}></div>
      </div>
      
      {status === 'waiting' && (
        <div className="absolute inset-0 flex items-center justify-center mt-[-80px] pointer-events-none z-[1]">
          <RadarRing active speed={3.6} size={360} />
        </div>
      )}
      
      {status === 'admitted' && (
        <div className="absolute inset-0 flex items-center justify-center mt-[-80px] pointer-events-none z-[1]">
          <RadarRing active speed={0.6} size={360} />
        </div>
      )}

      {status === 'admitted' && (
        <motion.div 
           initial={{ scale: 1, opacity: 0 }}
           animate={{ scale: 30, opacity: 1 }}
           transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
           className="absolute w-[120px] h-[120px] bg-darkBg rounded-full z-[15] pointer-events-none"
           style={{ marginTop: '-80px' }}
        />
      )}

      <div className="z-[20] text-center px-4 w-full flex flex-col items-center mt-[-80px]">
        <motion.div 
           animate={status === 'denied' ? { x: [-8, 8, -4, 4, 0], borderColor: 'rgba(255,67,58,1)' } : {}}
           transition={status === 'denied' ? { duration: 0.4 } : {}}
           className="w-[120px] h-[120px] rounded-full bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.06)] backdrop-blur-[40px] flex items-center justify-center shadow-[0_8px_32px_rgba(0,0,0,0.5)] z-30"
        >
          {status === 'denied' ? (
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={springBounce}>
               <XMarkIcon className="w-12 h-12 text-[#FF453A]" />
             </motion.div>
          ) : (
             <ComputerDesktopIcon className="w-[48px] h-[48px] text-[rgba(255,255,255,0.9)]" />
          )}
        </motion.div>
        
        <div className="mt-12 flex flex-col items-center relative z-[25]">
          {status === 'denied' ? (
            <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-[17px] text-[#FF453A] font-[600]">
              Access denied by host
            </motion.p>
          ) : (
            <>
              <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="text-[15px] text-[rgba(255,255,255,0.45)]">
                Waiting for host to admit you...
              </motion.p>
              <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="text-[12px] font-[500] tracking-[0.08em] uppercase text-[rgba(255,255,255,0.25)] mt-3 font-mono">
                {roomCode}
              </motion.p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
