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

  if (activeTransfers.length === 0) return null; // Only show if transfers exist on Host/Client generically

  return (
    <div className="flex-1 w-full flex flex-col">
      <motion.h3 {...fadeUp} transition={{ delay: 0.1 }} className="text-caption-bold text-textSecondary mb-5 border-b border-borderSubtle pb-2 pl-2 mt-4">ACTIVE TRANSFER RECORDS</motion.h3>
      
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 w-full">
        <AnimatePresence>
          {activeTransfers.map(([fileId, transfer]) => {
            const { metadata, progress, status, blobUrl, speed, transportType } = transfer;
            const isComplete = status === 'completed';
            const isImage = metadata?.type?.startsWith('image/');
            const isVideo = metadata?.type?.startsWith('video/');
            const speedString = typeof speed === 'number' ? formatBytes(speed) + '/s' : 'Calculating...';
            const transport = transportType || 'webrtc'; // 'webrtc' or 'relay'

            return (
              <motion.div 
                key={fileId}
                initial={{ opacity: 0, y: 16, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="relative rounded-[20px] bg-surface2 border border-borderActive overflow-visible h-[160px] flex flex-col group w-full shadow-lg"
              >
                {/* Dynamic Progress Bar */}
                {!isComplete && (
                  <div className="absolute top-0 left-0 h-[2px] bg-accentBlue shadow-blue-glow transition-all duration-200 z-50 rounded-t-[20px]" style={{ width: `${progress}%` }}></div>
                )}
                
                {/* Transport Badge overlay */}
                <div className="absolute top-3 right-3 z-[60] group/badge flex flex-col items-end">
                   {transport === 'webrtc' ? (
                      <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-green-500/10 border border-green-500/20 rounded-full backdrop-blur-md cursor-help">
                         <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.6)]"></div>
                         <span className="text-[10px] uppercase font-bold text-green-400 tracking-wider drop-shadow-sm">Direct</span>
                      </div>
                   ) : (
                      <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-orange-500/10 border border-orange-500/20 rounded-full backdrop-blur-md cursor-help">
                         <div className="w-1.5 h-1.5 rounded-full bg-orange-400 shadow-[0_0_8px_rgba(251,146,60,0.6)]"></div>
                         <span className="text-[10px] uppercase font-bold text-orange-400 tracking-wider drop-shadow-sm">Relay</span>
                      </div>
                   )}
                   
                   {/* Tooltip dynamically matching Network Mode */}
                   <div className="mt-2 w-[220px] opacity-0 invisible group-hover/badge:opacity-100 group-hover/badge:visible transition-all duration-300 bg-surface3 border border-borderSubtle text-textSecondary text-[11px] leading-[1.4] p-3 rounded-[12px] shadow-2xl z-[100] origin-top-right scale-95 group-hover/badge:scale-100 pointer-events-none">
                      {transport === 'webrtc' 
                         ? 'Transferring directly between devices on your local network.'
                         : 'WebRTC connection failed — transferring through the cloud server. Speed is limited by your internet connection. For faster speeds, ensure both devices are on the same Wi-Fi or hotspot.'}
                   </div>
                </div>

                <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden bg-surface1 rounded-t-[20px]">
                    {isComplete && isImage && blobUrl ? (
                      <img src={blobUrl} alt={metadata?.name} draggable="true" className="absolute inset-0 w-full h-full object-cover" />
                    ) : isComplete && isVideo && blobUrl ? (
                      <video src={blobUrl} className="absolute inset-0 w-full h-full object-cover opacity-60" autoPlay muted loop />
                    ) : (
                       isImage ? <PhotoIcon className="w-[48px] h-[48px] text-accentPurple drop-shadow-lg z-10" /> :
                       isVideo ? <VideoCameraIcon className="w-[48px] h-[48px] text-accentPurple drop-shadow-lg z-10" /> :
                       <DocumentIcon className={`w-[48px] h-[48px] z-10 ${isComplete ? 'text-textSecondary' : 'text-accentBlue drop-shadow-[0_0_16px_rgba(10,132,255,0.4)]'}`} />
                    )}
                    {/* Dimmer */}
                    {isComplete && (isImage || isVideo) && <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent mix-blend-multiply" />}
                </div>
                
                <div className="min-h-[56px] border-t border-borderSubtle bg-surface1 px-5 flex items-center justify-between z-10 shrink-0 rounded-b-[20px]">
                  <div className="flex flex-col min-w-0 pr-4 flex-1">
                    <span className="text-[13px] font-[500] text-textPrimary truncate mb-0.5">{metadata?.name || 'Unknown File'}</span>
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center space-x-2 truncate">
                         <span className="text-[11px] text-textTertiary shrink-0">{formatBytes(metadata?.size)}</span>
                         {!isComplete && <span className="text-[11px] text-textTertiary opacity-60 shrink-0">•</span>}
                         {!isComplete && <span className="text-[11px] text-textTertiary truncate">{speedString}</span>}
                      </div>
                      {!isComplete && <span className="text-[11px] text-accentBlue font-mono shrink-0 ml-2">{progress}%</span>}
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    {isComplete && metadata.direction !== 'upload' && blobUrl && (
                      <motion.a 
                        href={blobUrl} download={metadata?.name}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="px-4 py-[6px] bg-accentBlue text-white text-[12px] font-[600] rounded-[100px] shadow-blue-glow transition-all flex items-center space-x-1 cursor-pointer no-underline z-20 relative"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ArrowDownTrayIcon className="w-3 h-3 stroke-[2.5px]" />
                        <span>Save</span>
                      </motion.a>
                    )}
                    
                    {isComplete && metadata.direction === 'upload' && (
                      <span className="text-[11px] text-success font-[600] tracking-wider uppercase drop-shadow-md">Sent</span>
                    )}
                    {status === 'failed' && (
                      <span className="text-[11px] text-danger font-[600] tracking-wider uppercase drop-shadow-md pb-0.5">Failed</span>
                    )}

                    {/* Hardware Memory Limiter Release Hook */}
                    {(isComplete || status === 'failed') && (
                      <button 
                        disabled={false}
                        autoFocus={false}
                        onClick={(e) => { e.stopPropagation(); useStore.getState().dismissTransfer(fileId); }}
                        className="ml-2 w-7 h-7 rounded-full bg-surface2 border border-borderSubtle flex items-center justify-center hover:bg-surface3 hover:text-danger text-textTertiary transition-colors z-20"
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
