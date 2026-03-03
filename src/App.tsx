import React, { useState, useEffect } from 'react';
import { INITIAL_UPGRADES } from './constants';
import { useGameLoop } from './hooks/useGameLoop';
import { Upgrade } from './types';
import { motion, AnimatePresence } from 'framer-motion'; // Animation library

export default function App() {
  const [balance, setBalance] = useState(0);
  const [upgrades, setUpgrades] = useState<Upgrade[]>(INITIAL_UPGRADES);
  const [clicks, setClicks] = useState<{id: number, x: number, y: number, val: number}[]>([]);

  // Income logic
  const incomePerSecond = upgrades.reduce((acc, curr) => acc + (curr.income * curr.count), 0);

  useGameLoop(() => {
    setBalance(prev => prev + incomePerSecond);
  }, 1000);

  // Advanced Click Handler (Floating Text)
  const handleClick = (e: React.MouseEvent | React.TouchEvent) => {
    setBalance(prev => prev + 1);

    // Coordinate logic for Mobile & PC
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    // Add visual effect
    const newClick = { id: Date.now(), x: clientX, y: clientY, val: 1 };
    setClicks(prev => [...prev, newClick]);

    // Cleanup floating text after 1 second
    setTimeout(() => {
      setClicks(prev => prev.filter(c => c.id !== newClick.id));
    }, 1000);
  };

  const buyUpgrade = (id: number) => {
    const upgradeIndex = upgrades.findIndex(u => u.id === id);
    const upgrade = upgrades[upgradeIndex];
    if (balance >= upgrade.cost) {
      setBalance(prev => prev - upgrade.cost);
      const newUpgrades = [...upgrades];
      newUpgrades[upgradeIndex] = { ...upgrade, count: upgrade.count + 1, cost: Math.round(upgrade.cost * 1.15) };
      setUpgrades(newUpgrades);
    }
  };

  return (
    <div className="h-screen w-screen text-white flex flex-col md:flex-row overflow-hidden relative">
      
      {/* Background Glow Effect */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(245,158,11,0.1),transparent_70%)] pointer-events-none"></div>

      {/* Floating Numbers Container */}
      {clicks.map(c => (
        <div key={c.id} className="float-text text-yellow-400" style={{ left: c.x, top: c.y }}>
          +{c.val}
        </div>
      ))}

      {/* MINING SECTION */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 z-10 relative">
        <h1 className="text-3xl md:text-5xl font-black mb-2 text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-yellow-600 drop-shadow-sm">
          CRYPTO CLICKER
        </h1>
        
        {/* Balance Display with Neon Glow */}
        <div className="text-4xl md:text-6xl font-mono text-yellow-400 font-bold drop-shadow-[0_0_15px_rgba(250,204,21,0.5)] mb-8">
          {balance.toFixed(1)} <span className="text-xl text-gray-400">BTC</span>
        </div>

        {/* The BITCOIN BUTTON */}
        <motion.div 
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95, rotate: 5 }}
          className="cursor-pointer relative group"
          onClick={handleClick}
          // Also support mobile tap
        >
           {/* Outer Glow Ring */}
          <div className="absolute -inset-4 bg-yellow-500 rounded-full opacity-20 group-hover:opacity-40 blur-xl transition-all duration-300"></div>
          
          <div className="w-64 h-64 md:w-80 md:h-80 bg-gradient-to-b from-yellow-400 to-orange-600 rounded-full flex items-center justify-center border-4 border-yellow-200 shadow-2xl shadow-orange-900/50 z-20 relative">
            <span className="text-8xl md:text-9xl font-bold text-white drop-shadow-md">₿</span>
          </div>
        </motion.div>

        <div className="mt-8 text-gray-400 font-mono bg-gray-800/50 px-4 py-2 rounded-full border border-gray-700">
          ⛏️ Speed: <span className="text-green-400">{incomePerSecond.toFixed(1)}</span> / sec
        </div>
      </div>

      {/* SHOP SECTION (Glassmorphism) */}
      <div className="flex-1 bg-gray-900/80 backdrop-blur-md border-t md:border-l border-gray-700 p-4 overflow-y-auto h-[40vh] md:h-screen z-10">
        <h2 className="text-2xl font-bold mb-4 sticky top-0 bg-gray-900/90 p-2 z-20 border-b border-gray-700">
          Dark Web Market 🛒
        </h2>
        <div className="space-y-3 pb-20">
          {upgrades.map(upgrade => (
            <div
              key={upgrade.id}
              onClick={() => buyUpgrade(upgrade.id)}
              className={`w-full p-4 rounded-xl border flex items-center justify-between transition-all select-none transform active:scale-95 ${
                balance >= upgrade.cost 
                  ? 'bg-gray-800 border-gray-600 hover:bg-gray-700 hover:border-yellow-500 cursor-pointer shadow-lg' 
                  : 'bg-gray-900/50 border-gray-800 opacity-50 cursor-not-allowed'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className="text-4xl bg-gray-700 p-2 rounded-lg">{upgrade.icon}</div>
                <div>
                  <div className="font-bold text-lg text-white">{upgrade.name}</div>
                  <div className="text-xs text-green-400 font-mono">+{upgrade.income} BTC/s</div>
                </div>
              </div>
              <div className="text-right">
                <div className={`text-lg font-bold font-mono ${balance >= upgrade.cost ? 'text-yellow-400' : 'text-red-400'}`}>
                  {upgrade.cost.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500">Qty: {upgrade.count}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
