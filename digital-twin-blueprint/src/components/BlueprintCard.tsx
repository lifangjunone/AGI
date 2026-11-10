export function BlueprintCard({
  title,
  children,
  eyebrow,
}: {
  title: string;
  children: React.ReactNode;
  eyebrow?: string;
}) {
  return (
    <section className="blueprint-card">
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h3>{title}</h3>
      {children}
    </section>
  );
}
