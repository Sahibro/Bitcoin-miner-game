import React, { useState, useEffect } from 'react';
import { INITIAL_UPGRADES } from './constants';
import { useGameLoop } from './hooks/useGameLoop';
import { Upgrade } from './types';
import { motion, AnimatePresence } from 'framer-motion';

// Rank System
const RANKS = [
  { limit: 0, title: "STREET BEGGAR 🧢", color: "text-gray-400" },
  { limit: 500, title: "SCRIPT KIDDIE 💻", color: "text-blue-400" },
  { limit: 5000, title: "MINING EXPERT ⛏️", color: "text-green-400" },
  { limit: 50000, title: "CRYPTO BARON 🎩", color: "text-purple-400" },
  { limit: 500000, title: "BITCOIN GOD ⚡", color: "text-yellow-400" }
];

export default function App() {
  const [balance, setBalance] = useState(0);
  const [upgrades, setUpgrades] = useState<Upgrade[]>(INITIAL_UPGRADES);
  const [clicks, setClicks] = useState<{id: number, x: number, y: number, val: string}[]>([]);
  const [rank, setRank] = useState(RANKS[0]);

  const incomePerSecond = upgrades.reduce((acc, curr) => acc + (curr.income * curr.count), 0);

  // Determine Rank
  useEffect(() => {
    const currentRank = [...RANKS].reverse().find(r => balance >= r.limit) || RANKS[0];
    setRank(currentRank);
  }, [balance]);

  useGameLoop(() => {
    setBalance(prev => prev + incomePerSecond);
  }, 1000);

  const handleClick = (e: React.MouseEvent | React.TouchEvent) => {
    setBalance(prev => prev + 1);
    
    // Position Logic
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    // Add random variation for "Scatter" effect
    const randomX = Math.random() * 40 - 20; 
    
    const newClick = { id: Date.now(), x: clientX + randomX, y: clientY, val: "+1" };
    setClicks(prev => [...prev, newClick]);
    setTimeout(() => setClicks(prev => prev.filter(c => c.id !== newClick.id)), 800);
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
    <div className="h-screen w-screen bg-[#050505] text-white flex flex-col md:flex-row overflow-hidden relative selection:bg-yellow-500/30 font-sans">
      
      {/* 🌟 Background - Cyberpunk Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(18,18,18,0)_1px,transparent_1px),linear-gradient(90deg,rgba(18,18,18,0)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-20 pointer-events-none z-0"></div>
      <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-yellow-900/10 to-transparent pointer-events-none z-0"></div>

      {/* Floating Particles */}
      <AnimatePresence>
        {clicks.map(c => (
          <motion.div
            key={c.id}
            initial={{ opacity: 1, y: 0, scale: 0.8, rotate: 0 }}
            animate={{ opacity: 0, y: -120, scale: 1.2, rotate: Math.random() * 45 }}
            exit={{ opacity: 0 }}
            className="absolute font-bold text-2xl text-gold pointer-events-none z-50 drop-shadow-[0_2px_10px_rgba(255,215,0,0.5)]"
            style={{ left: c.x, top: c.y - 60 }}
          >
            {c.val}
          </motion.div>
        ))}
      </AnimatePresence>

      {/* 🪙 LEFT SIDE - THE MINE */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 z-10 relative">
        
        {/* RANK DISPLAY */}
        <div className="mb-8 text-center animate-fade-in-down">
          <div className="bg-black/40 px-4 py-1 rounded-full border border-gray-800 backdrop-blur-md mb-2 inline-block">
             <span className={`text-xs font-bold tracking-[0.2em] ${rank.color} drop-shadow-md`}>{rank.title}</span>
          </div>
          <div className="text-6xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-b from-yellow-200 via-yellow-500 to-yellow-800 drop-shadow-[0_10px_30px_rgba(234,179,8,0.2)]">
            {Math.floor(balance).toLocaleString()} 
            <span className="text-2xl text-yellow-600 ml-2 align-top">BTC</span>
          </div>
        </div>

        {/* 3D COIN INTERACTION */}
        <div className="relative group cursor-pointer" onClick={handleClick}>
            {/* Glow Behind */}
            <div className="absolute inset-0 bg-yellow-500 rounded-full blur-[80px] opacity-10 group-hover:opacity-30 transition-opacity duration-500"></div>
            
            {/* The SVG Coin */}
            <motion.div 
              className="coin-float relative z-20"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95, rotateY: 15 }}
            >
              <svg width="320" height="320" viewBox="0 0 200 200" className="drop-shadow-2xl">
                <defs>
                   <linearGradient id="g1" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#FFF7D1" />
                      <stop offset="50%" stopColor="#FFD700" />
                      <stop offset="100%" stopColor="#B8860B" />
                   </linearGradient>
                   <filter id="glow"><feGaussianBlur stdDeviation="2.5" result="coloredBlur"/><feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                </defs>
                <circle cx="100" cy="100" r="95" fill="#594208" />
                <circle cx="100" cy="100" r="92" fill="url(#g1)" />
                <circle cx="100" cy="100" r="82" fill="none" stroke="#926F18" strokeWidth="2" />
                <path d="M100 25 L100 175 M25 100 L175 100" stroke="#B8860B" strokeWidth="1" opacity="0.2"/>
                <text x="50%" y="54%" dominantBaseline="middle" textAnchor="middle" fill="#78350f" fontSize="130" fontWeight="900" fontFamily="Arial" style={{filter: "drop-shadow(1px 1px 0px rgba(255,255,255,0.4))"}}>₿</text>
              </svg>
            </motion.div>
        </div>

        {/* Current Speed */}
        <div className="mt-12 bg-glass px-6 py-3 rounded-2xl flex items-center gap-4 shadow-xl border border-white/5">
           <div className="flex flex-col text-right">
              <span className="text-[10px] text-gray-400 uppercase tracking-wider">Passive Income</span>
              <span className="text-xl font-bold text-green-400">+{incomePerSecond.toFixed(1)} <span className="text-xs text-gray-500">/sec</span></span>
           </div>
           <div className="h-10 w-[1px] bg-gray-700"></div>
           <div className="text-2xl animate-pulse">⚡</div>
        </div>
      </div>

      {/* 🛍️ RIGHT SIDE - LUXURY MARKET */}
      <div className="flex-1 md:max-w-[450px] bg-[#09090b] md:border-l border-white/5 flex flex-col z-30 h-[50vh] md:h-screen shadow-[-20px_0_50px_rgba(0,0,0,0.5)]">
        
        {/* Market Header */}
        <div className="p-6 bg-[#09090b]/95 backdrop-blur border-b border-white/10 sticky top-0 z-40">
           <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-white tracking-wide">BLACK MARKET</h2>
              <div className="bg-yellow-500/10 text-yellow-500 text-xs px-2 py-1 rounded border border-yellow-500/20">Lv. {upgrades.reduce((a,b)=>a+b.count,0)}</div>
           </div>
        </div>

        {/* Scrollable Items */}
        <div className="overflow-y-auto p-4 space-y-3 pb-32 md:pb-10 custom-scrollbar">
           {upgrades.map(u => {
             const progress = Math.min(100, (balance / u.cost) * 100);
             const canBuy = balance >= u.cost;
             
             return (
               <button 
                 key={u.id}
                 onClick={() => buyUpgrade(u.id)}
                 disabled={!canBuy}
                 className={`relative w-full p-4 rounded-xl border transition-all duration-300 group overflow-hidden ${
                    canBuy 
                    ? 'bg-glass border-yellow-500/30 hover:bg-yellow-900/20 hover:border-yellow-500 hover:shadow-[0_0_20px_rgba(234,179,8,0.1)]' 
                    : 'bg-white/5 border-transparent opacity-50 grayscale cursor-not-allowed'
                 }`}
               >
                 {/* Progress Bar Background */}
                 <div 
                   className="absolute bottom-0 left-0 h-[2px] bg-gradient-to-r from-yellow-600 to-yellow-300 transition-all duration-500"
                   style={{ width: `${progress}%` }}
                 ></div>

                 <div className="flex items-center justify-between relative z-10">
                    <div className="flex items-center gap-4">
                       <div className="text-3xl filter drop-shadow-lg group-hover:scale-110 transition-transform">{u.icon}</div>
                       <div className="text-left">
                          <div className={`font-bold text-sm ${canBuy ? 'text-white' : 'text-gray-400'}`}>{u.name}</div>
                          <div className="text-[10px] text-green-400 font-mono tracking-wider">+{u.income} BTC/S</div>
                       </div>
                    </div>
                    
                    <div className="text-right">
                       <div className={`font-mono font-bold ${canBuy ? 'text-yellow-400' : 'text-gray-500'}`}>
                          {u.cost >= 1000 ? (u.cost/1000).toFixed(1) + 'k' : u.cost}
                       </div>
                       <div className="text-[9px] text-gray-500 mt-1 uppercase">Owned: <span className="text-white">{u.count}</span></div>
                    </div>
                 </div>
               </button>
             );
           })}
        </div>
      </div>
    </div>
  );
}
