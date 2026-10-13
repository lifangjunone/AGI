import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.fde.homesort',
  appName: 'HomeSort',
  webDir: 'dist',
  backgroundColor: '#f5f1e8',
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
  },
}

export default config
