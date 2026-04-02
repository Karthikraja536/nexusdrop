import { motion, AnimatePresence } from 'framer-motion';
import { ComputerDesktopIcon, DevicePhoneMobileIcon } from '@heroicons/react/24/solid';
import { springBounce } from './ui';

export default function PeerOrbit({ peers = [] }) {
  const displayPeers = peers.slice(0, 6);
  const totalPeersCount = peers.length;
  const radius = 120;
  
  const getPeerPosition = (index, total) => {
    const angle = (index / total) * (2 * Math.PI) - (Math.PI / 2);
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius
    };
  };

  return (
    <div className="relative flex items-center justify-center w-[300px] h-[300px] mx-auto mb-10 mt-10">
      
      <div className="absolute z-10 flex flex-col items-center justify-center pointer-events-none">
        <div className="w-[72px] h-[72px] rounded-full bg-[rgba(255,255,255,0.035)] border border-[rgba(255,255,255,0.06)] backdrop-blur-[20px] flex items-center justify-center shadow-[0_4px_24px_rgba(0,0,0,0.5)]">
          <ComputerDesktopIcon className="w-8 h-8 text-white/90 drop-shadow-lg" />
        </div>
        <div className="mt-3 text-[11px] text-[rgba(255,255,255,0.45)] font-[500] uppercase tracking-[0.08em]">You</div>
      </div>
      
      <div className="absolute w-[240px] h-[240px] rounded-full border border-white/[0.03] content-[''] pointer-events-none"></div>

      <AnimatePresence>
        {displayPeers.map((peer, i) => {
          const pos = getPeerPosition(i, displayPeers.length);
          const isPhone = peer.type === 'phone';
          const Icon = isPhone ? DevicePhoneMobileIcon : ComputerDesktopIcon;
          
          return (
            <motion.div
               key={peer.id}
               initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
               animate={{ opacity: 1, scale: 1, x: pos.x, y: pos.y }}
               exit={{ opacity: 0, scale: 0 }}
               transition={springBounce}
               className="absolute flex flex-col items-center justify-center"
               style={{ width: 60, height: 60, marginLeft: -30, marginTop: -30 }}
            >
               <div className="w-[60px] h-[60px] rounded-full bg-[rgba(255,255,255,0.07)] backdrop-blur-[20px] border-[1.5px] border-[#0A84FF] flex items-center justify-center shadow-[0_0_16px_rgba(10,132,255,0.3)]">
                  <Icon className="w-7 h-7 text-white" />
               </div>
               <div className="absolute top-[68px] text-[11px] text-[rgba(255,255,255,0.45)] font-[500] uppercase tracking-[0.08em] whitespace-nowrap">
                 {peer.name}
               </div>
               
               <motion.svg 
                 initial={{ opacity: 1, pathLength: 0 }}
                 animate={{ opacity: 0, pathLength: 1 }}
                 transition={{ duration: 1, ease: "easeOut" }}
                 className="absolute inset-0 pointer-events-none overflow-visible z-[-1]"
                 width="120" height="120"
                 style={{ left: -pos.x, top: -pos.y }}
               >
                  <path 
                     d={`M 60 60 L ${60+pos.x} ${60+pos.y}`} 
                     stroke="#0A84FF" 
                     strokeWidth="2" 
                     fill="none" 
                     strokeDasharray="4 4"
                  />
               </motion.svg>
            </motion.div>
          );
        })}
      </AnimatePresence>
      
      {totalPeersCount > 6 && (
        <motion.div
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1, x: getPeerPosition(6, 7).x, y: getPeerPosition(6, 7).y }}
          className="absolute w-[44px] h-[44px] rounded-full bg-[rgba(255,255,255,0.035)] backdrop-blur-[20px] border border-[rgba(255,255,255,0.06)] flex items-center justify-center ml-[-22px] mt-[-22px] shadow-lg"
        >
          <span className="text-[13px] font-[600] text-[rgba(255,255,255,0.45)]">+{totalPeersCount - 6}</span>
        </motion.div>
      )}
    </div>
  );
}
