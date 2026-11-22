=== Agbeci Newsletter ===
Requires at least: 6.0
Requires PHP: 8.0
Stable tag: 0.1.0

Formulaire d'inscription à la newsletter relié à l'application Agbeci CRM.

== Installation ==
1. Extensions > Ajouter > Téléverser : choisir agbeci-newsletter.zip, puis Activer.
2. Réglages > Agbeci Newsletter : indiquer l'adresse du CRM et la clé secrète.
3. Le formulaire apparaît à la fin de chaque article. Ailleurs, utiliser le code court [agbeci_newsletter].

== Fonctionnement ==
* Les inscriptions partent directement vers le CRM (double confirmation par email).
* Aucune donnée d'abonné n'est stockée dans WordPress.
* À chaque nouvel article publié, le CRM prépare un brouillon de newsletter. Rien n'est envoyé sans validation dans le CRM.
