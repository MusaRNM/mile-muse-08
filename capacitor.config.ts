import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.miletrack",
  appName: "MileTrack",
  webDir: "dist/client",
  server: {
    androidScheme: "https",
  },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_icon",
      iconColor: "#d67a21",
    },
    BackgroundGeolocation: {
      // Ask on first use; permission persists after user accepts.
      requestPermissionsOnStart: true,
    },
  },
  ios: {
    contentInset: "always",
  },
};

export default config;
