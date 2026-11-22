import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { unsubscribe } from "@/lib/subscribers";

/** Désinscription « en un clic » déclenchée par Gmail ou Outlook (RFC 8058). */
export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("t") ?? "";
  await unsubscribe(token);
  return new Response("Désinscription enregistrée.", { status: 200 });
}

/** Un simple clic sur le lien mène à la page de confirmation. */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("t") ?? "";
  return NextResponse.redirect(`${env.appUrl}/desinscription?t=${encodeURIComponent(token)}`, 303);
}
