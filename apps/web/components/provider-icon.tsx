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
