import { motion } from 'framer-motion';

export function RadarRing({ active = true, speed = 2.4, size = 240 }) {
  if (!active) return null;
  return (
    <div className="relative flex items-center justify-center pointer-events-none" style={{ width: size, height: size }}>
      {[60, 100, 140].map((r, i) => (
        <motion.div
          key={r}
          className="absolute border border-accentBlue/[0.12] rounded-full"
          style={{ width: r * 2, height: r * 2, borderWidth: '1px' }}
          animate={{ scale: [1, 1.15, 1], opacity: [1, 0, 0] }}
          transition={{ duration: speed, repeat: Infinity, delay: i * (0.6), ease: "easeOut" }}
        />
      ))}
      <div className="absolute w-[20px] h-[20px] bg-accentBlue rounded-full shadow-[0_0_24px_#0A84FF]"></div>
    </div>
  );
}
