import { asc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { isLoggedIn } from "@/lib/session";

function csvCell(v: unknown): string {
  const s = v instanceof Date ? v.toISOString() : v == null ? "" : String(v);
  // Neutralise les formules quand le fichier est ouvert dans un tableur.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function GET() {
  if (!(await isLoggedIn())) return new Response("Non autorisé", { status: 401 });
  const { contacts } = schema;
  const rows = await getDb().select().from(contacts).orderBy(asc(contacts.id));
  const header = ["email", "prenom", "nom", "statut", "source", "consentement_le", "consentement_source", "confirme_le", "desinscrit_le", "cree_le"];
  const lines = rows.map((c) =>
    [c.email, c.firstName, c.lastName, c.newsletterStatus, c.source, c.consentAt, c.consentSource, c.confirmedAt, c.unsubscribedAt, c.createdAt]
      .map(csvCell)
      .join(","),
  );
  const body = "﻿" + [header.join(","), ...lines].join("\r\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="abonnes-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
