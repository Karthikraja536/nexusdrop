import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import useStore from '../store/useStore';
import { generateRoomCode } from '../utils/codeGenerator';
import { GlassPanel, Button, fadeUp, springSnap, springFloat, RadarRing } from '../components/ui';

export default function Landing() {
  const navigate = useNavigate();
  const setRoomCode = (code) => useStore.setState({ roomCode: code });
  const setIsHost = (val) => useStore.setState({ isHost: val });
  const [cursorPhase, setCursorPhase] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setCursorPhase(false), 800);
    return () => clearTimeout(t);
  }, []);

  const handleCreate = () => {
    setIsHost(true);
    setRoomCode(generateRoomCode());
    navigate('/host');
  };

  const handleJoin = () => {
    setIsHost(false);
    navigate('/join');
  };

  return (
    <div className="relative min-h-screen bg-darkBg text-textPrimary flex flex-col items-center justify-center overflow-hidden">
      <div className="aurora-bg">
        <div className="aurora-blob blob-1"></div>
        <div className="aurora-blob blob-2"></div>
        <div className="aurora-blob blob-3"></div>
      </div>
      
      <div className="absolute inset-0 flex items-center justify-center mt-[-100px] pointer-events-none z-0">
        <RadarRing active speed={2.4} size={280} />
      </div>

      <div className="z-10 text-center px-4 w-full max-w-[360px] flex flex-col items-center relative mt-32">
        <motion.div {...fadeUp} className="flex flex-col items-center relative">
          <h1 className="text-[48px] font-[700] tracking-[-0.03em] text-white">
            NexusDrop
          </h1>
          <p className="text-[14px] text-textSecondary mt-2 flex items-center h-5">
            Instant. Local. Private.
            <span className={`w-[8px] h-4 bg-textSecondary ml-[4px] opacity-0 transition-opacity duration-150 ${cursorPhase ? 'opacity-100' : 'opacity-0'}`}></span>
          </p>
        </motion.div>
        
        <div className="w-full flex flex-col gap-[12px] mt-16">
          <motion.div {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.1 }}>
            <Button variant="primary" onClick={handleCreate}>
              Create a Drop
            </Button>
          </motion.div>
          <motion.div {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.15 }}>
            <Button variant="ghost" onClick={handleJoin}>
              Join a Drop
            </Button>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
