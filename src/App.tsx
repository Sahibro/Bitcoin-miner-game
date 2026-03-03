import React, { useState, useEffect } from 'react';
import { INITIAL_UPGRADES } from './constants';
import { useGameLoop } from './hooks/useGameLoop';
import { Upgrade } from './types';
import { motion, AnimatePresence } from 'framer-motion';

export default function App() {
  const [balance, setBalance] = useState(0);
  const [upgrades, setUpgrades] = useState<Upgrade[]>(INITIAL_UPGRADES);
  const [clicks, setClicks] = useState<{id: number, x: number, y: number, val: number}[]>([]);

  const incomePerSecond = upgrades.reduce((acc, curr) => acc + (curr.income * curr.count), 0);

  useGameLoop(() => {
    setBalance(prev => prev + incomePerSecond);
  }, 1000);

  const handleClick = (e: React.MouseEvent | React.TouchEvent) => {
    setBalance(prev => prev + 1);
    
    // Coordinates calculation
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    const newClick = { id: Date.now(), x: clientX, y: clientY, val: 1 };
    setClicks(prev => [...prev, newClick]);
    setTimeout(() => setClicks(prev => prev.filter(c => c.id !== newClick.id)), 1000);
  };

  const buyUpgrade = (id: number) => {
    const upgradeIndex = upgrades.findIndex(u => u.id === id);
    const upgrade = upgrades[upgradeIndex];

    if (balance >= upgrade.cost) {
      setBalance(prev => prev - upgrade.cost);
      const newUpgrades = [...upgrades];
      newUpgrades[upgradeIndex] = {
        ...upgrade,
        count: upgrade.count + 1,
        cost: Math.round(upgrade.cost * 1.15)
      };
      setUpgrades(newUpgrades);
    }
  };

  return (
    <div className="h-screen w-screen bg-gray-900 text-white flex flex-col md:flex-row overflow-hidden relative selection:bg-none">
      
      {/* Background & Floating Numbers */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,#2d3748,black)] pointer-events-none z-0"></div>
      
      <AnimatePresence>
        {clicks.map(c => (
          <motion.div
            key={c.id}
            initial={{ opacity: 1, y: 0, scale: 1 }}
            animate={{ opacity: 0, y: -100, scale: 1.5 }}
            exit={{ opacity: 0 }}
            className="absolute text-4xl font-bold text-yellow-400 pointer-events-none z-50 shadow-black drop-shadow-lg"
            style={{ left: c.x - 10, top: c.y - 40 }}
          >
            +{c.val}
          </motion.div>
        ))}
      </AnimatePresence>

      {/* MINING AREA (Top/Left) */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 z-10 relative mt-8 md:mt-0">
        
        {/* Balance */}
        <div className="flex flex-col items-center mb-10">
           <h1 className="text-gray-400 text-lg uppercase tracking-widest mb-2">Total Balance</h1>
           <div className="text-5xl md:text-7xl font-mono font-bold text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">
             {balance.toFixed(1)} <span className="text-yellow-500 text-3xl">BTC</span>
           </div>
        </div>

        {/* REAL BITCOIN IMAGE */}
        <motion.div 
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.90, rotate: 15 }}
          className="cursor-pointer relative z-20 rounded-full"
          onClick={handleClick}
        >
          {/* Glowing Aura behind coin */}
          <div className="absolute inset-0 bg-yellow-500 blur-3xl opacity-20 rounded-full animate-pulse"></div>
          
          {/* Coin Image - Ensure file is named 'bitcoin.png' in public folder */}
          <img 
            src="/bitcoin.png" 
            alt="Bitcoin" 
            className="w-64 h-64 md:w-80 md:h-80 object-contain drop-shadow-2xl relative z-10"
            draggable="false"
          />
        </motion.div>

        <div className="mt-12 bg-gray-800/50 backdrop-blur border border-gray-600 px-6 py-2 rounded-full flex items-center gap-3">
          <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
          <span className="font-mono text-green-400 font-bold">{incomePerSecond.toFixed(1)} BTC/sec</span>
        </div>
      </div>

      {/* SHOP AREA (Bottom/Right) */}
      <div className="flex-1 md:h-screen md:max-w-md bg-gray-800/90 backdrop-blur-xl border-t-2 md:border-l-2 md:border-t-0 border-yellow-600/30 flex flex-col z-40 shadow-[-10px_0_30px_rgba(0,0,0,0.5)]">
        <div className="p-4 bg-gray-900/50 border-b border-gray-700 flex justify-between items-center sticky top-0 z-50">
          <h2 className="text-xl font-bold flex items-center gap-2">
            🛍️ Mining Equipment
          </h2>
          <span className="text-xs text-gray-400 bg-gray-800 px-2 py-1 rounded">Auto-Save ON</span>
        </div>

        {/* Scrollable Shop List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-32 md:pb-10">
          {upgrades.map(upgrade => {
            const canBuy = balance >= upgrade.cost;
            return (
              <button
                key={upgrade.id}
                onClick={() => buyUpgrade(upgrade.id)}
                disabled={!canBuy}
                className={`w-full p-4 rounded-xl border-2 flex items-center justify-between relative overflow-hidden transition-all duration-200 group active:scale-95 ${
                  canBuy 
                    ? 'bg-gray-700 border-gray-600 hover:border-yellow-500 hover:shadow-[0_0_15px_rgba(234,179,8,0.2)]' 
                    : 'bg-gray-800/50 border-transparent opacity-60 grayscale cursor-not-allowed'
                }`}
              >
                <div className="flex items-center gap-4 z-10 relative">
                  <div className="text-3xl p-2 bg-gray-800 rounded-lg shadow-inner">{upgrade.icon}</div>
                  <div className="text-left">
                    <div className={`font-bold text-lg ${canBuy ? 'text-white' : 'text-gray-400'}`}>{upgrade.name}</div>
                    <div className="text-xs font-mono text-green-400">+{upgrade.income} BTC/s</div>
                  </div>
                </div>

                <div className="text-right z-10 relative">
                  <div className={`font-bold font-mono text-lg ${canBuy ? 'text-yellow-400' : 'text-gray-500'}`}>
                    {upgrade.cost.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-gray-400 uppercase tracking-wider">Owned: {upgrade.count}</div>
                </div>

                {/* Progress Bar visual inside button */}
                {canBuy && (
                  <div className="absolute bottom-0 left-0 h-1 bg-yellow-500 w-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  );
}
