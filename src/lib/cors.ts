import { env } from "./env";

/** En-têtes CORS : seul le site WordPress (ALLOWED_ORIGINS) peut appeler l'API publique. */
export function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && env.allowedOrigins.includes(origin.replace(/\/$/, ""));
  return allowed
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
        Vary: "Origin",
      }
    : { Vary: "Origin" };
}
