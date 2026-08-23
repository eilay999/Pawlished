import type { CapacitorConfig } from '@capacitor/cli';

const target = (process.env.PAWLISHED_APP || 'admin').toLowerCase();
const isClient = target === 'client' || target === 'booking' || target === 'public';

const config: CapacitorConfig = isClient
  ? {
      appId: 'com.pawlished.booking',
      appName: 'Pawlished Booking',
      webDir: 'dist-client',
      android: {
        path: 'android-client'
      },
      ios: {
        path: 'ios-client'
      }
    }
  : {
      appId: 'com.pawlished.app',
      appName: 'Pawlished CRM',
      webDir: 'dist',
      android: {
        path: 'android'
      },
      ios: {
        path: 'ios'
      }
    };

export default config;
