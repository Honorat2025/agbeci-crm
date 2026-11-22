# Agbeci CRM : conventions

- Propriétaire : Honorat AGBECI, francophone, non développeur. Interface, emails, messages d'erreur et documentation **en français**.
- Ne jamais demander à Honorat d'utiliser git ou la ligne de commande : on le guide pas à pas ou on le fait pour lui.
- Principe du projet : ne dépendre d'aucun service d'emailing externe. L'envoi passe par Gmail (SMTP + mot de passe d'application), via la file `outbox` et le worker.
- Rien ne part en production et rien ne change sur le site WordPress sans l'accord explicite d'Honorat.

## Technique

- Next.js 15 (App Router, server actions), React 19, TypeScript strict, PostgreSQL + Drizzle ORM.
- Versions de dépendances exactes (pas de `^`), au moins deux semaines d'ancienneté.
- Tout email passe par la table `outbox` (jamais d'envoi direct depuis une requête web) ; le worker respecte `DAILY_SEND_LIMIT`.
- Newsletter : double confirmation obligatoire, en-têtes `List-Unsubscribe` sur tout email aux abonnés, jeton de confirmation stocké haché.
- Formulaires React : champs contrôlés (`useState`), car React 19 vide les champs non contrôlés après une server action.
- Après modification du schéma : `npm run db:generate` puis commiter le dossier `drizzle`.

## Vérifications

- `npm run typecheck`, `npm test` (les tests avec base demandent `TEST_DATABASE_URL`), `npm run build`.
