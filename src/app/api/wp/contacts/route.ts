import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { addNote, ensureContact, splitName } from "@/lib/contacts";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";

const bodySchema = z.object({
  contacts: z
    .array(
      z.object({
        email: z.string().trim().toLowerCase().email().max(254),
        name: z.string().trim().max(200).optional().nullable(),
        /** Ex. « Demande du document : Guide ETS (12/10/2026) ». */
        note: z.string().trim().max(1000).optional().nullable(),
        tag: z.string().trim().toLowerCase().max(40).optional().nullable(),
      }),
    )
    .max(500),
});

/**
 * Appelé par le site WordPress pour créer des fiches contacts (ex. demandes de documents).
 * Ne les abonne jamais à la newsletter : il faut pour cela la double confirmation.
 */
export async function POST(req: Request) {
  const secret = req.headers.get("x-agbeci-secret") ?? "";
  if (!env.wpSharedSecret || !safeEqual(secret, env.wpSharedSecret)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Données invalides." }, { status: 400 });

  let created = 0;
  for (const c of parsed.data.contacts) {
    const tag = c.tag || "site";
    const r = await ensureContact(c.email, { ...splitName(c.name), tags: [tag], source: "site" });
    if (r.created) created += 1;
    if (c.note) {
      const [dup] = await getDb()
        .select({ id: schema.contactNotes.id })
        .from(schema.contactNotes)
        .where(and(eq(schema.contactNotes.contactId, r.id), eq(schema.contactNotes.body, c.note)));
      if (!dup) await addNote(r.id, c.note);
    }
  }
  return NextResponse.json({ ok: true, received: parsed.data.contacts.length, created });
}
