import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ClipboardDocumentIcon, CheckIcon } from '@heroicons/react/24/outline';
import useStore from '../store/useStore';
import { useNavigate } from 'react-router-dom';
import { GlassPanel, fadeUp, springSnap } from '../components/ui';
import PeerOrbit from '../components/PeerOrbit';
import DropZone from '../components/DropZone';
import QRShredder from '../components/QRShredder';
import ChatOverlay from '../components/ChatOverlay';

export default function HostRoom() {
  const roomCode = useStore(state => state.roomCode);
  const navigate = useNavigate();

  // Guard: if store was cleared (e.g. page refresh), go back to home
  useEffect(() => {
    if (!roomCode) {
      navigate('/');
    }
  }, [roomCode, navigate]);
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);
  const peers = useStore(state => state.peers);

  useEffect(() => {
    // Synchronized 30s countdown mapping to QR decay visually
    const t = setInterval(() => {
      setTimeLeft(prev => prev <= 1 ? 30 : prev - 1);
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const segments = roomCode ? roomCode.split('-') : [];

  return (
    <div className="min-h-[100dvh] bg-darkBg text-textPrimary flex flex-col items-center p-6 md:p-10 relative overflow-hidden">
      <div className="aurora-bg">
        <div className="aurora-blob blob-1"></div>
        <div className="aurora-blob blob-2"></div>
      </div>

      <div className="w-full max-w-[1400px] flex flex-col lg:flex-row gap-8 mt-2 z-10 h-full flex-1">
        
        <div className="flex-[6.5] flex flex-col gap-8 h-full">
          
          <motion.div {...fadeUp} className="w-full">
            <GlassPanel className="w-full flex flex-col items-center justify-center py-[48px] relative overflow-hidden border-gradient-rotate">
              <div className="flex space-x-[24px] mb-[16px]">
                {segments.map((seg, i) => (
                  <div key={i} className="flex items-center space-x-[24px]">
                    <span className="text-roomcode uppercase text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.15)]">{seg}</span>
                    {i < segments.length - 1 && <span className="text-[rgba(255,255,255,0.15)] text-[64px] font-[300] leading-none mb-1">|</span>}
                  </div>
                ))}
              </div>
              <div className="text-caption-bold text-textTertiary flex items-center space-x-3 mt-2">
                <span>Share this code to invite devices</span>
                <motion.button 
                  whileHover={{ scale: 1.15 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={handleCopy}
                  className="w-[32px] h-[32px] rounded-full bg-surface2 border border-borderSubtle flex items-center justify-center cursor-pointer"
                >
                  {copied ? <CheckIcon className="w-4 h-4 text-success stroke-[3px]" /> : <ClipboardDocumentIcon className="w-4 h-4 text-textSecondary" />}
                </motion.button>
              </div>
              
              <AnimatePresence>
                {copied && (
                  <motion.div 
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: -25 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 1.2, ease: "easeOut" }}
                    className="absolute bg-surface2 backdrop-blur-md px-4 py-2 rounded-full text-white text-[13px] font-[500] border border-borderActive shadow-lg"
                  >
                    Copied!
                  </motion.div>
                )}
              </AnimatePresence>
            </GlassPanel>
          </motion.div>

          <div className="flex flex-col lg:flex-row gap-8 items-stretch w-full flex-1">
            
            <motion.div {...fadeUp} transition={{ delay: 0.1 }} className="flex flex-col items-center shrink-0">
               <QRShredder roomCode={roomCode} />
               <div className="w-[280px] h-[4px] rounded-[2px] overflow-hidden bg-white/[0.05] relative">
                  <motion.div 
                    initial={{ width: '100%' }}
                    animate={{ width: '0%' }}
                    transition={{ duration: 30, ease: 'linear', repeat: Infinity }}
                    className="absolute top-0 left-0 h-full bg-gradient-to-r from-accentBlue to-accentPurple"
                  />
               </div>
               <div className="text-caption-bold text-textSecondary mt-3">Refreshes in {timeLeft}s</div>
            </motion.div>

            <motion.div {...fadeUp} transition={{ delay: 0.2 }} className="flex-1 w-full flex flex-col min-h-[320px]">
              <DropZone />
            </motion.div>
          </div>
        </div>

        <div className="flex-[3.5] flex flex-col min-h-[600px] lg:h-[calc(100vh-80px)] lg:sticky top-10">
          <GlassPanel className="flex-1 flex flex-col relative pt-8 pb-6 px-4">
             <div className="w-full flex justify-between items-center absolute top-6 left-6 right-6 px-1">
                <div className="flex items-center space-x-2">
                  <div className="bg-success rounded-full w-[6px] h-[6px] shadow-[0_0_8px_#30D158] animate-pulse-dot"></div>
                  <span className="text-caption-bold text-success font-[700]">LIVE</span>
                </div>
                <div className="text-caption-bold text-textTertiary">{peers.length} PEERS</div>
             </div>

             <div className="flex-1 flex items-center justify-center w-full min-h-[350px]">
                <PeerOrbit peers={peers} />
             </div>

             <div className="flex flex-col gap-[12px] w-full px-2 mt-auto">
               <motion.button 
                 onClick={() => useStore.getState().toggleChat()}
                 whileHover={{ scale: 1.02 }}
                 whileTap={{ scale: 0.98 }}
                 transition={springSnap}
                 className="w-full h-[56px] bg-surface2 border border-borderActive rounded-[16px] text-textPrimary font-[600] text-[15px] shadow-[0_2px_10px_rgba(0,0,0,0.2)]"
               >
                 Chat
               </motion.button>
               <motion.button 
                 whileHover={{ scale: 1.02, backgroundColor: 'rgba(255,67,58,0.25)' }}
                 whileTap={{ scale: 0.98 }}
                 transition={springSnap}
                 onClick={() => navigate('/')}
                 className="w-full h-[56px] bg-[rgba(255,67,58,0.15)] border border-[rgba(255,67,58,0.3)] rounded-[16px] text-danger font-[600] text-[15px] transition-colors"
               >
                 End Session
               </motion.button>
             </div>
          </GlassPanel>
        </div>

      </div>
      <ChatOverlay />
    </div>
  );
}
