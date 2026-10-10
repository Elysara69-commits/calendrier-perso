# Calendrier Perso — intégration Home Assistant (v2.0.1)

Transposition de l'add-on « Calendrier Perso » en **intégration personnalisée** : un calendrier professionnel dans la barre latérale, des rappels multi-canaux, et une vraie entité `calendar` utilisable dans les automatisations.

## Installation
1. Copie le dossier `custom_components/calendrier_perso` dans `/config/custom_components/`.
2. Redémarre Home Assistant.
3. Paramètres → Appareils et services → Ajouter une intégration → **Calendrier Perso** (aucun paramètre).
4. Le menu **Calendrier** apparaît dans la barre latérale (rafraîchis le navigateur avec Ctrl+F5 si besoin).
5. Tu peux ensuite désinstaller l'ancien add-on (voir « Reprise des données »).

## Fonctions du calendrier
- Vues Jour, Semaine, Mois, Année, Agenda ; mini-calendrier, numéros de semaine, week-end masquable, jours fériés français, ligne de l'heure courante, heures de travail.
- Événements : titre, calendriers colorés, journée entière / multi-jours, lieu, lien, description, importance (4 niveaux), statut (confirmé / provisoire / annulé), disponibilité (occupé / libre).
- Répétitions : quotidienne, hebdomadaire (jours au choix), mensuelle (le 12, le 2e lundi, dernier jour), annuelle ; intervalle ; fin jamais / à une date / après N fois.
- Modification ou suppression d'une série : **cet événement**, **celui-ci et les suivants**, ou **toute la série**.
- Glisser-déposer pour déplacer, poignée du bas pour changer la durée, clic sur un créneau pour créer.
- Plusieurs rappels par événement (minutes, heures, jours, semaines avant), canaux au choix par événement.
- Recherche, import / export `.ics` (rappels, répétitions et exceptions inclus), raccourcis clavier (J S M Y A T N ← → /).

## Réglages (bouton ⚙)
- **Notifications** : Home Assistant notify (liste des `notify.*`, dont mobile_app), Alexa (appareils `notify.alexa_media_*`, mode tts/announce, heures silencieuses), Discord (webhook, nom, mention), Telegram (token, chat ID avec bouton de détection). Bouton **Tester** sur chaque canal, avant même d'enregistrer.
- **Rappels** : rappels et canaux par défaut, heure des rappels « journée entière ».
- **Apparence** (par navigateur) : thème Home Assistant (avec choix d'un thème de `config/themes`), clair, sombre, **cyberpunk néon** ; couleurs de fond, de texte, d'accent ; image de fond avec voile.
- **Calendriers** : créer, renommer, recolorer, supprimer.

## Entités, services, événements
- `calendar.calendrier_perso`, `sensor.calendrier_prochain_evenement`, `sensor.calendrier_evenements_aujourd_hui`.
- Services : `calendrier_perso.add_event`, `delete_event`, `test_notification`, `import_sqlite`.
- Événement du bus `calendrier_perso_reminder` à chaque rappel envoyé (utilisable dans une automatisation).

## Reprise des données de l'add-on
Copie `calendar.db` (dossier `/data` de l'add-on) vers `/config/calendar.db`, puis Réglages → Données → Importer, ou appelle le service `calendrier_perso.import_sqlite`.

## Notes
- Les données sont dans `/config/.storage/calendrier_perso.data`. Les secrets (webhook, token) y sont stockés et ne sont jamais renvoyés au navigateur.
- Seuls les administrateurs modifient les réglages de notification ; tous les utilisateurs utilisent le calendrier.
- Les heures sont celles du fuseau de Home Assistant.
