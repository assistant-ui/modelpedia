import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

function Row({
  label,
  value,
  href,
  className,
}: {
  label: string;
  value: ReactNode;
  href?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between border-border border-t px-4 py-2.5 text-sm first:border-t-0",
        className,
      )}
    >
      <span className="text-muted-foreground">{label}</span>
      {href ? (
        <a
          href={href}
          className="text-foreground transition-colors duration-200 hover:text-foreground"
        >
          {value}
        </a>
      ) : (
        <span className="text-foreground">{value}</span>
      )}
    </div>
  );
}

export { Row };
