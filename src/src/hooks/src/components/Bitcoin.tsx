import React from 'react';
import { motion } from 'framer-motion';

interface Props {
  onClick: () => void;
}

export const Bitcoin: React.FC<Props> = ({ onClick }) => {
  return (
    <motion.div 
      whileTap={{ scale: 0.9 }}
      className="cursor-pointer"
      onClick={onClick}
    >
      {/* Simple CSS Bitcoin Circle */}
      <div className="w-48 h-48 bg-yellow-500 rounded-full flex items-center justify-center border-4 border-yellow-300 shadow-xl shadow-yellow-500/20">
        <span className="text-6xl font-bold text-white">₿</span>
      </div>
    </motion.div>
  );
};
