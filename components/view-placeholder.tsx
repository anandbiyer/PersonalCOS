/** Shared Phase 0 placeholder for each view: mockup-styled header + a note
 *  about which phase brings it to life. */
export function ViewPlaceholder({
  eyebrow,
  title,
  description,
  phase,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  phase: string;
}) {
  return (
    <section>
      <div className="vh">
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      <div className="placeholder">{phase}</div>
    </section>
  );
}
