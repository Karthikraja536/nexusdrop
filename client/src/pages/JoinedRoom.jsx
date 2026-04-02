import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon, ArrowDownTrayIcon, PlusIcon } from '@heroicons/react/24/outline';
import { DocumentIcon, ComputerDesktopIcon, PhotoIcon, VideoCameraIcon } from '@heroicons/react/24/solid';
import { useNavigate } from 'react-router-dom';
import { useRef, useEffect, useState } from 'react';
import useStore from '../store/useStore';
import { GlassPanel, fadeUp } from '../components/ui';
import { TransferManager } from '../utils/transferManager';

import { ChatBubbleLeftIcon } from '@heroicons/react/24/solid';
import ChatOverlay from '../components/ChatOverlay';

export default function JoinedRoom() {
  const roomCode = useStore(state => state.roomCode);
  const isDisconnected = useStore(state => state.isDisconnected);
  const peers = useStore(state => state.peers);
  
  // Extract state cleanly to avoid Zustand breaking React 18 snapshot caching loops
  const activeTransfersMap = useStore(state => state.activeTransfers);
  const activeTransfers = Object.entries(activeTransfersMap || {});
  
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  
  // Drag State
  const [isGlobalDragging, setIsGlobalDragging] = useState(false);

  // Guard: if store cleared, go home
  useEffect(() => {
    if (!roomCode) navigate('/');
  }, [roomCode, navigate]);

  const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const handleFiles = (files) => {
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) => {
      peers.forEach((peerNode) => {
        if (peerNode.conn && peerNode.conn.open) {
          TransferManager.sendFile(peerNode.conn, file, (fileId, progress) => {
            useStore.getState().updateTransferProgress(fileId, { name: file.name, type: file.type, size: file.size, direction: 'upload' }, progress);
            if (progress === 100) {
              useStore.getState().completeTransfer(fileId, { name: file.name, type: file.type, size: file.size, direction: 'upload' }, null); 
            }
          });
        }
      });
    });
  };

  const handleGlobalDrop = (e) => {
    e.preventDefault();
    setIsGlobalDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  return (
    <div 
      className="min-h-[100dvh] bg-darkBg text-textPrimary p-6 md:p-10 relative overflow-hidden flex flex-col items-center"
      onDragOver={(e) => { e.preventDefault(); setIsGlobalDragging(true); }}
      onDragLeave={(e) => { e.preventDefault(); if (e.currentTarget === e.target) setIsGlobalDragging(false); }}
      onDrop={handleGlobalDrop}
    >
      <input type="file" multiple className="hidden" ref={fileInputRef} onChange={(e) => handleFiles(e.target.files)} />
      
      {/* Global Drag Overlay */}
      <AnimatePresence>
        {isGlobalDragging && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[200] bg-accentBlue/20 backdrop-blur-sm border-4 border-dashed border-accentBlue m-4 rounded-[32px] flex items-center justify-center pointer-events-none"
          >
            <div className="bg-surface2 px-8 py-6 rounded-3xl flex flex-col items-center shadow-2xl">
              <ArrowDownTrayIcon className="w-16 h-16 text-accentBlue mb-4 animate-bounce" />
              <p className="text-xl font-bold text-white">Drop files to send to everyone</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      <div className="aurora-bg opacity-40">
        <div className="aurora-blob blob-1"></div>
        <div className="aurora-blob blob-3"></div>
      </div>

      <div className="w-full max-w-[1200px] z-10 flex flex-col gap-8 h-full">
        {/* Header */}
        <motion.div {...fadeUp} className="w-full">
          <GlassPanel className="flex items-center justify-between py-5 px-6">
            <div className="flex items-center space-x-4">
              <div className="w-[48px] h-[48px] rounded-full bg-surface2 border border-borderSubtle flex items-center justify-center">
                <ComputerDesktopIcon className="w-6 h-6 text-white/70" />
              </div>
              <div className="flex flex-col justify-center gap-1.5">
                {/* Dynamically indicate number of peers if multiple, otherwise fallback text */}
                <h2 className="text-[17px] font-[600] text-white tracking-[-0.01em] leading-none">
                   {peers.length > 0 ? (peers.length === 1 ? peers[0].name : `${peers.length} Devices Connected`) : 'NexusDrop P2P Lobby'}
                </h2>
                <div className="flex items-center space-x-2">
                  <div className="w-[6px] h-[6px] rounded-full bg-success shadow-[0_0_8px_#30D158] animate-pulse-dot"></div>
                  <span className="text-[12px] font-mono font-[600] text-textTertiary uppercase tracking-widest leading-none">{roomCode}</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <motion.button 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => useStore.getState().toggleChat()}
                className="w-[44px] h-[44px] bg-surface2 border border-borderSubtle text-textSecondary hover:text-white rounded-full flex items-center justify-center transition-colors shadow-lg cursor-pointer"
              >
                <ChatBubbleLeftIcon className="w-5 h-5" />
              </motion.button>
              <motion.button 
                whileHover={{ scale: 1.05, backgroundColor: 'rgba(255,67,58,0.25)' }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                   useStore.getState().reset();
                   navigate('/');
                }}
                className="w-[44px] h-[44px] bg-[rgba(255,67,58,0.15)] border border-[rgba(255,67,58,0.3)] text-danger rounded-full flex items-center justify-center transition-colors shadow-lg cursor-pointer"
              >
                <XMarkIcon className="w-5 h-5 stroke-[2.5px]" />
              </motion.button>
            </div>
          </GlassPanel>
        </motion.div>

        {/* Content area: Grid of mapped files explicitly mapped over the Store */}
        <div className="flex-1 w-full flex flex-col">
          <motion.h3 {...fadeUp} transition={{ delay: 0.1 }} className="text-caption-bold text-textSecondary mb-5 border-b border-borderSubtle pb-2 pl-2">ACTIVE TRANSFER RECORDS</motion.h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 w-full">
            <AnimatePresence>
              {activeTransfers.map(([fileId, transfer]) => {
                const { metadata, progress, status, blobUrl } = transfer;
                const isComplete = status === 'completed';
                const isImage = metadata?.type?.startsWith('image/');
                const isVideo = metadata?.type?.startsWith('video/');

                return (
                  <motion.div 
                    key={fileId}
                    initial={{ opacity: 0, y: 16, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    className="relative rounded-[20px] bg-surface2 border border-borderActive overflow-hidden h-[160px] flex flex-col group w-full"
                  >
                    {/* Dynamic Progress Bar mapped to Zustand native percentage */}
                    {!isComplete && (
                      <div className="absolute top-0 left-0 h-[2px] bg-accentBlue shadow-blue-glow transition-all duration-200 z-50" style={{ width: `${progress}%` }}></div>
                    )}
                    
                    <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden bg-surface1">
                        {isComplete && isImage && blobUrl ? (
                          <img src={blobUrl} alt={metadata?.name} draggable="true" className="absolute inset-0 w-full h-full object-cover" />
                        ) : isComplete && isVideo && blobUrl ? (
                          <video src={blobUrl} className="absolute inset-0 w-full h-full object-cover opacity-60" autoPlay muted loop />
                        ) : (
                           isImage ? <PhotoIcon className="w-[48px] h-[48px] text-accentPurple drop-shadow-lg z-10" /> :
                           isVideo ? <VideoCameraIcon className="w-[48px] h-[48px] text-accentPurple drop-shadow-lg z-10" /> :
                           <DocumentIcon className={`w-[48px] h-[48px] z-10 ${isComplete ? 'text-textSecondary' : 'text-accentBlue drop-shadow-[0_0_16px_rgba(10,132,255,0.4)]'}`} />
                        )}
                        {/* Dimmer for completed images/videos to let text pop */}
                        {isComplete && (isImage || isVideo) && <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent mix-blend-multiply" />}
                    </div>
                    
                    <div className="min-h-[56px] border-t border-borderSubtle bg-surface1 px-5 flex items-center justify-between z-10">
                      <div className="flex flex-col min-w-0 pr-4 flex-1">
                        <span className="text-[13px] font-[500] text-textPrimary truncate mb-0.5">{metadata?.name || 'Unknown File'}</span>
                        <div className="flex items-center justify-between w-full">
                          <span className="text-[11px] text-textTertiary">{formatBytes(metadata?.size)}</span>
                          {!isComplete && <span className="text-[11px] text-accentBlue font-mono">{progress}%</span>}
                        </div>
                      </div>
                      
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
                      
                      {/* Local confirmation rendering */}
                      {isComplete && metadata.direction === 'upload' && (
                        <span className="text-[11px] text-success font-[600] tracking-wider uppercase drop-shadow-md">Sent</span>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            
            {/* Empty State Mock */}
            {activeTransfers.length === 0 && (
               <div className="col-span-1 md:col-span-2 lg:col-span-3 flex flex-col items-center justify-center p-12 opacity-50 border border-dashed border-borderSubtle rounded-[20px] bg-surface1 mt-2">
                  <DocumentIcon className="w-10 h-10 text-textTertiary mb-3" />
                  <p className="text-[15px] font-[500] text-textSecondary">No transfers yet.</p>
                  <p className="text-[13px] text-textTertiary mt-1 text-center">Tap the + natively on a mobile device,<br/>or drag-and-drop a file anywhere.</p>
               </div>
            )}
            
          </div>
        </div>
      </div>

      <motion.button 
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => fileInputRef.current?.click()}
        className="fixed bottom-[40px] right-[40px] w-[64px] h-[64px] bg-accentBlue text-white rounded-full flex items-center justify-center shadow-blue-glow z-50 transition-all cursor-pointer"
      >
        <PlusIcon className="w-8 h-8 stroke-2" />
      </motion.button>
      <ChatOverlay />

      {/* Disconnected Overlay */}
      <AnimatePresence>
        {isDisconnected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-md flex flex-col items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="flex flex-col items-center gap-6 text-center px-8"
            >
              <div className="w-20 h-20 rounded-full bg-[rgba(255,67,58,0.15)] border border-[rgba(255,67,58,0.4)] flex items-center justify-center">
                <XMarkIcon className="w-10 h-10 text-danger" />
              </div>
              <div>
                <p className="text-xl font-bold text-white mb-1">Session Ended</p>
                <p className="text-sm text-textSecondary">The host disconnected from the session.</p>
              </div>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => { useStore.getState().reset(); navigate('/'); }}
                className="px-8 py-3 bg-accentBlue rounded-2xl text-white font-semibold text-sm shadow-blue-glow"
              >
                Return Home
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
