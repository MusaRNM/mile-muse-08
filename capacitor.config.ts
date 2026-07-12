import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.miletrack",
  appName: "MileTrack",
  webDir: ".output/public",
  server: {
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    // Disabled for release builds — WebView debugging over ADB would let a
    // physically-connected attacker inspect IndexedDB (trips, GPS history,
    // receipts) and any in-memory state. Re-enable only for local debugging.
    webContentsDebuggingEnabled: false,
    backgroundColor: "#0b0b0f",
    useLegacyBridge: true,
  },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_icon",
      iconColor: "#d67a21",
    },
    BackgroundGeolocation: {
      requestPermissionsOnStart: true,
    },
    Geolocation: {
      permissions: ["location", "coarseLocation"],
    },
  },
};

export default config;
