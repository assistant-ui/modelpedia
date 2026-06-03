export function StatsGrid({
  items,
}: {
  items: { label: string; value: number }[];
}) {
  return (
    <div className="bg-border ring-border grid grid-cols-3 gap-px overflow-hidden rounded-md ring-1">
      {items.map((item) => (
        <div key={item.label} className="bg-background px-4 py-4">
          <div className="text-foreground font-mono text-xl font-medium sm:text-2xl">
            {item.value}
          </div>
          <div className="text-muted-foreground mt-1 text-xs">{item.label}</div>
        </div>
      ))}
    </div>
  );
}
