import { Upgrade } from './types';

export const INITIAL_UPGRADES: Upgrade[] = [
  { id: 1, name: "GTX 1050 Ti", cost: 15, income: 0.5, count: 0, icon: "💻" },
  { id: 2, name: "RTX 3090", cost: 100, income: 5, count: 0, icon: "🖥️" },
  { id: 3, name: "ASIC Miner", cost: 1000, income: 50, count: 0, icon: "🔋" },
  { id: 4, name: "Mining Farm", cost: 10000, income: 400, count: 0, icon: "🏭" },
  { id: 5, name: "Quantum Computer", cost: 100000, income: 3000, count: 0, icon: "⚛️" }
];
