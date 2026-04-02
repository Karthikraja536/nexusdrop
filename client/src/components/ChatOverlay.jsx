import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XMarkIcon, PaperAirplaneIcon } from '@heroicons/react/24/solid';
import useStore from '../store/useStore';

export default function ChatOverlay() {
  const isChatOpen = useStore(state => state.isChatOpen);
  const toggleChat = useStore(state => state.toggleChat);
  const messages = useStore(state => state.messages);
  const sendMessage = useStore(state => state.sendMessage);
  
  const [text, setText] = useState('');
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isChatOpen]);

  const handleSend = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    sendMessage(text.trim());
    setText('');
  };

  return (
    <AnimatePresence>
      {isChatOpen && (
        <motion.div
           initial={{ y: '100%', opacity: 0 }}
           animate={{ y: 0, opacity: 1 }}
           exit={{ y: '100%', opacity: 0 }}
           transition={{ type: 'spring', damping: 25, stiffness: 200 }}
           className="fixed inset-x-0 bottom-0 md:inset-auto md:right-8 md:bottom-8 z-[100] w-full md:w-[380px] h-[85vh] md:h-[600px] bg-surface2 border-t md:border border-borderActive backdrop-blur-[40px] rounded-t-[24px] md:rounded-[24px] flex flex-col overflow-hidden shadow-[0_16px_40px_rgba(0,0,0,0.5)]"
        >
          {/* Header */}
          <div className="h-[64px] border-b border-borderSubtle bg-surface1 px-6 flex items-center justify-between shrink-0">
            <h3 className="text-[17px] font-[600] text-white">Room Chat</h3>
            <button onClick={toggleChat} className="w-[32px] h-[32px] rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors">
              <XMarkIcon className="w-5 h-5 text-textSecondary" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            {messages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center opacity-40">
                <span className="text-[14px]">No messages yet...</span>
              </div>
            ) : (
              messages.map(msg => {
                const isMe = msg.isMe;
                return (
                  <div key={msg.id} className={`flex flex-col max-w-[85%] ${isMe ? 'self-end' : 'self-start'}`}>
                    {!isMe && <span className="text-[11px] text-textTertiary mb-1 ml-1">{msg.sender}</span>}
                    <div className={`px-4 py-2.5 rounded-[18px] text-[15px] leading-snug ${isMe ? 'bg-accentBlue text-white rounded-tr-[4px] shadow-blue-glow' : 'bg-surface1 border border-borderSubtle text-textPrimary rounded-tl-[4px]'}`} style={{ wordBreak: 'break-word' }}>
                      {msg.text}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={endRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSend} className="p-4 bg-[rgba(255,255,255,0.02)] border-t border-borderSubtle flex gap-2 shrink-0">
            <input 
              type="text" 
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Message..."
              autoFocus
              className="flex-1 h-[44px] bg-[rgba(255,255,255,0.05)] border border-borderSubtle rounded-[100px] px-4 text-[15px] text-white placeholder:text-textTertiary focus:outline-none focus:border-accentBlue/50 transition-colors"
            />
            <button type="submit" disabled={!text.trim()} className="w-[44px] h-[44px] bg-accentBlue text-white rounded-full flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed transition-opacity shadow-[0_0_16px_rgba(10,132,255,0.3)]">
              <PaperAirplaneIcon className="w-5 h-5" />
            </button>
          </form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
