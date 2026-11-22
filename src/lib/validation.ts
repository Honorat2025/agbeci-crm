import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email({ message: "Adresse email invalide" }));

export const subscribeSchema = z.object({
  email: emailSchema,
  firstName: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((v) => (v ? v : undefined)),
  consent: z.literal(true, { message: "Le consentement est obligatoire" }),
  /** Page d'où vient l'inscription. */
  source: z.string().trim().max(500).optional(),
  /** Champ piège : doit rester vide (les robots le remplissent). */
  website: z.string().max(0).optional(),
});

export type SubscribeInput = z.infer<typeof subscribeSchema>;

export const newsletterSchema = z.object({
  subject: z.string().trim().min(1, "L'objet est obligatoire").max(200),
  preheader: z.string().trim().max(200).optional().transform((v) => v || null),
  bodyMarkdown: z.string().max(200_000),
});

export const wpNewPostSchema = z.object({
  title: z.string().trim().min(1).max(300),
  url: z.url(),
  excerpt: z.string().trim().max(2000).optional(),
});
