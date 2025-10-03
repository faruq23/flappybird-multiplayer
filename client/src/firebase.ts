// src/firebase.ts

import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyBKJobRn4qhfa4ZM0lwfr_cUkjeSgIQsnw",
  authDomain: "flappybird-multiplayer-uas.firebaseapp.com",
  projectId: "flappybird-multiplayer-uas",
  storageBucket: "flappybird-multiplayer-uas.firebasestorage.app",
  messagingSenderId: "834348090845",
  appId: "1:834348090845:web:12b703e8e2bc5fccf7a234",
  measurementId: "G-NTGF7E7L8K",

  // PASTIKAN BARIS INI BENAR SESUAI PESAN ERROR
  databaseURL: "https://flappybird-multiplayer-uas-default-rtdb.asia-southeast1.firebasedatabase.app",
};

const app = initializeApp(firebaseConfig);
export const database = getDatabase(app);