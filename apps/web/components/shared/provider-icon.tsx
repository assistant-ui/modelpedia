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
      className="text-muted-foreground shrink-0"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
