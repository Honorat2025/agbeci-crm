import { redirect } from "next/navigation";
import { getSession } from "./session";

/** À appeler en tête de chaque page et action réservée à l'administrateur. */
export async function requireAdmin(): Promise<number> {
  const s = await getSession();
  if (!s.adminId || !s.mfaPassed) redirect("/connexion");
  return s.adminId;
}
