import bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import { decrypt, encrypt } from "./crypto";
import { env } from "./env";

authenticator.options = { window: 1 };

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function passwordProblem(password: string): string | null {
  if (password.length < 12) return "Le mot de passe doit faire au moins 12 caractères.";
  return null;
}

export function newTotpSecret(): string {
  return authenticator.generateSecret();
}

export function totpUri(email: string, secret: string): string {
  return authenticator.keyuri(email, "Agbeci CRM", secret);
}

export function verifyTotp(code: string, secret: string): boolean {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  return authenticator.check(clean, secret);
}

export function encryptSecret(secret: string): string {
  return encrypt(secret, env.encryptionKey);
}

export function decryptSecret(payload: string): string {
  return decrypt(payload, env.encryptionKey);
}
