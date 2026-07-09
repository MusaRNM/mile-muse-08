import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  accent?: "primary" | "business" | "personal" | "muted";
  className?: string;
  onClick?: () => void;
}

const ACCENT: Record<NonNullable<StatCardProps["accent"]>, string> = {
  primary: "text-primary",
  business: "text-business",
  personal: "text-personal",
  muted: "text-foreground",
};

export function StatCard({ label, value, sub, icon, accent = "muted", className, onClick }: StatCardProps) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={cn(
        "w-full rounded-2xl border bg-card p-4 text-left shadow-sm",
        onClick && "transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-primary",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <div className={cn("mt-2 font-display text-2xl font-semibold tabular-nums", ACCENT[accent])}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </Comp>
  );
}
