import { motion } from 'framer-motion';
import { springSnap } from './animations';

export function Button({ variant = 'primary', className = "", children, ...props }) {
  const base = "h-[56px] rounded-[100px] text-[17px] font-[600] flex items-center justify-center w-full transition-all cursor-pointer";
  const variants = {
    primary: "bg-accentBlue text-white hover:shadow-[0_8px_32px_rgba(10,132,255,0.5)]",
    ghost: "border border-borderActive text-textPrimary bg-surface1 hover:bg-surface2"
  };
  
  return (
    <motion.button 
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      transition={springSnap}
      className={`${base} ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </motion.button>
  );
}
