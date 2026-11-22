import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { env } from "./env";

export type SessionData = {
  adminId?: number;
  /** true une fois le code 2FA vérifié. */
  mfaPassed?: boolean;
  /** Mot de passe vérifié, en attente du code 2FA. */
  pendingAdminId?: number;
  /** Installation en cours : compte prêt, en attente de la vérification du code 2FA. */
  pendingSetup?: { email: string; passwordHash: string; totpSecret: string };
};

export function sessionOptions(): SessionOptions {
  return {
    password: env.sessionSecret,
    cookieName: "agbeci_crm",
    ttl: 60 * 60 * 24 * 14,
    cookieOptions: {
      httpOnly: true,
      secure: env.appUrl.startsWith("https://"),
      sameSite: "lax",
      path: "/",
    },
  };
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions());
}

export async function isLoggedIn(): Promise<boolean> {
  const s = await getSession();
  return Boolean(s.adminId && s.mfaPassed);
}
