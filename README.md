# Agbeci CRM

Application personnelle d'Honorat AGBECI : une messagerie de type CRM, indépendante de WordPress, qui envoie et reçoit par Gmail.

## Ce que fait cette première version

- **Inscription à la newsletter** depuis le site honoratagbeci.com (extension WordPress fournie) ou depuis la page `/inscription` de l'application.
- **Double confirmation** : chaque nouvel abonné reçoit un email et doit cliquer pour confirmer. C'est ce que demande la loi (RGPD) et c'est ce qui évite le spam.
- **Suivi des abonnés** : liste, filtres (confirmés, en attente, désinscrits), ajout manuel, export CSV.
- **Newsletters** : rédaction simple (Markdown), aperçu, envoi de test à soi-même, puis envoi à tous les abonnés confirmés.
- **Envoi par votre Gmail**, au rythme autorisé par Google (400 emails par 24 h par défaut), avec un lien de désinscription en un clic dans chaque email.
- **Nouvel article sur WordPress** : un brouillon de newsletter est préparé automatiquement. Rien ne part sans votre validation.
- **Messagerie** : vos emails Gmail (12 derniers mois, puis au fil de l'eau, relevés chaque minute) apparaissent dans le CRM, rangés par conversation. Vous pouvez y répondre ou écrire un nouveau message : il part depuis votre Gmail et se retrouve dans vos « Envoyés ». Les images externes (souvent des traceurs) sont masquées tant que vous ne demandez pas à les voir. Rien n'est jamais supprimé dans Gmail.
- **Fiches contacts** : coordonnées, organisation, pays, étiquettes, notes, et l'historique des échanges avec chaque personne. Création en un clic depuis une conversation, suggestions (les personnes à qui vous écrivez), import d'un export Google Contacts (CSV). Une fiche n'abonne jamais à la newsletter.
- **Demandes de documents du site** : chaque nouvelle demande de document sur le site crée (ou complète) automatiquement une fiche avec l'étiquette « document » (extension WordPress 0.2.0, adresse `/api/wp/contacts` protégée par la clé partagée).
- **Prospection** : affaires (clients, consultations, prestations, emploi) suivies étape par étape, de « Piste » à « Gagnée » ou « Perdue », avec montant estimé (EUR, F CFA, USD).
- **Rappels** : relances datées, liées à un contact ou une affaire ; « À faire aujourd'hui » sur le tableau de bord, report d'un jour ou d'une semaine en un clic.
- **Envoi groupé personnalisé** : un message écrit une fois, envoyé à tous les contacts d'une étiquette, chacun à son nom (`{prenom}`, `{nom}`, `{organisation}`), depuis Gmail et dans la limite du quota quotidien. 200 destinataires maximum par envoi ; les désinscrits et les fiches exclues ne le reçoivent pas.
- **Connexion protégée** par mot de passe et code à deux étapes (application Google Authenticator ou équivalent).

Les trois étapes prévues (newsletter, messagerie et contacts, prospection) sont en place.

## Organisation du code

| Dossier | Contenu |
| --- | --- |
| `src/app` | Pages et routes de l'application (Next.js) |
| `src/lib` | Logique : abonnés, newsletters, file d'envoi, sécurité |
| `src/db` | Structure de la base de données (PostgreSQL) |
| `src/worker` | Programme qui envoie les emails en arrière-plan |
| `drizzle` | Scripts de mise à jour de la base |
| `wordpress-plugin` | Extension « Agbeci Newsletter » pour le site |
| `deploy` | Configuration du serveur (HTTPS, sauvegardes) |
| `docs` | Guides, dont l'installation sur le serveur |

## Installation sur le serveur

Voir [docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md).

## Pour développer

```bash
cp .env.example .env      # puis remplir, avec MAIL_TRANSPORT=log
npm install
npm run db:migrate
npm run dev               # le site sur http://localhost:3000
npm run worker            # l'envoi des emails, dans un autre terminal
npm test                  # tests (TEST_DATABASE_URL pour les tests avec base)
```
