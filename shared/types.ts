// @shared/types.ts

export interface Player {
  id: string;
  name: string;
  x: number;
  y: number;
  velocityY: number;
  score: number;
  alive: boolean;
  
  // Hapus timestamp, ganti dengan ini:
  flap: boolean; 
}

export interface Pipe {
  id: string;
  x: number;
  gapY: number;
  gapHeight: number;
}

export interface GameState {
  players: Record<string, Player>;
  pipes: Pipe[];
}