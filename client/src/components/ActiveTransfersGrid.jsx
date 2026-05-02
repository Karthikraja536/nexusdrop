import { motion, AnimatePresence } from 'framer-motion';
import { ArrowDownTrayIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { DocumentIcon, PhotoIcon, VideoCameraIcon } from '@heroicons/react/24/solid';
import useStore from '../store/useStore';
import { fadeUp } from './ui';

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
       <p className="text-white/50 text-sm">No active transfers</p>
    </div>
  );

  return (
    <div className="flex-1 w-full flex flex-col overflow-y-auto pr-2 custom-scrollbar">
      <motion.h3 {...fadeUp} transition={{ delay: 0.1 }} className="text-xs font-bold text-textSecondary uppercase tracking-widest mb-6">Active Transfers</motion.h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
        <AnimatePresence>
          {activeTransfers.map(([fileId, transfer]) => {
            const { metadata, progress, status, blobUrl, speed, transportType } = transfer;
            const isComplete = status === 'completed';
            const isImage = metadata?.type?.startsWith('image/');
            const isVideo = metadata?.type?.startsWith('video/');
            const speedString = typeof speed === 'number' ? formatBytes(speed) + '/s' : 'Calculating...';
            const transport = transportType || 'webrtc';

            return (
              <motion.div 
                key={fileId}
                initial={{ opacity: 0, y: 16, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="relative rounded-2xl bg-black/40 border border-white/10 overflow-hidden flex flex-col group w-full shadow-lg hover:border-white/20 transition-colors"
              >
                {/* Dynamic Progress Bar */}
                {!isComplete && (
                  <div className="absolute top-0 left-0 h-[2px] bg-accentCyan shadow-[0_0_10px_#06B6D4] transition-all duration-200 z-50 rounded-t-2xl" style={{ width: `${progress}%` }}></div>
                )}
                
                {/* Transport Badge overlay */}
                <div className="absolute top-3 right-3 z-40 group/badge flex flex-col items-end">
                   {transport === 'webrtc' ? (
                      <div className="flex items-center space-x-1.5 px-2 py-1 bg-accentCyan/10 border border-accentCyan/20 rounded-full backdrop-blur-md">
                         <div className="w-1.5 h-1.5 rounded-full bg-accentCyan animate-pulse shadow-[0_0_8px_#06B6D4]"></div>
                         <span className="text-[9px] uppercase font-bold text-accentCyan tracking-wider">Direct</span>
                      </div>
                   ) : (
                      <div className="flex items-center space-x-1.5 px-2 py-1 bg-orange-500/10 border border-orange-500/20 rounded-full backdrop-blur-md">
                         <div className="w-1.5 h-1.5 rounded-full bg-orange-400 shadow-[0_0_8px_rgba(251,146,60,0.6)]"></div>
                         <span className="text-[9px] uppercase font-bold text-orange-400 tracking-wider">Relay</span>
                      </div>
                   )}
                </div>

                <div className="h-28 flex flex-col items-center justify-center relative overflow-hidden bg-white/5">
                    {isComplete && isImage && blobUrl ? (
                      <img src={blobUrl} alt={metadata?.name} draggable="true" className="absolute inset-0 w-full h-full object-cover" />
                    ) : isComplete && isVideo && blobUrl ? (
                      <video src={blobUrl} className="absolute inset-0 w-full h-full object-cover opacity-60" autoPlay muted loop />
                    ) : (
                       isImage ? <PhotoIcon className="w-10 h-10 text-accentPurple drop-shadow-lg z-10" /> :
                       isVideo ? <VideoCameraIcon className="w-10 h-10 text-accentPurple drop-shadow-lg z-10" /> :
                       <DocumentIcon className={`w-10 h-10 z-10 ${isComplete ? 'text-white/50' : 'text-accentCyan drop-shadow-[0_0_16px_rgba(6,182,212,0.4)]'}`} />
                    )}
                    {isComplete && (isImage || isVideo) && <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent mix-blend-multiply" />}
                </div>
                
                <div className="min-h-[64px] border-t border-white/10 bg-black/50 px-4 py-3 flex items-center justify-between z-10 shrink-0">
                  <div className="flex flex-col min-w-0 pr-4 flex-1">
                    <span className="text-[13px] font-medium text-white truncate mb-1">{metadata?.name || 'Unknown File'}</span>
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center space-x-2 truncate">
                         <span className="text-[11px] text-white/50 shrink-0">{formatBytes(metadata?.size)}</span>
                         {!isComplete && <span className="text-[11px] text-white/30 shrink-0">•</span>}
                         {!isComplete && <span className="text-[11px] text-white/50 truncate">{speedString}</span>}
                      </div>
                      {!isComplete && <span className="text-[11px] text-accentCyan font-mono font-bold shrink-0 ml-2">{progress}%</span>}
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    {isComplete && metadata.direction !== 'upload' && blobUrl && (
                      <motion.a 
                        href={blobUrl} download={metadata?.name}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="px-3 py-1.5 bg-accentCyan text-black text-xs font-bold rounded-full shadow-[0_0_12px_rgba(6,182,212,0.4)] transition-all flex items-center space-x-1 cursor-pointer no-underline z-20"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ArrowDownTrayIcon className="w-3 h-3 stroke-2" />
                        <span>Save</span>
                      </motion.a>
                    )}
                    
                    {isComplete && metadata.direction === 'upload' && (
                      <span className="text-[10px] text-success font-bold tracking-wider uppercase">Sent</span>
                    )}
                    {status === 'failed' && (
                      <span className="text-[10px] text-danger font-bold tracking-wider uppercase">Failed</span>
                    )}

                    {(isComplete || status === 'failed') && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); useStore.getState().dismissTransfer(fileId); }}
                        className="ml-2 w-7 h-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 hover:text-danger text-white/50 transition-colors z-20"
                        title="Clear from memory"
                      >
                        <XMarkIcon className="w-4 h-4" />
                      </button>
                    )}
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
