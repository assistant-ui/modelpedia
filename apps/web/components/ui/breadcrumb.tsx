import { cn } from "@/lib/cn";

type BreadcrumbItem = string | [label: string, href?: string];

export function Breadcrumb({
  items,
  className,
}: {
  items: BreadcrumbItem[];
  className?: string;
}) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn(
        "mb-3 flex items-center gap-2 text-muted-foreground text-sm",
        className,
      )}
    >
      {items.map((item, i) => {
        const [label, href] = Array.isArray(item) ? item : [item];
        return (
          <span key={i} className="flex items-center gap-2">
            {i > 0 && (
              <span aria-hidden className="text-border">
                /
              </span>
            )}
            {href ? (
              <a
                href={href}
                className="transition-colors duration-200 hover:text-foreground"
              >
                {label}
              </a>
            ) : (
              <span className="text-foreground">{label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
