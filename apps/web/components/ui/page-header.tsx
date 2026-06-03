import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function PageHeader({
  title,
  count,
  sub,
  icon,
  trailing,
  className,
}: {
  title: string;
  count?: number;
  sub?: ReactNode;
  icon?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-8", className)}>
      <h1 className="text-foreground flex items-center gap-2.5 text-lg font-medium tracking-tight">
        {icon}
        {title}
        {count != null && (
          <span className="text-muted-foreground font-normal">{count}</span>
        )}
        {trailing && (
          <span className="ml-auto flex items-center gap-2">{trailing}</span>
        )}
      </h1>
      {sub && (
        <div className="text-muted-foreground mt-1.5 flex items-center gap-3 text-sm">
          {sub}
        </div>
      )}
    </div>
  );
}
