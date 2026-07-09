import { useEffect } from "react";
import { useSettings } from "./settings";

/**
 * Applies the selected theme (light / dark / system) to the document.
 * Rendered once near the app root; renders nothing.
 */
export function ThemeManager() {
  const theme = useSettings((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && media.matches);
      root.classList.toggle("dark", dark);
    };

    apply();
    if (theme === "system") {
      media.addEventListener("change", apply);
      return () => media.removeEventListener("change", apply);
    }
  }, [theme]);

  return null;
}
