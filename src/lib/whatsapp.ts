/**
 * WhatsApp sans service externe : liens « wa.me » qui ouvrent la discussion
 * (application sur téléphone, WhatsApp Web ou application sur ordinateur), message déjà rédigé.
 */

/** Indicatifs des pays les plus fréquents dans les contacts d'Honorat (nom en minuscules, sans accents). */
const CODES: Record<string, string> = {
  france: "33", belgique: "32", suisse: "41", luxembourg: "352", canada: "1", "etats-unis": "1", usa: "1", "royaume-uni": "44",
  "cote d'ivoire": "225", "cote divoire": "225", senegal: "221", togo: "228", benin: "229", "burkina faso": "226", burkina: "226",
  mali: "223", niger: "227", guinee: "224", cameroun: "237", gabon: "241", congo: "242", "rd congo": "243", rdc: "243",
  "republique democratique du congo": "243", tchad: "235", centrafrique: "236", madagascar: "261", maroc: "212", algerie: "213",
  tunisie: "216", ghana: "233", nigeria: "234", mauritanie: "222", rwanda: "250", burundi: "257", haiti: "509",
};
/** Pays où le 0 initial d'un numéro national disparaît dans le format international. */
const TRUNK_ZERO = new Set(["33", "32", "41", "44", "212", "213", "233", "234", "250", "257"]);

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’]/g, "'").trim();

export function countryCode(country: string | null | undefined): string | null {
  if (!country) return null;
  return CODES[plain(country)] ?? null;
}

/**
 * Numéro international sans « + » (ex. « 33612345678 »), ou null si on ne peut pas le deviner.
 * « +225 07 12 34 56 78 », « 00225… », « 06 12 34 56 78 » (France par défaut) ou un numéro local avec le pays de la fiche.
 */
export function whatsappNumber(phone: string | null | undefined, country?: string | null): string | null {
  if (!phone) return null;
  const raw = phone.trim();
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1).replace(/\+/g, "");
  else if (digits.startsWith("00")) digits = digits.slice(2);
  else {
    digits = digits.replace(/\+/g, "");
    const code = countryCode(country) ?? (/^0[1-9]\d{8}$/.test(digits) ? "33" : null);
    if (!code) return null;
    if (digits.startsWith(code) && digits.length > code.length + 7) return valid(digits);
    if (TRUNK_ZERO.has(code) && digits.startsWith("0")) digits = digits.slice(1);
    digits = code + digits;
  }
  return valid(digits);
}

const valid = (d: string) => (/^[1-9]\d{7,14}$/.test(d) ? d : null);

export function whatsappLink(number: string, text?: string): string {
  return `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
