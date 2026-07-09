import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/lib/settings";
import { useMounted } from "@/lib/hooks";

/** Quick light/dark toggle in the header. Flips between light and dark modes. */
export function ThemeToggle() {
  const theme = useSettings((s) => s.theme);
  const update = useSettings((s) => s.update);
  const mounted = useMounted();

  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      mounted &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle theme"
      onClick={() => update({ theme: isDark ? "light" : "dark" })}
    >
      {mounted && isDark ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </Button>
  );
}
