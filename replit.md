# Overview

Flappy Bird Multiplayer is a real-time multiplayer game built with TypeScript that combines the classic Flappy Bird gameplay with multiplayer functionality. The project features both single-player and multiplayer modes, where players can create/join rooms and compete in real-time. The game uses a client-server architecture with Phaser.js for the frontend game engine and Node.js with Socket.IO for real-time multiplayer communication.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Game Engine**: Phaser.js 3.70.0 for 2D game rendering and physics
- **Build Tool**: Vite for fast development and bundling
- **Scene Management**: Multiple Phaser scenes for different game states (MainMenu, Lobby, SinglePlayer, MultiplayerPlay)
- **Real-time Communication**: Socket.IO client for multiplayer connectivity
- **Responsive Design**: CSS-based centering and responsive layout
- **TypeScript**: Full type safety with shared types between client and server

## Backend Architecture
- **Runtime**: Node.js with Express.js for HTTP server
- **Real-time Engine**: Socket.IO for WebSocket-based multiplayer communication
- **Game Loop**: 20 TPS (50ms intervals) server-side game state updates
- **Room Management**: In-memory room system for multiplayer sessions
- **Game State Synchronization**: Server-authoritative game state with client prediction

## Project Structure
- **Monorepo Setup**: TypeScript project references for code sharing
- **Shared Types**: Common TypeScript interfaces in `/shared` directory
- **Client Package**: Separate Vite-based frontend in `/client`
- **Server Package**: Express + Socket.IO backend in `/server`
- **Path Mapping**: TypeScript path aliases for clean imports (`@shared/*`)

## Game Mechanics
- **Physics**: Arcade physics for bird movement and collision detection
- **Dynamic Difficulty**: Pipes become more frequent and gaps smaller over time
- **Collision System**: Bird collision with pipes, floor, and ceiling boundaries
- **Spectator Mode**: Players can watch others after elimination
- **Invincibility Frames**: Brief invincibility period after collisions

## Deployment Configuration
- **Development**: Vite dev server on port 5000, Node server on port 3001
- **Production**: Vercel configuration for client-side routing
- **Environment Variables**: Configurable server URL via VITE_SERVER_URL
- **CORS**: Dynamic CORS configuration for Replit and other environments

# External Dependencies

## Frontend Dependencies
- **phaser**: 3D/2D game framework for WebGL and Canvas rendering
- **socket.io-client**: Real-time bidirectional event-based communication
- **vite**: Fast build tool and development server
- **typescript**: Static type checking and compilation

## Backend Dependencies
- **express**: Web application framework for HTTP server
- **socket.io**: Real-time engine for WebSocket communication
- **cors**: Cross-Origin Resource Sharing middleware
- **ts-node**: TypeScript execution environment for development
- **nodemon**: Development tool for automatic server restarts

## Development Tools
- **TypeScript**: Shared type system across all packages
- **Project References**: TypeScript workspace management
- **Path Mapping**: Module resolution for shared code

## Hosting Environment
- **Frontend**: Designed for Vercel deployment with SPA routing
- **Backend**: Compatible with Replit and other Node.js hosting platforms
- **Environment Detection**: Automatic server URL configuration based on deployment environment