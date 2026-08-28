import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.easysay.speaking",
  appName: "EasySay",
  webDir: "dist",
  backgroundColor: "#f5f2e9",
  server: {
    androidScheme: "https",
    cleartext: true,
    allowNavigation: ["192.168.*.*", "10.*.*.*", "172.16.*.*"]
  },
  ios: {
    contentInset: "automatic",
    preferredContentMode: "mobile"
  },
  android: {
    allowMixedContent: true,
    backgroundColor: "#f5f2e9"
  },
  plugins: {
    CapacitorHttp: {
      enabled: false
    },
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: "#f5f2e9",
      showSpinner: false
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#f5f2e9",
      overlaysWebView: false
    }
  }
};

export default config;
