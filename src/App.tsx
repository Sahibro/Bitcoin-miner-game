import React, { useState, useEffect } from 'react';
import { INITIAL_UPGRADES } from './constants';
import { useGameLoop } from './hooks/useGameLoop';
import { Upgrade } from './types';
import { motion, AnimatePresence } from 'framer-motion';

export default function App() {
  const [balance, setBalance] = useState(0);
  const [upgrades, setUpgrades] = useState<Upgrade[]>(INITIAL_UPGRADES);
  const [clicks, setClicks] = useState<{id: number, x: number, y: number, val: number}[]>([]);

  // Calculate Income
  const incomePerSecond = upgrades.reduce((acc, curr) => acc + (curr.income * curr.count), 0);

  useGameLoop(() => {
    setBalance(prev => prev + incomePerSecond);
  }, 1000);

  const handleClick = (e: React.MouseEvent | React.TouchEvent) => {
    setBalance(prev => prev + 1);
    
    // Get Coordinates
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
      
      {/* Background with Dark Aura */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,#2d3748,black)] pointer-events-none z-0"></div>
      
      {/* Floating Numbers */}
      <AnimatePresence>
        {clicks.map(c => (
          <motion.div
            key={c.id}
            initial={{ opacity: 1, y: 0, scale: 0.5 }}
            animate={{ opacity: 0, y: -150, scale: 2 }}
            exit={{ opacity: 0 }}
            className="absolute text-4xl font-bold text-yellow-400 pointer-events-none z-50 drop-shadow-[0_0_5px_rgba(255,215,0,0.8)]"
            style={{ left: c.x - 20, top: c.y - 50 }}
          >
            +{c.val}
          </motion.div>
        ))}
      </AnimatePresence>

      {/* LEFT SIDE: MINER */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 z-10 relative mt-8 md:mt-0">
        
        {/* Balance Header */}
        <div className="flex flex-col items-center mb-8">
           <h1 className="text-gray-500 text-xs uppercase tracking-[0.3em] mb-2 font-bold">Encrypted Wallet</h1>
           <div className="text-5xl md:text-7xl font-mono font-bold text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-400 drop-shadow-sm">
             {balance.toFixed(0)} <span className="text-yellow-500 text-3xl align-top">BTC</span>
           </div>
        </div>

        {/* 3D SVG BITCOIN (NO COPYRIGHT ISSUE) */}
        <motion.div 
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95, rotate: 10 }}
          className="cursor-pointer relative z-20 group"
          onClick={handleClick}
        >
          {/* Glowing Effect behind */}
          <div className="absolute inset-0 bg-yellow-600 blur-[60px] opacity-20 group-hover:opacity-40 transition-opacity rounded-full"></div>
          
          {/* The SVG Code - This draws the coin directly */}
          <svg viewBox="0 0 200 200" className="w-64 h-64 md:w-80 md:h-80 drop-shadow-2xl">
            <defs>
              <linearGradient id="coinGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style={{stopColor:"#fcd34d", stopOpacity:1}} />
                <stop offset="100%" style={{stopColor:"#d97706", stopOpacity:1}} />
              </linearGradient>
              <linearGradient id="edgeGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style={{stopColor:"#fbbf24", stopOpacity:1}} />
                <stop offset="100%" style={{stopColor:"#b45309", stopOpacity:1}} />
              </linearGradient>
            </defs>
            
            {/* Outer Coin Body */}
            <circle cx="100" cy="100" r="95" fill="url(#edgeGrad)" />
            <circle cx="100" cy="100" r="88" fill="url(#coinGrad)" stroke="#b45309" strokeWidth="2" />
            <circle cx="100" cy="100" r="70" fill="none" stroke="#fef3c7" strokeWidth="1" opacity="0.5" />
            
            {/* The 'B' Symbol */}
            <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fill="white" fontSize="120" fontWeight="bold" fontFamily="Arial" style={{filter: 'drop-shadow(2px 2px 0px rgba(180, 83, 9, 1))'}}>
              ₿
            </text>
            
            {/* Shine effect */}
            <ellipse cx="60" cy="60" rx="30" ry="15" fill="white" opacity="0.3" transform="rotate(-45 60 60)" />
          </svg>
        </motion.div>

        {/* Mining Speed Indicator */}
        <div className="mt-12 flex flex-col items-center">
          <div className="text-gray-400 text-xs tracking-widest mb-1">CURRENT HASHRATE</div>
          <div className="bg-gray-800/80 backdrop-blur border border-green-500/30 px-6 py-2 rounded-xl flex items-center gap-3 shadow-[0_0_15px_rgba(34,197,94,0.1)]">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-ping"></div>
            <span className="font-mono text-green-400 font-bold text-lg">{incomePerSecond.toFixed(1)} /s</span>
          </div>
        </div>
      </div>

      {/* RIGHT SIDE: SHOP */}
      <div className="flex-1 md:h-screen md:max-w-md bg-gray-900 border-t md:border-l border-gray-800 flex flex-col z-30 shadow-xl">
        <div className="p-6 bg-gray-900 border-b border-gray-800 flex justify-between items-center sticky top-0 z-40">
          <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">
            MARKETPLACE
          </h2>
          <span className="text-xs font-mono text-gray-500">{upgrades.reduce((a,c)=>a+c.count,0)} ITEMS OWNED</span>
        </div>

        {/* Scrollable Shop List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-32 md:pb-10 custom-scrollbar">
          {upgrades.map(upgrade => {
            const canBuy = balance >= upgrade.cost;
            return (
              <button
                key={upgrade.id}
                onClick={() => buyUpgrade(upgrade.id)}
                disabled={!canBuy}
                className={`w-full p-4 rounded-xl border flex items-center justify-between relative overflow-hidden transition-all duration-100 group ${
                  canBuy 
                    ? 'bg-gray-800 border-gray-700 hover:border-yellow-500/50 hover:bg-gray-800 active:scale-[0.98]' 
                    : 'bg-gray-900/50 border-gray-800 opacity-40 cursor-not-allowed'
                }`}
              >
                <div className="flex items-center gap-4 z-10">
                  <div className={`text-3xl p-3 rounded-lg ${canBuy ? 'bg-gray-700' : 'bg-gray-800'}`}>
                    {upgrade.icon}
                  </div>
                  <div className="text-left">
                    <div className="font-bold text-gray-200">{upgrade.name}</div>
                    <div className="text-xs font-mono text-green-400">+{upgrade.income} BTC/s</div>
                  </div>
                </div>

                <div className="text-right z-10">
                  <div className={`font-bold font-mono text-lg ${canBuy ? 'text-yellow-400' : 'text-gray-500'}`}>
                    {upgrade.cost.toLocaleString()}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  );
}
