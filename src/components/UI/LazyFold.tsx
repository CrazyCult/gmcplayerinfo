"use client";

import { useState, type ReactNode } from "react";

/** Compute content on first opening, then retain it and its local state. */
export default function LazyFold({
  title,
  summary,
  children,
}: {
  title: string;
  summary?: ReactNode;
  children: () => ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  return (
    <details
      className="card fold"
      onToggle={(event) => {
        if (event.currentTarget.open) setMounted(true);
      }}
    >
      <summary>
        <span className="fold-title">{title}</span>
        {summary && <span className="fold-summary">{summary}</span>}
        <span className="fold-chevron" aria-hidden="true" />
      </summary>
      <div className="fold-body">{mounted && children()}</div>
    </details>
  );
}
