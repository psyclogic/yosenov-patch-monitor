// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
export const firebaseConfig = {
  apiKey: "AIzaSyDnZlELIrRoiuQzdhLV_GIbXkSuE2NuN1k",
  authDomain: "ysnupdate-182f6.firebaseapp.com",
  projectId: "ysnupdate-182f6",
  storageBucket: "ysnupdate-182f6.firebasestorage.app",
  messagingSenderId: "803224220954",
  appId: "1:803224220954:web:d243c7037a07988d8528a3",
  measurementId: "G-13S1FMD10F"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);