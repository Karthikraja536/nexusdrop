import { motion, AnimatePresence } from 'framer-motion';
import { ArrowDownTrayIcon, XMarkIcon, CheckIcon } from '@heroicons/react/24/outline';
import { DocumentIcon, PhotoIcon, VideoCameraIcon } from '@heroicons/react/24/solid';
import useStore from '../store/useStore';

const premiumEasing = [0.32, 0.72, 0, 1];

export default function ActiveTransfersGrid() {
  const activeTransfersMap = useStore(state => state.activeTransfers);
  const activeTransfers = Object.entries(activeTransfersMap || {});

  const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  if (activeTransfers.length === 0) return (
    <div className="flex-1 w-full flex flex-col items-center justify-center opacity-50">
       <DocumentIcon className="w-16 h-16 text-white/20 mb-4" />
       <p className="text-white/50 text-sm font-medium tracking-wide">No active transfers</p>
    </div>
  );

  return (
    <div className="flex-1 w-full flex flex-col overflow-y-auto pr-4 pb-12 custom-scrollbar">
      <motion.div 
        initial={{ opacity: 0, y: -10 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ duration: 0.6, ease: premiumEasing }}
        className="flex items-center mb-8"
      >
        <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10">
          <h3 className="text-[10px] font-bold text-white/70 uppercase tracking-[0.2em]">Active Transfers</h3>
        </div>
      </motion.div>
      
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 w-full">
        <AnimatePresence>
          {activeTransfers.map(([fileId, transfer], index) => {
            const { metadata, progress, status, blobUrl, speed, transportType } = transfer;
            const isComplete = status === 'completed';
            const isFailed = status === 'failed';
            const isImage = metadata?.type?.startsWith('image/');
            const isVideo = metadata?.type?.startsWith('video/');
            const isUpload = metadata?.direction === 'upload';
            
            const speedString = typeof speed === 'number' ? formatBytes(speed) + '/s' : '...';
            const transport = transportType || 'webrtc';
            
            const themeColorHex = isUpload ? '#06B6D4' : '#8B5CF6';
            const isIncoming = !isUpload && progress === 0 && !isComplete && !isFailed;

            const radius = 36;
            const circumference = 2 * Math.PI * radius;
            const strokeDashoffset = circumference - (progress / 100) * circumference;

            return (
              <motion.div 
                key={fileId}
                initial={{ opacity: 0, y: 30, scale: 0.95, filter: 'blur(8px)' }}
                animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, scale: 0.9, filter: 'blur(4px)' }}
                transition={{ duration: 0.7, ease: premiumEasing, delay: index * 0.05 }}
                className="group relative"
              >
                {/* Outer Shell */}
                <div className="w-full p-2 rounded-[2rem] bg-black/20 border border-white/5 hover:border-white/10 transition-all duration-500 shadow-[0_16px_40px_rgba(0,0,0,0.5)] active:scale-[0.98]">
                  
                  {/* Inner Core */}
                  <div className="relative w-full rounded-[calc(2rem-8px)] bg-white/5 backdrop-blur-2xl border-t border-white/10 flex flex-col overflow-hidden">
                    
                    <div className="absolute -top-24 -right-24 w-48 h-48 rounded-full opacity-20 blur-3xl pointer-events-none" style={{ backgroundColor: themeColorHex }}></div>

                    <div className="p-5 sm:p-6 flex items-center gap-4 sm:gap-6">
                      
                      {/* Circular Progress Island */}
                      <div className="relative w-20 h-20 sm:w-24 sm:h-24 shrink-0 flex items-center justify-center">
                        <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 100 100">
                          <circle cx="50" cy="50" r={radius} className="stroke-white/5" strokeWidth="6" fill="none" />
                          <circle 
                            cx="50" cy="50" r={radius} 
                            stroke={themeColorHex} 
                            strokeWidth="6" fill="none" strokeLinecap="round"
                            style={{ 
                              strokeDasharray: circumference, 
                              strokeDashoffset: isComplete ? 0 : strokeDashoffset,
                              transition: 'stroke-dashoffset 0.3s cubic-bezier(0.32,0.72,0,1)'
                            }}
                            className={isComplete ? 'drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]' : ''}
                          />
                        </svg>

                        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-black/40 border border-white/10 flex items-center justify-center overflow-hidden z-10 shadow-[inset_0_1px_2px_rgba(255,255,255,0.1)]">
                          {isComplete && isImage && blobUrl ? (
                            <img src={blobUrl} alt={metadata?.name} className="w-full h-full object-cover" />
                          ) : isComplete && isVideo && blobUrl ? (
                            <video src={blobUrl} className="w-full h-full object-cover opacity-80" autoPlay muted loop />
                          ) : (
                            <div className={`transition-all duration-500 ${isIncoming ? 'animate-pulse' : ''}`}>
                              {isImage ? <PhotoIcon className={`w-6 h-6 ${isUpload ? 'text-accentCyan' : 'text-accentPurple'}`} /> :
                               isVideo ? <VideoCameraIcon className={`w-6 h-6 ${isUpload ? 'text-accentCyan' : 'text-accentPurple'}`} /> :
                               <DocumentIcon className={`w-6 h-6 ${isUpload ? 'text-accentCyan' : 'text-accentPurple'}`} />}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Info Section */}
                      <div className="flex flex-col flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          <span className={`text-[9px] uppercase font-bold tracking-[0.15em] px-2 py-0.5 rounded-full border ${isUpload ? 'bg-accentCyan/10 text-accentCyan border-accentCyan/20' : 'bg-accentPurple/10 text-accentPurple border-accentPurple/20'}`}>
                            {isUpload ? 'Sending' : 'Receiving'}
                          </span>
                          
                          <div className="flex items-center space-x-1.5 px-2 py-0.5 bg-black/20 border border-white/5 rounded-full">
                            <div className={`w-1 h-1 rounded-full ${transport === 'webrtc' ? 'bg-green-400 shadow-[0_0_8px_#4ade80]' : 'bg-orange-400 shadow-[0_0_8px_#fb923c]'}`}></div>
                            <span className="text-[9px] uppercase font-bold text-white/50 tracking-wider">{transport === 'webrtc' ? 'Direct' : 'Relay'}</span>
                          </div>
                        </div>

                        <span className="text-[14px] sm:text-[15px] font-semibold text-white truncate drop-shadow-sm mb-1">{metadata?.name || 'Unknown File'}</span>
                        
                        {isIncoming ? (
                           <span className="text-xs text-white/40 font-medium animate-pulse">Incoming File...</span>
                        ) : isComplete ? (
                           <span className="text-xs text-green-400 font-medium flex items-center gap-1"><CheckIcon className="w-3 h-3 stroke-2"/> Transfer Complete</span>
                        ) : isFailed ? (
                           <span className="text-xs text-red-400 font-medium">Transfer Failed</span>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs font-medium">
                            <span className="text-white/70">{formatBytes(metadata?.size)}</span>
                            <span className="w-1 h-1 rounded-full bg-white/20 hidden sm:block"></span>
                            <span className={`${isUpload ? 'text-accentCyan' : 'text-accentPurple'} drop-shadow-[0_0_4px_currentColor]`}>{speedString}</span>
                            <span className="w-1 h-1 rounded-full bg-white/20 hidden sm:block"></span>
                            <span className="text-white/90 font-mono">{progress}%</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Bottom Action Bar */}
                    <div className="border-t border-white/5 bg-black/30 p-2 sm:p-3 flex justify-between items-center z-20">
                       <p className="text-[9px] sm:text-[10px] text-white/30 uppercase tracking-widest pl-2">ID: {fileId.split('-')[0]}</p>
                       
                       <div className="flex items-center gap-2">
                         {isComplete && !isUpload && blobUrl && (
                            <motion.a 
                              href={blobUrl} download={metadata?.name}
                              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                              className={`group relative pl-4 pr-1 py-1 ${isUpload ? 'bg-accentCyan shadow-[0_0_20px_rgba(6,182,212,0.4)]' : 'bg-accentPurple shadow-[0_0_20px_rgba(139,92,246,0.4)]'} text-black text-xs font-bold rounded-full transition-all flex items-center space-x-3 cursor-pointer no-underline`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span>Save File</span>
                              <div className="w-6 h-6 rounded-full bg-black/20 flex items-center justify-center transition-transform group-hover:translate-x-0.5 group-hover:scale-105">
                                <ArrowDownTrayIcon className="w-3 h-3 stroke-2 text-black" />
                              </div>
                            </motion.a>
                         )}

                         {(isComplete || isFailed) && (
                            <button 
                              onClick={(e) => { e.stopPropagation(); useStore.getState().dismissTransfer(fileId); }}
                              className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30 text-white/50 transition-all duration-300"
                              title="Clear transfer"
                            >
                              <XMarkIcon className="w-4 h-4" />
                            </button>
                         )}
                       </div>
                    </div>

                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
