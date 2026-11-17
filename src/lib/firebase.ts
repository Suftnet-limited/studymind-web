import { initializeApp, getApps } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: 'AIzaSyCRtovLYUjRH4IpO7_zifu1GtTQ8-rfDTA',
  authDomain: 'revvo-86dcd.firebaseapp.com',
  projectId: 'revvo-86dcd',
  storageBucket: 'revvo-86dcd.firebasestorage.app',
  messagingSenderId: '35209840626',
  appId: '1:35209840626:web:9533c51695a027b7e18d6b',
  measurementId: 'G-YG9GCSHHEJ',
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

// Analytics is only available in the browser
export const analyticsPromise = isSupported().then((yes) => yes ? getAnalytics(app) : null);
