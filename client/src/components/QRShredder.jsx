import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

export default function QRShredder({ roomCode }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !roomCode) return;
    
    // 1. Physically paint the base QR map
    QRCode.toCanvas(canvasRef.current, roomCode, {
      width: 240,
      margin: 1,
      color: {
        dark: '#ffffff',
        light: '#00000000' // transparent background
      }
    }, (err) => {
      if (err) return console.error(err);

      // 2. Initiate the physical Shredding algorithm!
      const ctx = canvasRef.current.getContext('2d');
      const width = canvasRef.current.width;
      const height = canvasRef.current.height;

      // The shredder fires repeatedly over 30s. We use RequestAnimationFrame
      // to selectively drop opacity clusters smoothly!
      let frame = 0;
      
      const shredLoop = () => {
        frame++;
        
        // Every 4 frames, drop ~20 random geometric clusters to visually melt it
        if (frame % 4 === 0) {
          ctx.fillStyle = '#050508'; // Matches darkBg cleanly overlaying the white pixels
          
          for (let i = 0; i < 20; i++) {
            // Target blocks
            const size = Math.random() * 8 + 2; 
            const x = Math.random() * width;
            const y = Math.random() * height;
            
            // Draw a dark erasure square
            ctx.fillRect(x, y, size, size);
          }
        }
        
        rafRef.current = requestAnimationFrame(shredLoop);
      };
      
      rafRef.current = requestAnimationFrame(shredLoop);
    });

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [roomCode]); // Re-render mapping exactly when roomCode cycles

  return (
    <div className="w-[280px] h-[280px] rounded-[24px] bg-surface1 border border-borderSubtle shadow-[inset_0_0_20px_rgba(10,132,255,0.08)] p-6 mb-4 flex items-center justify-center overflow-hidden">
      <canvas ref={canvasRef} className="mix-blend-screen opacity-90"></canvas>
    </div>
  );
}
