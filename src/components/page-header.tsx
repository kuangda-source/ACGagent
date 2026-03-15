import type { ReactNode } from "react";

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <section className="hero">
      <span className="eyebrow">{eyebrow}</span>
      <div className="two-column" style={{ gridTemplateColumns: "minmax(0, 1.4fr) auto", alignItems: "end" }}>
        <div className="stack">
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {actions ? <div className="actions">{actions}</div> : null}
      </div>
    </section>
  );
}
