import React from 'react';
import { motion } from 'framer-motion';
import { Gem } from 'lucide-react';

export function CrystalLoader() {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="relative">
        {/* Outer Glow */}
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.6, 0.3],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute inset-0 bg-indigo-500/20 blur-3xl rounded-full"
        />
        
        {/* Rotating Rings */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
          className="absolute -inset-4 border border-indigo-100 rounded-full border-dashed opacity-50"
        />
        
        {/* The Crystal */}
        <motion.div
          animate={{
            y: [0, -10, 0],
            rotateY: [0, 180, 360],
          }}
          transition={{
            y: { duration: 2, repeat: Infinity, ease: "easeInOut" },
            rotateY: { duration: 4, repeat: Infinity, ease: "linear" },
          }}
          className="relative z-10 bg-white/5 backdrop-blur-xl p-8 rounded-[32px] shadow-2xl shadow-sky-500/20 border border-white/10 flex items-center justify-center"
        >
          <Gem className="w-12 h-12 text-sky-400 fill-sky-400/10" />
        </motion.div>
      </div>
    </div>
  );
}
