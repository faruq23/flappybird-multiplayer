export interface Player {
    id: string;
    name: string;
    x: number;
    y: number;
    vy: number;
    score: number;
    alive: boolean;
    invincibleUntil?: number;
}
export interface Pipe {
    id: string;
    x: number;
    gapY: number;
    gapHeight: number;
    passedBy: Record<string, boolean>;
}
export interface GameState {
    players: Record<string, Player>;
    pipes: Pipe[];
    tick: number;
}
