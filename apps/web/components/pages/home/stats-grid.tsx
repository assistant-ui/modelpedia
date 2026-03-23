export function StatsGrid({
  items,
}: {
  items: { label: string; value: number }[];
}) {
  return (
    <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md bg-border ring-1 ring-border">
      {items.map((item) => (
        <div key={item.label} className="bg-background px-4 py-4">
          <div className="font-medium font-mono text-foreground text-xl sm:text-2xl">
            {item.value}
          </div>
          <div className="mt-1 text-muted-foreground text-xs">{item.label}</div>
        </div>
      ))}
    </div>
  );
}
