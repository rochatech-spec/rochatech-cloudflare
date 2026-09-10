import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'br.com.ritmo.gestaofinanceira',
  appName: 'Ritmo',
  webDir: 'dist',
  plugins: {
    LocalNotifications: {
      presentationOptions: ['badge', 'sound', 'banner', 'list'],
    },
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#F3F6FA',
  },
};

export default config;
