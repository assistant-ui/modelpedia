import { cn } from "@/lib/cn";

const variants = {
  muted: "bg-muted text-muted-foreground",
  green: "bg-green-500/10 text-green-600 dark:text-green-400",
  red: "bg-red-500/10 text-red-600 dark:text-red-400",
  yellow: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  purple: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  orange: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
} as const;

export function Badge({
  children,
  variant = "muted",
  title,
  className,
}: {
  children: React.ReactNode;
  variant?: keyof typeof variants;
  title?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 font-mono text-xs",
        variants[variant],
        className,
      )}
      title={title}
    >
      {children}
    </span>
  );
}
