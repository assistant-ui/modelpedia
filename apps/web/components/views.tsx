export function PageHeader({
  title,
  count,
  sub,
  icon,
  trailing,
}: {
  title: string;
  count?: number;
  sub?: string;
  icon?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <h1 className="flex items-center gap-2 font-medium text-base text-foreground tracking-tight">
        {icon}
        {title}
        {count != null && (
          <span className="font-normal text-muted-foreground">{count}</span>
        )}
        {trailing && (
          <span className="ml-auto flex items-center gap-2">{trailing}</span>
        )}
      </h1>
      {sub && <p className="mt-1.5 text-muted-foreground text-sm">{sub}</p>}
    </div>
  );
}

/** Convert ISO 3166-1 alpha-2 region code to flag emoji */
export function regionFlag(region: string): string {
  const code = region.toUpperCase();
  if (code.length !== 2) return region;
  return String.fromCodePoint(
    ...code.split("").map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}

export function Breadcrumb({
  items,
}: {
  items: (string | [string, string?])[];
}) {
  return (
    <div className="mb-3 flex items-center gap-2 text-muted-foreground text-sm">
      {items.map((item, i) => {
        const [label, href] = Array.isArray(item) ? item : [item];
        return (
          <span key={i} className="flex items-center gap-2">
            {i > 0 && <span className="text-border">/</span>}
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
    </div>
  );
}

export function Divider() {
  return (
    <div className="my-8 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
  );
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

export function ProviderIcon({
  provider,
  size = 16,
}: {
  provider: { icon?: string } | null | undefined;
  size?: number;
}) {
  if (!provider?.icon) return null;
  const svg = provider.icon.replace(
    "<svg ",
    `<svg width="${size}" height="${size}" `,
  );
  return (
    <span
      className="shrink-0 text-muted-foreground"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
