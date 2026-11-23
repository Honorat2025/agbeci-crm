"use client";

import { useState } from "react";

export function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="row" style={{ alignItems: "center" }}>
      <input type="text" readOnly value={value} aria-label="Lien d'abonnement" onFocus={(e) => e.target.select()} style={{ flex: "1 1 260px" }} />
      <button
        type="button"
        className="btn secondary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? "Copié" : "Copier le lien"}
      </button>
    </div>
  );
}
