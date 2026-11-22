"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { decryptSecret, verifyPassword, verifyTotp } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { getSession } from "@/lib/session";

export type LoginState = { error?: string };

const TOO_MANY = "Trop de tentatives. Réessayez dans 15 minutes.";

export async function loginPassword(_: LoginState, form: FormData): Promise<LoginState> {
  const ip = clientIp(await headers());
  if (!rateLimit(`login:${ip}`, 10, 15 * 60_000)) return { error: TOO_MANY };

  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const [admin] = await getDb().select().from(schema.admins).where(eq(schema.admins.email, email));
  const ok = admin ? await verifyPassword(password, admin.passwordHash) : false;
  if (!admin || !ok) return { error: "Email ou mot de passe incorrect." };

  const session = await getSession();
  session.pendingAdminId = admin.id;
  session.adminId = undefined;
  session.mfaPassed = false;
  await session.save();
  redirect("/connexion?etape=code");
}

export async function loginCode(_: LoginState, form: FormData): Promise<LoginState> {
  const ip = clientIp(await headers());
  if (!rateLimit(`code:${ip}`, 10, 15 * 60_000)) return { error: TOO_MANY };

  const session = await getSession();
  if (!session.pendingAdminId) redirect("/connexion");
  const [admin] = await getDb().select().from(schema.admins).where(eq(schema.admins.id, session.pendingAdminId));
  if (!admin) redirect("/connexion");

  if (!verifyTotp(String(form.get("code") ?? ""), decryptSecret(admin.totpSecretEnc))) {
    return { error: "Code incorrect." };
  }
  session.pendingAdminId = undefined;
  session.adminId = admin.id;
  session.mfaPassed = true;
  await session.save();
  redirect("/app");
}

