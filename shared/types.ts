// shared/types.ts

export interface Player {
  id: string;
  name: string;
  x: number;
  y: number;
  velocityY: number; // Kita akan gunakan 'velocityY' agar konsisten
  score: number;
  alive: boolean;
  invincibleUntil: number;
  // Properti krusial untuk input
  lastFlapTime: number;
  processedFlapTime: number;
}

export interface Pipe {
  x: number;
  gapY: number;
  gapHeight: number;
}

export interface GameState {
  players: Record<string, Player>;
  pipes: Pipe[];
}