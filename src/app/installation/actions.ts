"use server";

import { redirect } from "next/navigation";
import { count } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { encryptSecret, hashPassword, newTotpSecret, passwordProblem, verifyTotp } from "@/lib/auth";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { getSession } from "@/lib/session";
import { emailSchema } from "@/lib/validation";

export type FormState = { error?: string };

async function adminExists() {
  const [row] = await getDb().select({ n: count() }).from(schema.admins);
  return Number(row?.n ?? 0) > 0;
}

export async function startSetup(_: FormState, form: FormData): Promise<FormState> {
  if (await adminExists()) return { error: "L'application est déjà installée." };
  const token = String(form.get("token") ?? "");
  if (!env.setupToken || !safeEqual(token, env.setupToken)) return { error: "Code d'installation incorrect." };

  const email = emailSchema.safeParse(form.get("email"));
  if (!email.success) return { error: "Adresse email invalide." };
  const password = String(form.get("password") ?? "");
  const problem = passwordProblem(password);
  if (problem) return { error: problem };
  if (password !== String(form.get("password2") ?? "")) return { error: "Les deux mots de passe sont différents." };

  const session = await getSession();
  session.pendingSetup = {
    email: email.data,
    passwordHash: await hashPassword(password),
    totpSecret: newTotpSecret(),
  };
  await session.save();
  redirect("/installation?etape=2");
}

export async function finishSetup(_: FormState, form: FormData): Promise<FormState> {
  const session = await getSession();
  const pending = session.pendingSetup;
  if (!pending) return { error: "Recommencez l'installation depuis le début." };
  if (await adminExists()) return { error: "L'application est déjà installée." };
  if (!verifyTotp(String(form.get("code") ?? ""), pending.totpSecret)) {
    return { error: "Code incorrect. Vérifiez l'heure de votre téléphone et réessayez." };
  }

  const [admin] = await getDb()
    .insert(schema.admins)
    .values({
      email: pending.email,
      passwordHash: pending.passwordHash,
      totpSecretEnc: encryptSecret(pending.totpSecret),
    })
    .returning({ id: schema.admins.id });

  session.pendingSetup = undefined;
  session.adminId = admin!.id;
  session.mfaPassed = true;
  await session.save();
  redirect("/app");
}
