import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { CameraIcon, ArrowRightIcon, ArrowLeftIcon, CheckIcon } from '@heroicons/react/24/outline';
import useStore from '../store/useStore';
import { fadeUp, springSnap, Button } from '../components/ui';

export default function JoinRoom() {
  const [code, setCode] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const handleJoin = (e) => {
    e.preventDefault();
    if (code.replace(/[^a-zA-Z0-9]/g, '').length < 3) return;
    
    // Natively intercept and transform "swift ocean 42" into valid format "swift-ocean-42"
    const formattedCode = code.trim().replace(/[\s\.]+/g, '-').toLowerCase();
    
    setLoading(true);
    useStore.setState({ roomCode: formattedCode });
    
    setTimeout(() => {
      setLoading(false);
      setSuccess(true);
      setTimeout(() => navigate('/lobby'), 600);
    }, 1500);
  };

  const handleInput = (e) => {
    // Basic auto-formatter for visual preview if desired, pure CSS covers uppercase
    setCode(e.target.value);
  };

  return (
    <div className="relative min-h-screen bg-darkBg text-textPrimary flex flex-col items-center justify-center p-6">
      <div className="aurora-bg">
        <div className="aurora-blob blob-1"></div>
        <div className="aurora-blob blob-2"></div>
      </div>

      <motion.button 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={() => navigate('/')}
        className="absolute top-[40px] left-[40px] text-textSecondary hover:text-white transition-colors cursor-pointer z-10"
      >
        <ArrowLeftIcon className="w-8 h-8 stroke-[1.5px]" />
      </motion.button>
      
      <motion.div 
        {...fadeUp}
        className="w-full max-w-[440px] z-10 flex flex-col items-center"
      >
        <h1 className="text-headline text-center text-white mb-2 tracking-[-0.03em] font-[700]">Join a Drop</h1>
        <p className="text-[17px] text-textSecondary mb-[56px] font-[400] text-center">Enter the room code from the host's screen</p>
        
        <form onSubmit={handleJoin} className="w-full flex flex-col items-center gap-[40px] mb-[48px]">
          
          <div className="w-full relative">
            <input 
              type="text" 
              autoFocus
              value={code}
              onChange={handleInput}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder="WORD·WORD·00"
              className="w-full h-[72px] bg-surface2 border rounded-[20px] px-6 text-[32px] font-mono tracking-[0.16em] text-center uppercase text-white placeholder:text-textTertiary focus:outline-none transition-all duration-200"
              style={{
                borderColor: isFocused ? 'rgba(10,132,255,0.6)' : 'rgba(255,255,255,0.18)',
                boxShadow: isFocused ? '0 0 0 3px rgba(10,132,255,0.25)' : 'none'
              }}
            />
          </div>

          <div className="w-full h-[56px] flex justify-center">
            <AnimatePresence mode="wait">
              {!loading && !success && (
                <motion.div 
                  key="btn"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="w-full"
                >
                  <Button variant="primary" type="submit" disabled={!code}>Join</Button>
                </motion.div>
              )}
              {loading && (
                <motion.div 
                  key="spin"
                  initial={{ opacity: 0, scale: 0.5, borderRadius: '100px' }}
                  animate={{ opacity: 1, scale: 1, width: 56 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  className="h-[56px] w-[56px] bg-accentBlue rounded-full flex items-center justify-center shadow-blue-glow"
                >
                  <div className="w-[24px] h-[24px] rounded-full border-[3px] border-white/30 border-t-white animate-spin"></div>
                </motion.div>
              )}
              {success && (
                <motion.div 
                  key="check"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="h-[56px] w-[56px] bg-accentBlue rounded-full flex items-center justify-center shadow-blue-glow"
                >
                  <CheckIcon className="w-8 h-8 text-white stroke-[3px]" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </form>

        <div className="flex items-center w-full mb-[48px]">
          <div className="flex-1 border-t border-borderSubtle"></div>
          <span className="text-caption-bold px-6 text-textTertiary whitespace-nowrap">OR SCAN QR CODE</span>
          <div className="flex-1 border-t border-borderSubtle"></div>
        </div>

        <motion.button 
          whileHover={{ scale: 1.05, boxShadow: "0 0 32px rgba(41,151,255,0.15)", backgroundColor: "rgba(255,255,255,0.08)" }}
          whileTap={{ scale: 0.95 }}
          className="w-[72px] h-[72px] rounded-full glass-panel flex items-center justify-center text-white transition-all cursor-pointer border border-borderSubtle"
        >
          <CameraIcon className="w-8 h-8 stroke-[1.5px] text-white/90" />
        </motion.button>
      </motion.div>
    </div>
  );
}
