export interface Player {
  id: string;
  x: number;
  y: number;
  vy: number; // velocity Y for simple physics on client or server
  score: number;
  alive: boolean;
  invincibleUntil?: number;
}

export interface Pipe {
  id: string;
  x: number;
  gapY: number; // center of gap
  gapHeight: number;
  passedBy?: Record<string, boolean>; // track which players already scored on this pipe
}

export interface GameState {
  players: Record<string, Player>;
  pipes: Pipe[];
  tick: number;
}