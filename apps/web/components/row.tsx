export function Row({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <div className="flex items-center justify-between border-border border-t px-4 py-2.5 text-sm first:border-t-0">
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
