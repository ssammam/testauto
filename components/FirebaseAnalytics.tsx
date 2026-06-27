'use client';

import { useEffect } from 'react';
import { app, analytics } from '@/lib/firebase';

export default function FirebaseAnalytics() {
  useEffect(() => {
    // This simply ensures the module is imported and initialized on the client.
    if (app && analytics) {
      console.log("Firebase Analytics Initialized.");
    }
  }, []);

  return null;
}
