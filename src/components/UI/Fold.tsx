import type { ReactNode } from "react";

/** Partie de page repliable : titre et résumé toujours visibles. */
export default function Fold({
  title,
  summary,
  open = false,
  children,
}: {
  title: string;
  summary?: ReactNode;
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="card fold" open={open}>
      <summary>
        <span className="fold-title">{title}</span>
        {summary && <span className="fold-summary">{summary}</span>}
        <span className="fold-chevron" aria-hidden="true" />
      </summary>
      <div className="fold-body">{children}</div>
    </details>
  );
}
