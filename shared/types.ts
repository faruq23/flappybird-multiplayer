export interface Player {
  id: string;
  name: string;
  x: number;
  y: number;
  velocityY: number;
  score: number;
  alive: boolean;
  invincibleUntil: number;
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