# Flappy Bird Multiplayer

Ini proyek Flappy Bird versi multiplayer, dibikin pakai Phaser buat sisi *client* (game & visual) dan Node.js + Socket.IO buat *server* *realtime multiplayer*-nya. Bisa main *single-player* maupun *multiplayer*.

## Daftar Isi

- [Fitur](#fitur)
- [Cara Main](#cara-main)
- [Overview Teknis](#overview-teknis)
  - [Client (Phaser)](#client-phaser)
  - [Server (Node.js + Socket.IO)](#server-nodejs--socketio)
  - [Shared (TypeScript Types)](#shared-typescript-types)
- [Struktur Proyek](#struktur-proyek)
- [Setup & Instalasi](#setup--instalasi)
- [Jalanin Game](#jalanin-game)
- [Contributing](#contributing)
- [License](#license)

## Fitur

- **Single-Player**: Main mode single-player
- **Multiplayer**:
  - Bisa bikin dan *join room*.
  - Posisi burung & gerakan pipa sinkron *realtime*.
  - Mode penonton kalau udah eliminasi.
  - Semakin lama pipanya bakal makin susah
- **Responsive**: Sudah cukup baik, walaupun masih ada yang perlu diperbaiki

## Cara Main

### Single-Player

1. Dari menu utama klik "Single Player".
2. Klik *mouse* atau tekan `SPACE` buat bikin burung *nge-flap*.
3. Lewatin pipa tanpa nabrak pipa, lantai, atau langit-langit.
4. Kalau nabrak atau keluar batas, *game over*.

### Multiplayer

1. Dari menu utama klik "Multiplayer".
2. Di *lobby*:
    - **Create Room**: Bikin *Room ID* unik, *share* ke temen.
    - **Join Room**: Masukin *Room ID* temen, klik "Join Room".
3. Di *room*, keliatan *list* pemain yang nyambung.
4. *Host* (yang bikin *room*) klik "Start Game" buat mulai.
5. Mainnya mirip *single-player*: klik *mouse* / `SPACE` buat *flap*.
6. Kalau burung nabrak atau keluar batas, kamu eliminasi, masuk mode penonton, bisa liat pemain lain.
7. Game selesai kalau semua pemain di *room* udah eliminasi.

## Overview Teknis

### Client (Phaser)

*Client* pake Phaser 3, *framework game* 2D yang lumayan oke.

- **Scenes**:
  - `MainMenuScene`: Menu awal, pilih *single-player* atau *multiplayer*.
  - `LobbyScene`: Bikin/*join room*, liat *list* pemain, pake Socket.IO buat *realtime*.
  - `SinglePlayerScene`: Mekanisme Flappy Bird *single-player*: fisika, generasi pipa, *collision*, *scoring*.
  - `MultiplayerPlayScene`: *Render state game multiplayer* dari *server*, sinkron burung & pipa, *handle input* & *spectator mode*.
- **Input**: *Mouse* & `SPACE`.
- **Assets**: Burung, pipa, dll.

### Server (Node.js + Socket.IO)

*Server* pake Node.js + Socket.IO buat komunikasi *realtime*.

- **Game Rooms**: *Server handle* tiap *room* sendiri, masing-masing punya `GameState`.
- **Game Loop**: Tiap *room* jalanin *game loop* sendiri (`setInterval`) buat *update state* tiap *tick* (`TICK_MS`).
- **Fisika**: *Server* jadi *authority* fisika, ngehitung gerakan burung, *collision*, pipa.
- **Sinkronisasi State**: *Server* kirim *event update* ke semua *client* di *room*, biar semua sinkron.
- **Dynamic Difficulty**: Jarak pipa & *spawn interval* ikut skor tertinggi pemain, makin sulit seiring *progress*.
- **Player Management**: *Handle* koneksi, *disconnect*, status pemain (*alive*, skor, *invincibility*, dll).

### Shared (TypeScript Types)

Di folder `shared` ada TypeScript *types* (`types.ts`) yang dipake *client* & *server*, biar konsisten: `Player`, `Pipe`, `GameState`.

## Struktur Proyek

```
multiplayer-flappybird/
├── client/                 # Frontend (Phaser)
│   ├── public/             # Assets game (gambar)
│   ├── src/                # Source TypeScript client
│   │   ├── LobbyScene.ts
│   │   ├── main.ts
│   │   ├── MainMenuScene.ts
│   │   ├── MultiplayerPlayScene.ts
│   │   └── SinglePlayerScene.ts
│   └── ...                 # config client (package.json, tsconfig.json, vite.config.ts)
├── server/                 # Backend (Node.js + Socket.IO)
│   ├── src/                # Source server
│   │   └── index.ts
│   └── ...                 # config server
├── shared/                 # TypeScript types & interface
│   ├── types.ts
│   └── ...                 
├── .gitignore
├── package.json            # Root dependencies
├── package-lock.json
├── tsconfig.json           # Root TS config
└── ...
```

## Setup & Instalasi

Untuk *setup* proyek secara lokal, ikuti langkah-langkah berikut:

1. **Clone *repo***:

    ```bash
    git clone https://github.com/VitoSolin/flappybird-muliplayer
    cd multiplayer-flappybird
    ```

2. **Install *dependencies***:
    Tiap *folder* punya `package.json` sendiri, jadi *install* di *root*, *client*, *server*:

    ```bash
    # Root
    npm install

    # Client
    cd client
    npm install
    cd /..

    # Server
    cd server
    npm install
    cd /..
    ```

## Jalanin Game

Untuk jalanin *game*, kamu perlu *start* *server* dahulu, lalu lanjut dengan *start* *client*.

1. **Start *Server***:
    Buka *terminal* baru dan masuk ke *folder* `server`:
    ```bash
    cd server
    npm run dev
    ```
    
2. **Start *Client***:
    Buka *terminal* baru lagi dan masuk ke *folder* `client`:
    ```bash
    cd client
    npm run dev
    ```

    Kamu bisa akses *game* di *web browser* kamu.

## Contributing

Bebas kontribusi! Silakan buka *issue* atau *pull request*.

## License

Proyek ini *open-source* dan tersedia di bawah [MIT License](LICENSE).
