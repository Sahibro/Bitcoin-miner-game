import React, { useState, useEffect } from 'react';
import { INITIAL_UPGRADES } from './constants';
import { useGameLoop } from './hooks/useGameLoop';
import { Upgrade } from './types';
import { motion, AnimatePresence } from 'framer-motion';

export default function App() {
  const [balance, setBalance] = useState(0);
  const [upgrades, setUpgrades] = useState<Upgrade[]>(INITIAL_UPGRADES);
  const [clicks, setClicks] = useState<{id: number, x: number, y: number, val: string, isCrit: boolean}[]>([]);
  const [shake, setShake] = useState(false);
  
  // Fake Rank for Competition Feel
  const [globalRank, setGlobalRank] = useState(145032);

  const incomePerSecond = upgrades.reduce((acc, curr) => acc + (curr.income * curr.count), 0);

  // Auto Income & Rank Update
  useGameLoop(() => {
    setBalance(prev => prev + incomePerSecond);
    // Fake ranking drop logic
    if (Math.random() > 0.8 && globalRank > 1) {
      setGlobalRank(prev => prev - Math.floor(Math.random() * 100));
    }
  }, 1000);

  // 🎰 THE GAMBLING CLICK HANDLER
  const handleClick = (e: React.MouseEvent | React.TouchEvent) => {
    // 1. Chance for Jackpot (Critical Hit)
    const isCritical = Math.random() < 0.1; // 10% Chance (Har 10 mein se 1 baar)
    const multiplier = isCritical ? 10 : 1;
    const addedAmount = 1 * multiplier;

    setBalance(prev => prev + addedAmount);

    // 2. Coordinates
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    // 3. Shake Effect on Crit
    if (isCritical) {
      setShake(true);
      setTimeout(() => setShake(false), 200);
      // Haptic Feedback (Phone vibrate karega)
      if (navigator.vibrate) navigator.vibrate(50);
    }

    const randomOffset = Math.random() * 60 - 30;
    const newClick = { 
      id: Date.now(), 
      x: clientX + randomOffset, 
      y: clientY - 50, 
      val: isCritical ? `JACKPOT! +${addedAmount}` : `+${addedAmount}`,
      isCrit: isCritical
    };

    setClicks(prev => [...prev, newClick]);
    setTimeout(() => setClicks(prev => prev.filter(c => c.id !== newClick.id)), 1000);
  };

  const buyUpgrade = (id: number) => {
    const upgradeIndex = upgrades.findIndex(u => u.id === id);
    const upgrade = upgrades[upgradeIndex];
    if (balance >= upgrade.cost) {
      setBalance(prev => prev - upgrade.cost);
      // Fake rank boost
      setGlobalRank(prev => Math.max(1, prev - 5000));
      
      const newUpgrades = [...upgrades];
      newUpgrades[upgradeIndex] = { ...upgrade, count: upgrade.count + 1, cost: Math.round(upgrade.cost * 1.15) };
      setUpgrades(newUpgrades);
    }
  };

  return (
    <div className={`h-[100dvh] w-screen flex flex-col overflow-hidden bg-black text-white font-bold select-none ${shake ? 'shake-screen' : ''}`}>
      
      {/* 🔮 Background Overlay */}
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')] opacity-30 pointer-events-none z-0"></div>

      {/* 🚀 FLOATERS (Click Numbers) - Pointer Events None is CRITICAL */}
      <div className="absolute inset-0 pointer-events-none z-[100] overflow-hidden">
        <AnimatePresence>
          {clicks.map(c => (
            <motion.div
              key={c.id}
              initial={{ opacity: 1, y: c.y, x: c.x, scale: c.isCrit ? 1.5 : 0.8 }}
              animate={{ opacity: 0, y: c.y - 200, scale: c.isCrit ? 2.5 : 1.2 }}
              className={`absolute font-black whitespace-nowrap ${c.isCrit ? 'text-red-500 critical-hit text-4xl' : 'text-yellow-400 text-2xl'}`}
              style={{ left: c.x, top: c.y }}
            >
              {c.val}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* 🔝 UPPER SECTION: GAME (50% Height) */}
      <div className="h-[45%] flex flex-col items-center justify-center relative z-10 border-b-4 border-yellow-600 shadow-[0_10px_50px_rgba(0,0,0,0.8)] bg-gray-900">
        
        {/* Fake Global Ticker */}
        <div className="absolute top-2 w-full text-center">
           <span className="bg-red-600 text-white text-[10px] px-2 py-1 rounded-full animate-pulse">LIVE</span>
           <span className="text-gray-400 text-xs ml-2">Global Rank: <span className="text-white">#{globalRank.toLocaleString()}</span></span>
        </div>

        {/* Balance */}
        <div className="text-center z-10 mt-4">
           <div className="text-6xl text-neon text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-400 drop-shadow-xl">
              {Math.floor(balance).toLocaleString()}
           </div>
           <div className="text-yellow-500 text-sm tracking-[0.5em]">BITCOIN</div>
        </div>

        {/* 🟡 THE COIN (CLICKABLE) */}
        <motion.div 
           className="relative mt-4 cursor-pointer active:scale-90 transition-transform"
           whileTap={{ scale: 0.9 }}
           onClick={handleClick}
        >
           {/* Glow Ring */}
           <div className="absolute inset-0 bg-yellow-500 rounded-full blur-2xl opacity-20 animate-pulse"></div>
           
           {/* SVG Coin */}
           <svg width="180" height="180" viewBox="0 0 200 200" className="drop-shadow-2xl">
              <defs>
                <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#ffd700" />
                  <stop offset="100%" stopColor="#eab308" />
                </linearGradient>
              </defs>
              <circle cx="100" cy="100" r="95" fill="url(#grad1)" stroke="#854d0e" strokeWidth="4" />
              <circle cx="100" cy="100" r="85" fill="none" stroke="#fff" strokeWidth="2" opacity="0.3" />
              <text x="50%" y="55%" dominantBaseline="middle" textAnchor="middle" fill="#854d0e" fontSize="120" fontWeight="900">₿</text>
           </svg>
        </motion.div>
      </div>

      {/* 🛒 BOTTOM SECTION: SHOP (55% Height - Scrollable) */}
      <div className="h-[55%] bg-glass-panel flex flex-col relative z-20 shadow-inner">
        {/* Header */}
        <div className="p-3 bg-black/40 flex justify-between items-center border-b border-gray-700 sticky top-0 backdrop-blur z-30">
          <div className="text-green-400 font-mono font-bold">⚡ {incomePerSecond.toFixed(1)}/s</div>
          <div className="text-gray-400 text-xs">MARKET OPEN 🟢</div>
        </div>

        {/* Items List - Fully Scrollable */}
        <div className="flex-1 overflow-y-auto p-2 pb-20 custom-scrollbar">
          {upgrades.map(u => {
            const canBuy = balance >= u.cost;
            return (
               <button
                 key={u.id}
                 onClick={() => buyUpgrade(u.id)}
                 className={`w-full mb-2 p-3 rounded-xl border-l-4 flex items-center justify-between transition-all transform active:scale-95 ${
                   canBuy 
                   ? 'bg-gray-800 border-yellow-500 hover:bg-gray-700' 
                   : 'bg-gray-900 border-gray-700 opacity-50'
                 }`}
               >
                 {/* Icon Box */}
                 <div className="w-12 h-12 flex items-center justify-center bg-black rounded-lg text-2xl shadow-inner border border-gray-700">
                    {u.icon}
                 </div>

                 {/* Info */}
                 <div className="flex-1 px-4 text-left">
                    <div className="font-bold text-gray-200">{u.name}</div>
                    <div className="text-green-500 text-xs">+{u.income} BTC/sec</div>
                 </div>

                 {/* Price Button */}
                 <div className={`px-4 py-2 rounded-lg font-bold font-mono ${
                   canBuy ? 'bg-yellow-600 text-white shadow-lg shadow-yellow-900/50' : 'bg-gray-800 text-gray-500'
                 }`}>
                   {u.cost >= 1000 ? (u.cost/1000).toFixed(1) + 'k' : u.cost}
                 </div>
               </button>
            );
          })}
        </div>
      </div>

    </div>
  );
}
