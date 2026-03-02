export interface Upgrade {
  id: number;
  name: string;
  cost: number;
  income: number; // Bitcoin per second
  count: number;
  icon: string;
}

export interface GameState {
  balance: number;
  incomePerSecond: number;
}
