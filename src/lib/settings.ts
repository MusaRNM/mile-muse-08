import { create } from "zustand";
import { persist } from "zustand/middleware";
import { type AppSettings, DEFAULT_SETTINGS } from "./types";

interface SettingsState extends AppSettings {
  update: (patch: Partial<AppSettings>) => void;
  reset: () => void;
}

/**
 * Global settings, persisted to localStorage. Kept separate from the trip/fuel
 * IndexedDB store because it is small and needs to be read synchronously.
 */
export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      update: (patch) => set(patch),
      reset: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: "miletrack-settings",
      version: 1,
    },
  ),
);
