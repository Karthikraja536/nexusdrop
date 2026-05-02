import { motion } from 'framer-motion';
import { ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import { useState, useRef } from 'react';
import useStore from '../store/useStore';
import { TransferManager } from '../utils/transferManager';

export default function DropZone() {
  const [isDragging, setIsDragging] = useState(false);
  const peers = useStore(state => state.peers);
  const fileInputRef = useRef(null);

  const handleFiles = (files) => {
    if (!files || files.length === 0) return;
    
    Array.from(files).forEach((file) => {
      peers.forEach((peerNode) => {
        if ((peerNode.dataChannel && peerNode.dataChannel.readyState === 'open') || peerNode.relayMode) {
          TransferManager.sendFile(peerNode, file, (fileId, progress, speed, transport) => {
            useStore.getState().updateTransferProgress(fileId, {
               name: file.name, type: file.type, size: file.size, direction: 'upload' 
            }, progress, speed, transport);
            
            if (progress === 100) {
              useStore.getState().completeTransfer(fileId, { 
                name: file.name, type: file.type, size: file.size, direction: 'upload' 
              }, null); 
            }
          });
        }
      });
    });
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <>
      <input type="file" multiple className="hidden" ref={fileInputRef} onChange={(e) => handleFiles(e.target.files)} />
      
      <motion.div 
        className="w-full flex-1 relative group cursor-pointer h-48 xl:h-64 rounded-3xl p-[1px] overflow-hidden"
        animate={{ scale: isDragging ? 1.02 : 1 }}
        onDragEnter={() => setIsDragging(true)}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className={`absolute inset-0 transition-opacity duration-500 animate-gradient-x ${isDragging ? 'opacity-100 bg-gradient-to-br from-accentPurple via-accentBlue to-accentCyan' : 'opacity-40 bg-gradient-to-br from-white/10 to-white/5 group-hover:opacity-100 group-hover:from-accentPurple group-hover:via-accentBlue group-hover:to-accentCyan'}`}></div>
        
        <div className={`absolute inset-[1px] rounded-3xl flex flex-col items-center justify-center transition-colors duration-300 ${isDragging ? 'bg-black/60 backdrop-blur-md' : 'bg-black/90 backdrop-blur-xl'}`}>
          <motion.div animate={{ y: [-4, 0, -4] }} transition={{ duration: 3, ease: "easeInOut", repeat: Infinity }}>
            <ArrowUpTrayIcon className={`w-12 h-12 mb-4 transition-colors duration-300 stroke-[1.5px] ${isDragging ? 'text-accentCyan drop-shadow-[0_0_12px_rgba(6,182,212,0.6)]' : 'text-white/40 group-hover:text-white'}`} />
          </motion.div>
          
          <div className={`text-base font-medium tracking-wide mb-1 transition-colors duration-300 ${isDragging ? 'text-white' : 'text-white/50 group-hover:text-white'}`}>
            {isDragging ? 'Drop it like it\'s hot' : 'Click or Drop Files Here'}
          </div>
          <div className="text-xs text-white/30 font-medium tracking-wider uppercase mt-1">Direct P2P Transfer</div>
        </div>
      </motion.div>
    </>
  );
}
