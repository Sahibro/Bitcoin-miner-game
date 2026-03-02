import React, { useState, useEffect } from 'react';
import { Bitcoin } from './components/Bitcoin';
import { INITIAL_UPGRADES } from './constants';
import { useGameLoop } from './hooks/useGameLoop';
import { Upgrade } from './types';

export default function App() {
  const [balance, setBalance] = useState(0);
  const [upgrades, setUpgrades] = useState<Upgrade[]>(INITIAL_UPGRADES);

  // Calculate Income Per Second (IPS)
  const incomePerSecond = upgrades.reduce((acc, curr) => acc + (curr.income * curr.count), 0);

  // Auto mine every second
  useGameLoop(() => {
    setBalance(prev => prev + incomePerSecond);
  }, 1000);

  // Click Handler
  const handleClick = () => {
    setBalance(prev => prev + 1);
  };

  // Buy Upgrade Handler
  const buyUpgrade = (id: number) => {
    const upgradeIndex = upgrades.findIndex(u => u.id === id);
    const upgrade = upgrades[upgradeIndex];

    if (balance >= upgrade.cost) {
      setBalance(prev => prev - upgrade.cost);
      
      const newUpgrades = [...upgrades];
      newUpgrades[upgradeIndex] = {
        ...upgrade,
        count: upgrade.count + 1,
        cost: Math.round(upgrade.cost * 1.15) // Price increases by 15%
      };
      setUpgrades(newUpgrades);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col md:flex-row overflow-hidden">
      
      {/* Left Panel: Mining Area */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 border-b md:border-r border-gray-700">
        <h1 className="text-4xl font-bold mb-2">Bitcoin Miner</h1>
        <div className="text-3xl font-mono text-yellow-400 mb-8">
          {balance.toFixed(1)} BTC
        </div>
        <Bitcoin onClick={handleClick} />
        <div className="mt-8 text-gray-400">
          Mining: {incomePerSecond.toFixed(1)} BTC/sec
        </div>
      </div>

      {/* Right Panel: Shop */}
      <div className="flex-1 bg-gray-800 p-6 overflow-y-auto h-[50vh] md:h-screen">
        <h2 className="text-2xl font-bold mb-4">Shop 🛒</h2>
        <div className="space-y-4">
          {upgrades.map(upgrade => (
            <button
              key={upgrade.id}
              onClick={() => buyUpgrade(upgrade.id)}
              disabled={balance < upgrade.cost}
              className={`w-full p-4 rounded-lg flex items-center justify-between transition-all ${
                balance >= upgrade.cost 
                  ? 'bg-gray-700 hover:bg-gray-600' 
                  : 'bg-gray-700/50 opacity-50 cursor-not-allowed'
              }`}
            >
              <div className="flex items-center gap-4">
                <span className="text-2xl">{upgrade.icon}</span>
                <div className="text-left">
                  <div className="font-bold">{upgrade.name}</div>
                  <div className="text-xs text-green-400">+{upgrade.income} BTC/s</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-yellow-400 font-mono">{upgrade.cost}</div>
                <div className="text-xs text-gray-400">Owned: {upgrade.count}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
