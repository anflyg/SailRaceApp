import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.anflyg.sailraceapp',
  appName: 'TackWise Race',
  webDir: 'dist',
  // Auth bridge calls contain credentials; suppress native bridge argument logging.
  loggingBehavior: 'none',
  backgroundColor: '#F3F2ED',
};

export default config;
