import { Briefcase, User, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TripCategory } from "@/lib/types";

const CONFIG: Record<TripCategory, { label: string; className: string; Icon: typeof Briefcase }> = {
  business: {
    label: "Business",
    className: "bg-business-muted text-business border-transparent",
    Icon: Briefcase,
  },
  personal: {
    label: "Personal",
    className: "bg-personal-muted text-personal border-transparent",
    Icon: User,
  },
  unclassified: {
    label: "Unclassified",
    className: "bg-muted text-muted-foreground border-transparent",
    Icon: HelpCircle,
  },
};

export function CategoryBadge({
  category,
  className,
}: {
  category: TripCategory;
  className?: string;
}) {
  const { label, className: cls, Icon } = CONFIG[category];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        cls,
        className,
      )}
    >
      <Icon className="size-3" />
      {label}
    </span>
  );
}
