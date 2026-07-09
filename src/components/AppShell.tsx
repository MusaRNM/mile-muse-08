import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { LayoutDashboard, Route as RouteIcon, Fuel, FileText, Settings, Navigation } from "lucide-react";
import { cn } from "@/lib/utils";
import { TrackingBar } from "./TrackingBar";
import { ThemeToggle } from "./ThemeToggle";

const TABS = [
  { to: "/", label: "Dashboard", Icon: LayoutDashboard, exact: true },
  { to: "/trips", label: "Trips", Icon: RouteIcon, exact: false },
  { to: "/fuel", label: "Fuel", Icon: Fuel, exact: false },
  { to: "/reports", label: "Reports", Icon: FileText, exact: false },
  { to: "/settings", label: "Settings", Icon: Settings, exact: false },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col bg-background">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-background/80 px-4 py-3 backdrop-blur">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Navigation className="size-4" />
          </span>
          <span className="font-display text-lg font-bold tracking-tight">MileTrack</span>
        </Link>
        <ThemeToggle />
      </header>

      <main className="flex-1 px-4 pb-40 pt-4">{children}</main>

      <div className="fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-lg">
        <TrackingBar />
        <nav className="grid grid-cols-5 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
          {TABS.map(({ to, label, Icon, exact }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact }}
              className="flex flex-col items-center gap-1 py-2.5 text-muted-foreground transition-colors"
              activeProps={{ className: "text-primary" }}
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      "flex size-9 items-center justify-center rounded-xl transition-colors",
                      isActive && "bg-primary/10",
                    )}
                  >
                    <Icon className="size-5" />
                  </span>
                  <span className="text-[10px] font-medium">{label}</span>
                </>
              )}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
