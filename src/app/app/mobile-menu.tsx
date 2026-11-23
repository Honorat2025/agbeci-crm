"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/** Menu du téléphone : se referme tout seul quand on change de page. */
export function MobileMenu({ badge, children }: { badge: number; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();
  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname]);
  return (
    <details className="menu" ref={ref}>
      <summary aria-label="Menu">Menu{badge > 0 && <span className="count">{badge}</span>}</summary>
      <div className="menu-panel">{children}</div>
    </details>
  );
}
