import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { motion } from 'framer-motion';

export default function QRScanner({ onScanSuccess, onClose }) {
  const [error, setError] = useState(null);
  const scannerRef = useRef(null);

  useEffect(() => {
    const html5QrCode = new Html5Qrcode("reader");
    
    html5QrCode.start(
      { facingMode: "environment" },
      {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0
      },
      (decodedText) => {
        // Success
        html5QrCode.stop().then(() => {
          onScanSuccess(decodedText);
        }).catch(err => {
          console.error("Failed to stop scanner", err);
          onScanSuccess(decodedText);
        });
      },
      (errorMessage) => {
        // Parse error, ignore
      }
    ).catch(err => {
      console.error("Scanner Error:", err);
      setError("Camera permission denied or camera not found. Please enter code manually.");
    });

    scannerRef.current = html5QrCode;

    return () => {
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(console.error);
      }
    };
  }, [onScanSuccess]);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/95 backdrop-blur-xl"
    >
      <div className="w-full max-w-md relative flex flex-col items-center p-6">
        <button 
          onClick={onClose}
          className="absolute -top-16 right-4 p-3 bg-white/10 rounded-full text-white hover:bg-white/20 transition-colors z-10"
        >
          <XMarkIcon className="w-6 h-6" />
        </button>
        
        <h2 className="text-white text-2xl font-bold mb-8">Scan QR Code</h2>
        
        <div className="w-full max-w-[300px] aspect-square bg-black rounded-3xl overflow-hidden relative shadow-[0_0_50px_rgba(6,182,212,0.15)] border border-white/10">
          <div id="reader" className="w-full h-full object-cover"></div>
          {/* Overlay bracket styling */}
          <div className="absolute inset-0 pointer-events-none border-2 border-accentCyan/30 rounded-3xl m-6">
             <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-accentCyan -mt-1 -ml-1 rounded-tl-xl"></div>
             <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-accentCyan -mt-1 -mr-1 rounded-tr-xl"></div>
             <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-accentCyan -mb-1 -ml-1 rounded-bl-xl"></div>
             <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-accentCyan -mb-1 -mr-1 rounded-br-xl"></div>
          </div>
        </div>
        
        {error ? (
          <div className="mt-8 text-red-400 text-center px-6 text-sm font-medium bg-red-400/10 py-3 rounded-lg border border-red-400/20">
            {error}
          </div>
        ) : (
          <p className="mt-8 text-white/50 text-sm text-center">Position the host's QR code within the frame to connect instantly.</p>
        )}
      </div>
    </motion.div>
  );
}
