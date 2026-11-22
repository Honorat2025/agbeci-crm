"use client";

import { useRef, useState } from "react";

/**
 * Affiche le HTML d'un email dans un cadre isolé : aucun script ne peut s'y exécuter,
 * et il ne peut pas modifier la page du CRM.
 */
export function EmailFrame({ html, allowImages }: { html: string; allowImages: boolean }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(200);
  const imgSrc = allowImages ? "data: cid: https: http:" : "data: cid:";
  const doc = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${imgSrc}; style-src 'unsafe-inline'; font-src data:">
<base target="_blank">
<style>body{margin:0;font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1d1d1b;background:#fff;word-wrap:break-word}img{max-width:100%;height:auto}</style>
</head><body>${html}</body></html>`;
  return (
    <iframe
      ref={ref}
      className="email-frame"
      title="Contenu de l'email"
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={doc}
      style={{ height }}
      onLoad={() => {
        const h = ref.current?.contentDocument?.body.scrollHeight;
        if (h) setHeight(Math.min(h + 20, 4000));
      }}
    />
  );
}
