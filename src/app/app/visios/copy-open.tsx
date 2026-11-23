"use client";

import { useState } from "react";

/** Copie un message puis ouvre une page (profil LinkedIn) où il suffit de le coller. */
export function CopyAndOpen({ text, href, label, className }: { text: string; href: string; label: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <a
      className={className}
      style={{ padding: "4px 12px" }}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="Copie l'invitation, puis ouvre LinkedIn : cliquez sur « Message » et collez"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
        } catch {
          setDone(false);
        }
      }}
    >
      {done ? "Invitation copiée : collez-la sur LinkedIn" : label}
    </a>
  );
}
