# Mise en ligne de l'application

Ce guide décrit l'installation sur un serveur VPS (par exemple Hostinger KVM 1, Ubuntu 24.04, avec Docker).
Claude peut faire ces étapes pour vous : vous fournissez seulement les accès et les validations.

## 1. Ce qu'il faut avant de commencer

1. **Un serveur VPS** avec Docker (modèle « Ubuntu 24.04 avec Docker » chez Hostinger).
2. **Le sous-domaine** `crm.honoratagbeci.com` : dans la zone DNS du domaine, un enregistrement `A` nommé `crm` qui pointe vers l'adresse IP du serveur.
3. **Gmail prêt à envoyer** :
   - activer la validation en deux étapes sur le compte Google ;
   - créer un « mot de passe d'application » (myaccount.google.com > Sécurité > Mots de passe des applications) ;
   - ce mot de passe de 16 lettres va dans `GMAIL_APP_PASSWORD`. Il ne donne pas accès au compte Google lui-même et peut être révoqué à tout moment.
4. **Une application d'authentification** sur le téléphone (Google Authenticator, Microsoft Authenticator…).

## 2. Installer

Sur le serveur :

```bash
git clone https://github.com/Honorat2025/agbeci-crm.git /opt/agbeci-crm
cd /opt/agbeci-crm
cp .env.example .env
nano .env        # remplir chaque valeur (voir les commentaires du fichier)
docker compose up -d --build
```

Pour générer les secrets : `openssl rand -hex 32` (une fois pour `SESSION_SECRET`, une fois pour `ENCRYPTION_KEY`, une fois pour `WP_SHARED_SECRET`, une fois pour `POSTGRES_PASSWORD`).

Le certificat HTTPS est obtenu automatiquement en une minute environ.

## 3. Créer votre compte

1. Ouvrir `https://crm.honoratagbeci.com/installation`.
2. Saisir le code `SETUP_TOKEN` choisi dans `.env`, votre email et un mot de passe d'au moins 12 caractères.
3. Scanner le QR code avec l'application d'authentification, puis saisir le code à 6 chiffres.

Cette page ne fonctionne qu'une seule fois : dès que le compte existe, elle est désactivée.

## 4. Relier le site WordPress

1. Compresser le dossier `wordpress-plugin/agbeci-newsletter` en `agbeci-newsletter.zip`.
2. Sur WordPress : Extensions > Ajouter > Téléverser, puis Activer.
3. Réglages > Agbeci Newsletter :
   - Adresse du CRM : `https://crm.honoratagbeci.com`
   - Clé secrète : la valeur de `WP_SHARED_SECRET`.
4. Le formulaire apparaît sous chaque article. Pour l'ajouter ailleurs, utiliser le code court `[agbeci_newsletter]`.

## 5. Sauvegardes

Le service `backup` fait chaque nuit, après 3 h (heure de Paris), une copie complète de la base (`pg_dump`, format compressé) dans le volume `backups`, et garde les 14 derniers jours. La liste apparaît dans **Réglages > Sauvegardes**, d'où chaque fichier se télécharge. Un avertissement s'affiche si la dernière copie a plus de 36 heures.

Ces copies restent sur le serveur : en télécharger une de temps en temps (par exemple une fois par mois, dans Google Drive) protège aussi contre la perte du serveur. Les sauvegardes du VPS proposées par Hostinger sont un complément utile.

Pour restaurer une sauvegarde (à faire par Claude ou un technicien, jamais sans l'accord d'Honorat) :

```bash
# dans le conteneur backup, qui a déjà les accès à la base
docker compose exec backup pg_restore --clean --if-exists -d crm /backups/crm-AAAA-MM-JJ.dump
```

Pour un fichier téléchargé sur l'ordinateur, le copier d'abord dans le conteneur (`docker compose cp crm-AAAA-MM-JJ.dump backup:/tmp/`) puis lancer la même commande avec `/tmp/crm-AAAA-MM-JJ.dump`.

## 6. Mettre à jour

```bash
cd /opt/agbeci-crm
git pull
docker compose up -d --build
```

La base de données se met à jour toute seule au démarrage.

## En cas de souci

- Voir ce qui se passe : `docker compose logs -f app worker`
- Vérifier que le site répond : `https://crm.honoratagbeci.com/api/health` doit afficher `{"ok":true}`.
- Emails non partis : la page d'accueil de l'application indique combien sont en attente ou en échec ; la raison exacte apparaît dans `docker compose logs worker`.
