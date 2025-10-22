// Import the functions you need from the SDKs you need
import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyA1THLZZNMOnq-nJO_Esua59P25FkjtLx4",
  authDomain: "oraapp-ce853.firebaseapp.com",
  projectId: "oraapp-ce853",
  storageBucket: "oraapp-ce853.firebasestorage.app",
  messagingSenderId: "382554601493",
  appId: "1:382554601493:web:ea4713551348d2bfdc361c",
};

// Initialize Firebase (singleton)
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
