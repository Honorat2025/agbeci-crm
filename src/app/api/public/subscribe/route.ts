import { NextResponse } from "next/server";
import { corsHeaders } from "@/lib/cors";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { subscribe } from "@/lib/subscribers";
import { subscribeSchema } from "@/lib/validation";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

/**
 * Inscription à la newsletter depuis le site (extension WordPress) ou la page /inscription.
 * Corps JSON : { email, firstName?, consent: true, source?, website? }
 */
export async function POST(req: Request) {
  const headers = corsHeaders(req.headers.get("origin"));
  const ip = clientIp(req.headers);
  if (!rateLimit(`subscribe:${ip}`, 5, 60 * 60_000)) {
    return NextResponse.json({ ok: false, error: "Trop de tentatives, réessayez plus tard." }, { status: 429, headers });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Requête invalide." }, { status: 400, headers });
  }

  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) {
    const honeypot = parsed.error.issues.some((i) => i.path[0] === "website");
    if (honeypot) {
      // Robot détecté : on fait comme si tout allait bien, sans rien enregistrer.
      return NextResponse.json({ ok: true, message: "Merci ! Vérifiez votre boîte mail." }, { headers });
    }
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Formulaire invalide." },
      { status: 400, headers },
    );
  }

  const source = parsed.data.source || req.headers.get("referer") || "inconnue";
  await subscribe(parsed.data, { ip, source: `formulaire : ${source}`.slice(0, 500) });
  // Même réponse que l'adresse soit nouvelle ou déjà inscrite.
  return NextResponse.json(
    { ok: true, message: "Merci ! Vérifiez votre boîte mail pour confirmer votre inscription." },
    { headers },
  );
}
