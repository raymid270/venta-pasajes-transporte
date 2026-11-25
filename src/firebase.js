import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyD8tDRbxqrn2p0MLUzJJT0JogLPMOOhCoo",
  authDomain: "venta-pasajes-transporte.firebaseapp.com",
  projectId: "venta-pasajes-transporte",
  storageBucket: "venta-pasajes-transporte.firebasestorage.app",
  messagingSenderId: "449119104427",
  appId: "1:449119104427:web:702772d4454061b7ab36ee",
  measurementId: "G-R4X4RJNZN8"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);