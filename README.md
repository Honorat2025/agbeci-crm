# Agbeci CRM

Application personnelle d'Honorat AGBECI : une messagerie de type CRM, indépendante de WordPress, qui envoie et reçoit par Gmail.

## Ce que fait cette première version

- **Inscription à la newsletter** depuis le site honoratagbeci.com (extension WordPress fournie) ou depuis la page `/inscription` de l'application.
- **Double confirmation** : chaque nouvel abonné reçoit un email et doit cliquer pour confirmer. C'est ce que demande la loi (RGPD) et c'est ce qui évite le spam.
- **Suivi des abonnés** : liste, filtres (confirmés, en attente, désinscrits), ajout manuel, export CSV.
- **Newsletters** : rédaction simple (Markdown), aperçu, envoi de test à soi-même, puis envoi à tous les abonnés confirmés.
- **Envoi par votre Gmail**, au rythme autorisé par Google (400 emails par 24 h par défaut), avec un lien de désinscription en un clic dans chaque email.
- **Nouvel article sur WordPress** : un brouillon de newsletter est préparé automatiquement. Rien ne part sans votre validation.
- **Connexion protégée** par mot de passe et code à deux étapes (application Google Authenticator ou équivalent).

Prochaines étapes prévues : import des contacts Gmail, puis prospection (clients, emploi, consultations et prestations en Afrique).

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
