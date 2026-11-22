import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { draftFromWordPressPost } from "@/lib/newsletters";
import { wpNewPostSchema } from "@/lib/validation";

/**
 * Appelé par l'extension WordPress quand un article est publié.
 * Crée un brouillon de newsletter : rien ne part sans relecture.
 */
export async function POST(req: Request) {
  const secret = req.headers.get("x-agbeci-secret") ?? "";
  if (!env.wpSharedSecret || !safeEqual(secret, env.wpSharedSecret)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const parsed = wpNewPostSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Données invalides." }, { status: 400 });
  const n = await draftFromWordPressPost(parsed.data);
  return NextResponse.json({ ok: true, newsletterId: n.id });
}
