export function Section({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 id={id} className="text-muted-foreground mb-4 text-sm">
        {title}
      </h2>
      {children}
    </section>
  );
}
