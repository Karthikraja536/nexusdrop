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
    
    // Broadcast newly selected files to ALL connected WebRTC peers explicitly 
    const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB Crash Guard
    
    Array.from(files).forEach((file) => {
      // Memory Size Guard Check
      if (file.size > MAX_FILE_SIZE) {
         alert(`File "${file.name}" is too massive (${(file.size / (1024*1024)).toFixed(1)}MB). The ephemeral P2P network enforces a rigid 200MB limit to prevent browser memory crashes!`);
         return;
      }

      peers.forEach((peerNode) => {
        if ((peerNode.conn && peerNode.conn.open) || peerNode.relayMode) {
          
          TransferManager.sendFile(peerNode, file, (fileId, progress, speed, transport) => {
            
            // Mark the visual upload bar strictly natively in Zustand 
            useStore.getState().updateTransferProgress(fileId, {
               name: file.name, 
               type: file.type, 
               size: file.size, 
               direction: 'upload' 
            }, progress, speed, transport);
            
            if (progress === 100) {
              useStore.getState().completeTransfer(fileId, { 
                name: file.name, 
                type: file.type, 
                size: file.size, 
                direction: 'upload' 
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
        className={`w-full flex-1 border-[2px] border-dashed rounded-[20px] flex flex-col items-center justify-center cursor-pointer transition-colors duration-300 relative overflow-hidden bg-[rgba(255,255,255,0.015)]`}
        style={{ 
          borderColor: isDragging ? '#0A84FF' : 'rgba(255,255,255,0.12)',
          backgroundColor: isDragging ? 'rgba(10,132,255,0.08)' : 'rgba(255,255,255,0.02)'
        }}
        animate={{ scale: isDragging ? 1.02 : 1 }}
        onDragEnter={() => setIsDragging(true)}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileInputRef.current?.click()}
      >
          <motion.div animate={{ y: [-4, 0, -4] }} transition={{ duration: 3, ease: "easeInOut", repeat: Infinity }}>
            <ArrowUpTrayIcon className="w-[44px] h-[44px] mb-5 transition-colors duration-300 stroke-[1.5px]" style={{ color: isDragging ? '#0A84FF' : 'rgba(255,255,255,0.25)' }} />
          </motion.div>
          <div className="text-[17px] font-[400] tracking-[-0.01em] mb-1.5 transition-colors duration-300" style={{ color: isDragging ? '#0A84FF' : 'rgba(255,255,255,0.5)' }}>Drop files here</div>
          <div className="text-[14px] text-textTertiary font-[400]">or click to browse</div>
      </motion.div>
    </>
  );
}
