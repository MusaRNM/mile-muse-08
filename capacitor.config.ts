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
    webContentsDebuggingEnabled: true,
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
      // Android auto-requests location permissions on first watchPosition call.
      permissions: ["location", "coarseLocation"],
    },
  },
};

export default config;
