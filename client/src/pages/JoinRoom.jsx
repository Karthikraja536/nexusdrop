import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { CameraIcon, ArrowLeftIcon, CheckIcon } from '@heroicons/react/24/outline';
import useStore from '../store/useStore';
import QRScanner from '../components/QRScanner';

export default function JoinRoom() {
  const [code, setCode] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const navigate = useNavigate();

  const handleJoin = (e) => {
    e.preventDefault();
    if (code.replace(/[^a-zA-Z0-9]/g, '').length < 3) return;
    
    const formattedCode = code.trim().replace(/[\s\.]+/g, '-').toLowerCase();
    
    setLoading(true);
    useStore.setState({ roomCode: formattedCode });
    
    setTimeout(() => {
      setLoading(false);
      setSuccess(true);
      setTimeout(() => navigate('/lobby'), 600);
    }, 1500);
  };

  return (
    <div className="relative min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 font-sans overflow-hidden">
      
      {/* Background Grid & Spotlight */}
      <div className="absolute inset-0 bg-grid-white/[0.04] bg-[length:32px_32px]">
        <div className="absolute inset-0 bg-black [mask-image:radial-gradient(ellipse_60%_60%_at_50%_0%,transparent_20%,black_100%)]"></div>
      </div>
      
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-lg h-[400px] opacity-20 pointer-events-none bg-accentCyan blur-[120px] rounded-full mix-blend-screen"></div>

      {/* Glass Navbar (Simple version for back button) */}
      <motion.nav 
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-6 py-3 glass-nav flex items-center justify-between w-[90%] max-w-5xl"
      >
        <button onClick={() => navigate('/')} className="flex items-center gap-2 text-textSecondary hover:text-white transition-colors">
          <ArrowLeftIcon className="w-5 h-5" />
          <span className="text-sm font-bold tracking-wide">Back to Home</span>
        </button>
      </motion.nav>
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md z-10 flex flex-col items-center mt-12"
      >
        <h1 className="text-4xl font-bold text-center tracking-tight text-white mb-3">Join a Drop</h1>
        <p className="text-textSecondary text-center mb-10">Enter the room code from the host's screen</p>
        
        <form onSubmit={handleJoin} className="w-full flex flex-col items-center gap-8 mb-12">
          
          <div className="w-full relative group">
            <div className={`absolute -inset-0.5 bg-gradient-to-r from-accentPurple to-accentCyan rounded-2xl blur opacity-30 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-gradient-x ${isFocused ? 'opacity-100 duration-200' : ''}`}></div>
            <input 
              type="text" 
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder="WORD·WORD·00"
              className="relative w-full h-16 bg-black border border-white/10 rounded-2xl px-6 text-2xl font-mono tracking-widest text-center uppercase text-white placeholder:text-white/20 focus:outline-none transition-all"
            />
          </div>

          <div className="w-full h-14 flex justify-center">
            <AnimatePresence mode="wait">
              {!loading && !success && (
                <motion.div 
                  key="btn"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="w-full"
                >
                  <button 
                    type="submit" 
                    disabled={!code}
                    className="w-full h-14 bg-white text-black font-bold rounded-full disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/90 transition-colors"
                  >
                    Join Room
                  </button>
                </motion.div>
              )}
              {loading && (
                <motion.div 
                  key="spin"
                  initial={{ opacity: 0, scale: 0.5, borderRadius: '100px' }}
                  animate={{ opacity: 1, scale: 1, width: 56 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  className="h-14 w-14 bg-accentCyan rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.5)]"
                >
                  <div className="w-6 h-6 rounded-full border-2 border-black/20 border-t-black animate-spin"></div>
                </motion.div>
              )}
              {success && (
                <motion.div 
                  key="check"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="h-14 w-14 bg-success rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.5)]"
                >
                  <CheckIcon className="w-8 h-8 text-black stroke-[3px]" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </form>

        <div className="flex items-center w-full mb-10">
          <div className="flex-1 border-t border-white/10"></div>
          <span className="px-4 text-[10px] font-bold text-textSecondary uppercase tracking-widest">Or Scan QR</span>
          <div className="flex-1 border-t border-white/10"></div>
        </div>

        <motion.button 
          onClick={(e) => { e.preventDefault(); setIsScannerOpen(true); }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white hover:bg-white/10 transition-colors cursor-pointer group"
        >
          <CameraIcon className="w-8 h-8 stroke-1 text-white/70 group-hover:text-white transition-colors" />
        </motion.button>
      </motion.div>

      <AnimatePresence>
        {isScannerOpen && (
          <QRScanner 
            onClose={() => setIsScannerOpen(false)}
            onScanSuccess={(decodedText) => {
              setIsScannerOpen(false);
              setCode(decodedText);
              const formattedCode = decodedText.trim().replace(/[\s\.]+/g, '-').toLowerCase();
              setLoading(true);
              useStore.setState({ roomCode: formattedCode });
              setTimeout(() => {
                setLoading(false);
                setSuccess(true);
                setTimeout(() => navigate('/lobby'), 600);
              }, 1500);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
