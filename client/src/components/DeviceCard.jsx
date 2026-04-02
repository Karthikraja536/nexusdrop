import { motion } from 'framer-motion';
import { ComputerDesktopIcon } from '@heroicons/react/24/outline'; 

export default function DeviceCard({ name = "Device Name", index = 0 }) {
  return (
    <motion.div 
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.08, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="h-[64px] rounded-[14px] bg-white/[0.04] border border-white/[0.06] flex flex-row items-center px-4 mb-3 shrink-0"
    >
      <div className="mr-3 shrink-0">
        <ComputerDesktopIcon className="w-5 h-5 text-white/40" />
      </div>
      <div className="flex-1 min-w-0 pr-2 flex flex-col justify-center">
        <div className="text-[15px] text-white truncate leading-none mb-1">{name}</div>
        <div className="text-appleGreen text-[12px] font-[500] leading-none">● Connected</div>
      </div>
    </motion.div>
  );
}
