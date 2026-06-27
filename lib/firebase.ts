import { initializeApp, getApps } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyCA9ntClE0aPz3Hyl48rjOwSSE2luHiWts",
  authDomain: "testautomation-c4bfd.firebaseapp.com",
  projectId: "testautomation-c4bfd",
  storageBucket: "testautomation-c4bfd.firebasestorage.app",
  messagingSenderId: "451609946846",
  appId: "1:451609946846:web:e9066d26c88e92f0fef04f",
  measurementId: "G-YD6EWMCV1H"
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Initialize Analytics only if supported (browser environment)
let analytics: any = null;
if (typeof window !== "undefined") {
  isSupported().then((yes) => yes ? analytics = getAnalytics(app) : null);
}

export { app, analytics };
