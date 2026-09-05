export const firebaseConfig = {
  apiKey: "AIzaSyB2VahpQ2w6kq-4yjAgqKYe1h8s6FLn_lg",
  authDomain: "moabyconsultoria.firebaseapp.com",
  projectId: "moabyconsultoria",
  storageBucket: "moabyconsultoria.firebasestorage.app",
  messagingSenderId: "806675819509",
  appId: "1:806675819509:web:4716972221a778e6c0cebc"
};

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);