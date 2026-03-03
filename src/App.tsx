import React, { useState, useEffect } from 'react';
import { INITIAL_UPGRADES } from './constants';
import { useGameLoop } from './hooks/useGameLoop';
import { Upgrade } from './types';
import { motion, AnimatePresence } from 'framer-motion';

// 🔊 SOUND SYSTEM (Bina File Upload kiye)
const playClickSound = () => {
  const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContext) return;
  
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.connect(gain);
  gain.connect(ctx.destination);

  // High pitch "Ting" sound like a coin
  osc.type = 'sine';
  osc.frequency.setValueAtTime(1200, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(2000, ctx.currentTime + 0.1);
  
  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

  osc.start();
  osc.stop(ctx.currentTime + 0.1);
};

export default function App() {
  const [balance, setBalance] = useState(0);
  const [upgrades, setUpgrades] = useState<Upgrade[]>(INITIAL_UPGRADES);
  
  // Floating Elements (Ab ye COINS honge)
  const [clicks, setClicks] = useState<{id: number, x: number, y: number}[]>([]);
  
  // Scale effect for main coin
  const [coinScale, setCoinScale] = useState(1);

  const incomePerSecond = upgrades.reduce((acc, curr) => acc + (curr.income * curr.count), 0);

  // Auto Income
  useGameLoop(() => {
    setBalance(prev => prev + incomePerSecond);
  }, 1000);

  // 🖱️ MAIN CLICK HANDLER
  const handleClick = (e: React.MouseEvent | React.TouchEvent) => {
    // 1. Play Sound
    playClickSound();

    // 2. Add Money
    setBalance(prev => prev + 1);

    // 3. Bounce Effect
    setCoinScale(0.9);
    setTimeout(() => setCoinScale(1), 100);

    // 4. Get Coordinates
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
      // Prevent double tap zoom
      // e.preventDefault(); 
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    // 5. Spawn Flying Coin 🪙
    const newClick = { id: Date.now(), x: clientX, y: clientY };
    setClicks(prev => [...prev, newClick]);
    
    // Remove coin after animation
    setTimeout(() => {
      setClicks(prev => prev.filter(c => c.id !== newClick.id));
    }, 800);
  };

  const buyUpgrade = (id: number) => {
    const upgradeIndex = upgrades.findIndex(u => u.id === id);
    const upgrade = upgrades[upgradeIndex];
    if (balance >= upgrade.cost) {
      // Buy Sound (Thoda heavy)
      playClickSound(); 
      setBalance(prev => prev - upgrade.cost);
      
      const newUpgrades = [...upgrades];
      newUpgrades[upgradeIndex] = { ...upgrade, count: upgrade.count + 1, cost: Math.round(upgrade.cost * 1.15) };
      setUpgrades(newUpgrades);
    }
  };

  return (
    <div className="h-[100dvh] w-screen bg-black flex flex-col overflow-hidden font-sans select-none">
      
      {/* ✨ Flying Coins Overlay (Pointer Events None is IMP to not block shop) */}
      <div className="absolute inset-0 pointer-events-none z-[100]">
        <AnimatePresence>
          {clicks.map(c => (
            <motion.div
              key={c.id}
              initial={{ opacity: 1, y: c.y - 20, x: c.x }}
              animate={{ opacity: 0, y: 50, x: window.innerWidth / 2 }} 
              transition={{ duration: 0.8 }}
              className="absolute text-4xl filter drop-shadow-lg"
              style={{ left: 0, top: 0 }} 
            >
              <div style={{ transform: `translate(${c.x - 20}px, ${c.y - 40}px)` }}>
                🪙
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* 🟢 TOP SECTION (GAMEPLAY) - Height Fixed 40% */}
      <div className="h-[40%] bg-gradient-to-b from-gray-900 to-black relative flex flex-col items-center justify-center z-10 border-b-4 border-yellow-600 box-border">
        
        {/* Balance Display */}
        <div className="text-center mb-2">
           <div className="text-gray-400 text-xs tracking-[0.3em] font-bold">NET WORTH</div>
           <div className="text-5xl font-mono font-black text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-yellow-600 filter drop-shadow-[0_2px_10px_rgba(234,179,8,0.5)]">
              {Math.floor(balance).toLocaleString()} <span className="text-xl text-white">BTC</span>
           </div>
        </div>

        {/* 🟡 THE CLICKABLE BITCOIN */}
        <div 
           className="relative cursor-pointer transition-transform duration-100 ease-out"
           style={{ transform: `scale(${coinScale})` }}
           onMouseDown={handleClick}
           onTouchStart={handleClick}
        >
            {/* Glow Behind */}
            <div className="absolute inset-0 bg-yellow-500 rounded-full blur-[50px] opacity-30 animate-pulse pointer-events-none"></div>
            
            {/* SVG Coin Image */}
            <svg width="200" height="200" viewBox="0 0 200 200" className="drop-shadow-2xl pointer-events-auto">
               <defs>
                  <linearGradient id="goldGrad" x1="0" y1="0" x2="1" y2="1">
                     <stop offset="0%" stopColor="#ffeb3b" />
                     <stop offset="100%" stopColor="#f59e0b" />
                  </linearGradient>
               </defs>
               <circle cx="100" cy="100" r="95" fill="url(#goldGrad)" stroke="#b45309" strokeWidth="5"/>
               <circle cx="100" cy="100" r="85" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2"/>
               <text x="50%" y="54%" dominantBaseline="middle" textAnchor="middle" fill="#92400e" fontSize="110" fontWeight="900">₿</text>
            </svg>
        </div>
      </div>

      {/* 🛒 BOTTOM SECTION (SHOP) - Height Fixed 60% */}
      <div className="h-[60%] bg-[#0f172a] flex flex-col relative z-20">
        
        {/* Sticky Header */}
        <div className="bg-[#1e293b] p-3 border-b border-gray-700 flex justify-between items-center shadow-md shrink-0">
           <div className="flex items-center gap-2">
             <span className="text-xl">🛒</span>
             <h2 className="font-bold text-white uppercase tracking-wider">Upgrade System</h2>
           </div>
           <div className="bg-green-500/20 text-green-400 px-3 py-1 rounded-full text-xs font-bold border border-green-500/30">
             ⚡ {incomePerSecond.toFixed(1)} /s
           </div>
        </div>

        {/* SCROLLABLE LIST */}
        <div className="flex-1 overflow-y-auto p-3 pb-20 space-y-3 custom-scrollbar">
           {upgrades.map(u => {
             const canBuy = balance >= u.cost;
             return (
               <button 
                 key={u.id}
                 onClick={() => buyUpgrade(u.id)}
                 // Agar paise nahi hain to button thoda transparent dikhega
                 className={`w-full flex items-center justify-between p-3 rounded-xl border-b-4 transition-all duration-100 active:border-b-0 active:translate-y-1 ${
                    canBuy 
                    ? 'bg-gray-800 border-gray-900 shadow-lg cursor-pointer hover:bg-gray-700' 
                    : 'bg-gray-900 border-gray-950 opacity-50 cursor-not-allowed'
                 }`}
               >
                 {/* Left: Icon & Name */}
                 <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-gray-950 rounded-lg flex items-center justify-center text-3xl border border-gray-700 shadow-inner">
                      {u.icon}
                    </div>
                    <div className="text-left">
                       <div className="font-bold text-gray-100 text-lg leading-tight">{u.name}</div>
                       <div className="text-xs text-green-400 font-mono mt-1">PRODUCES: +{u.income}/s</div>
                    </div>
                 </div>

                 {/* Right: Cost & Owned */}
                 <div className="flex flex-col items-end gap-1">
                    <div className={`px-3 py-1 rounded font-bold font-mono text-sm ${
                      canBuy ? 'bg-yellow-500 text-black' : 'bg-gray-700 text-gray-400'
                    }`}>
                      {u.cost.toLocaleString()}
                    </div>
                    <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">
                      Lvl {u.count}
                    </span>
                 </div>
               </button>
             );
           })}
        </div>
      </div>
    </div>
  );
}
