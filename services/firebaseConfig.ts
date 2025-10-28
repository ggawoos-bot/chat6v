// Firebase configuration and initialization
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyA0zyaTI--MHXoNPYlTf95S6iJu67XdRic",
  authDomain: "chat6-4b97d.firebaseapp.com",
  projectId: "chat6-4b97d",
  storageBucket: "chat6-4b97d.firebasestorage.app",
  messagingSenderId: "437591723431",
  appId: "1:437591723431:web:9f228e7d46f33f9d49fa82"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);

// Initialize Analytics (optional)
export const analytics = getAnalytics(app);

export default app;
