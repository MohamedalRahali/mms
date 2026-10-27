# MMS : plateforme de diffusion des actualités de la veille

Interface web qui diffuse, au fil de l'eau, les actualités produites par :

- la **veille radio Mosaïque FM** (`../mosaique-radio`) ;
- la **veille des sources libyennes** (fichiers JSON déposés dans `data/libye`).

Même pile et même charte que NewsRadar : React + Vite pour l'interface, Express pour l'API.

## Ce que fait l'interface

Interface en arabe par défaut (bascule français), sur le modèle de NewsRadar / NewsBoard.

- **Tableaux de bord composés par le client** : bouton « تعديل اللوحة » dans la barre noire, puis
  « إضافة رسم بياني », « حفظ » et « إلغاء ». Les widgets se déplacent par leur en-tête et se
  redimensionnent par le coin, sur une grille de 12 colonnes ; chaque widget a ses boutons
  modifier, dupliquer et supprimer. Types : liste d'actualités, barres, colonnes, camembert,
  courbe, chiffre clé, tableau, nuage de mots, avec source, période et répartition au choix.
  Plusieurs tableaux par onglets ; tout est enregistré dans `data/dashboards.json`, commun à tous
  les postes.
- **NewsBoard / recherche avancée** : fil des actualités, recherche et filtres.
- **Analyse** : volume par jour, thèmes, sources, canaux.
- **Analyse intelligente** : synthèse en arabe rédigée par Claude (`claude-opus-5-5`), à la demande.
  Clé `ANTHROPIC_API_KEY` dans `.env`, ou reprise du `.env` de `mosaique-radio`.
- **Revues de presse** : rapport du jour, à imprimer ou enregistrer en PDF.
- **Veille programmée (الرصد)**, sur le principe de NewsRadar : zone surveillée (Libye ou Tunisie,
  ou vide), thèmes à cocher avec leurs mots arabes modifiables, source, période (ou رصد دائم) et
  destinataires. Chaque thème coché devient une règle « (zone) AND (mots du thème) » ; la
  comparaison tolère les variantes arabes (hamza, ى/ي, ة/ه, diacritiques). Les nouvelles actualités
  sont vérifiées à chaque mise à jour des données (et au moins toutes les 5 min) ; celles qui
  correspondent partent par e-mail une seule fois (SMTP_* dans `.env`). Le filtre « الرصد » de
  الأخبار et le lien `/?watch=<id>` de l'e-mail affichent les résultats. Stockage : `data/watches.json`.
  Les actualités d'exemple (MMS_DEMO) ne déclenchent jamais d'e-mail.
- **Alertes** (mots-clés suivis) et **favoris** (cœur sur chaque actualité), gardés dans le navigateur.
- **Barre noire** : notifications des nouvelles actualités, favoris, mode présentation plein écran,
  historique des jours, menu, annonces de la plateforme.
- **Bandeau orange** « تحديثات متاحة » quand de nouvelles actualités arrivent, avec rechargement
  automatique après 15 s.
- Menu latéral repliable, centre d'aide, page d'administration (état des sources), onglet
  « استطلاع » dont les avis sont ajoutés à `data/feedback.jsonl`.

## Lancer en local (Windows)

```bash
cd mms
copy .env.example .env      # puis ajuster si besoin
npm install
npm run dev                 # interface : http://localhost:5174  (API : 8788)
```

En production : `npm run start:prod` compile l'interface et sert tout sur http://localhost:8788.

Tant que les veilles n'ont rien produit, `MMS_DEMO=1` affiche des actualités d'exemple,
signalées par un bandeau jaune et une étiquette « Exemple ». Mettre `MMS_DEMO=0` ensuite.

## D'où viennent les données

Le serveur relit les dossiers toutes les 30 secondes ; il suffit que les veilles y écrivent.

**Mosaïque FM** (`MOSAIQUE_DATA_DIR`, par défaut `../mosaique-radio/data`) :
- `AAAA-MM-JJ/actualites.json` : rapport consolidé de la nuit (`python mosaique.py daily`) ;
- à défaut, `AAAA-MM-JJ/news/HH.json` : extraction heure par heure de la journée en cours,
  affichée avec l'étiquette « Aujourd'hui, non consolidé ».

**Veille Libye** (`LIBYE_DATA_DIR`, par défaut `./data/libye`) : chaque fichier `.json`
contient une liste d'actualités (ou `{ "actualites": [...] }`) au format :

```json
[
  {
    "titre": "Titre de l'actualité",
    "resume": "Résumé en une ou deux phrases",
    "categorie": "économie",
    "date": "2026-10-21T08:00:00+02:00",
    "source": "Nom du média ou du compte",
    "canal": "site",
    "url": "https://...",
    "langue": "arabe"
  }
]
```

Canaux reconnus : `site`, `presse`, `tv`, `radio`, `x`, `facebook`, `instagram`, `linkedin`,
`youtube`, `tiktok`, `telegram`, `bluesky`, `reddit`, `mastodon`, `podcast`, `forum`.

Champs facultatifs des types de médias (sélecteur « الوسائط / Media » de la recherche avancée) :

| Champ | Contenu |
|---|---|
| `media` | `article`, `broadcast`, `podcast`, `blog`, `comment`, `forum` ou `social`. Absent (anciens fichiers) : déduit du canal — `tv`, `radio`, `youtube` → broadcast ; réseaux → social ; `reddit` → forum ; sinon article |
| `sous_type` | `tv`, `radio`, `youtube`… (sous-filtre des émissions) |
| `ref` | identifiant stable de la fiche |
| `media_url`, `transcription` | audio ou vidéo d'origine et texte transcrit (affiché dépliable, cherché par la recherche) |
| `auteur` | auteur d'un commentaire ou d'un message |
| `parent` | `{id, url, titre}` : publication commentée (`id` = son `ref`) ou premier message du sujet |
| `fil` | `{forum, sujet, sujet_url, message_id, reponse_a}` : place du message dans le forum |

Les commentaires ne sont listés que quand on choisit « Commentaires » ; ailleurs ils s'affichent sous leur
publication (« N تعليقات »). Les réponses de forum s'affichent en retrait sous leur message.
`/api/news?media=blog` (et `&sub=tv` pour les émissions) filtre ; `/api/news/facets` donne les comptes par média.

## Radar intelligent (الرادار الذكي)

Page « الرادار الذكي » du menu, calculée en mémoire sur les fiches chargées, sans appel à une IA (instantané, gratuit) :

- **Alertes intelligentes** classées par gravité (حرج / للمتابعة / معلومة) : pics d'activité, sujets nouveaux repris par au moins 3 sources, montée du négatif autour d'un acteur, histoire reprise par beaucoup de médias. Un clic ouvre les actualités correspondantes. Les alertes critiques s'affichent aussi en tête du tableau de bord.
- **Sujets émergents** : mots, expressions et entités dont la fréquence explose sur 6 h, 24 h ou 3 jours par rapport aux 7 jours d'avant (au moins 3 fiches et 2 sources), avec courbe sur 8 jours et tonalité.
- **Histoires multi-sources** : les fiches qui racontent le même événement sont regroupées ; on voit combien de médias l'ont reprise et qui l'a publiée en premier.
- **Baromètre du sentiment** : indice net de −100 à +100, jour par jour, par acteur et par source. Quand la veille ne fournit pas la tonalité, elle est estimée par un lexique arabe / français / anglais (la part estimée est affichée).
- **Envoi automatique** des alertes critiques par Telegram (TELEGRAM_*) et/ou e-mail (`MMS_RADAR_ALERTS_TO`, via SMTP_*), une seule fois chacune, vérifié toutes les 10 min : activer avec `MMS_RADAR_ALERTS=1`. Les exemples (MMS_DEMO) ne déclenchent rien.
- **Widgets** « المواضيع الصاعدة », « أخبار متناقلة », « تنبيهات ذكية », « مؤشر المزاج » ajoutables aux tableaux de bord composés.

API : `GET /api/radar/alerts`, `/api/radar/emerging?hours=24`, `/api/radar/stories?hours=48`, `/api/radar/sentiment?days=14` (paramètre `flux` facultatif), réservées aux personnes connectées, gardées 60 s en cache.

**Recherche multilingue** : un mot trouve aussi ses équivalents arabes, anglais et français pour les villes, champs pétroliers, institutions et responsables libyens (Tripoli ↔ طرابلس, NOC ↔ المؤسسة الوطنية للنفط, Dbeibah ↔ الدبيبة, délestage ↔ طرح الأحمال…), et les formes arabes avec préfixe ou pluriel régulier (« طرابلس » trouve « وطرابلس »). Les sigles courts (NOC, GNU, CBL) doivent être des mots entiers ; une « expression entre guillemets » reste exacte. Liste : `SYNONYMS` dans `server/query.js`.

Heures et jours sont affichés à l'heure de Tripoli (`Africa/Tripoli`).

Tests : `node --test tests/*.test.js`.

## Photos des actualités

Chaque carte affiche la photo de l'article, comme NewsRadar :

- l'image fournie par la veille (champ `image`), sinon l'image de partage de la page de l'article (`og:image`, `twitter:image`…) ;
- pour la radio, qui n'a pas de lien, l'article du site Mosaïque FM dont le titre correspond (pages listées dans `MOSAIQUE_SITE`) ;
- à défaut, une image de repli aux couleurs du thème, avec son pictogramme et la source.

Les pages sont lues par le serveur (au plus 3 à la fois) et le résultat est gardé dans `data/images.json`. Le navigateur charge les images via `/api/img/<clé>`, réservé aux personnes connectées, et seules les images trouvées ainsi sont relayées (pas d'adresse interne ni locale).

## Connexion et comptes

L'accès aux pages et à toute l'API `/api` exige une connexion. On se connecte avec l'adresse e-mail ou le nom d'utilisateur (majuscules indifférentes).

- Les comptes sont dans `data/users.json`. Ce fichier ne contient que des empreintes scrypt (sel + hash), jamais de mot de passe en clair. Il est exclu du dépôt par `.gitignore`.
- La session est un cookie HttpOnly `mms_session` valable 12 h, ou 30 jours si « تذكرني » est coché. Les sessions sont gardées dans `data/sessions.json`.
- Après 5 échecs pour une même adresse IP et un même identifiant, la connexion est bloquée 15 minutes.

Gérer les comptes depuis le dossier du projet :

```
node server/users.js list
node server/users.js add prenom.nom@npdc.gov.ly "Nom affiché"   (le mot de passe est demandé au clavier)
node server/users.js remove prenom.nom@npdc.gov.ly
```

Routes : `POST /api/auth/login` (`{login, password, remember}`), `POST /api/auth/logout`, `GET /api/auth/me`.

## Mise en ligne sur le VPS OVH

Serveur : `vps-fc0ca6c9.vps.ovh.ca` (15.235.103.226), Ubuntu 26.04, utilisateur `ubuntu`.

1. Ouvrir le lien « mot de passe » de l'e-mail OVH et noter le mot de passe (ne pas l'envoyer par chat).
2. Double-cliquer `envoyer-vps.bat`. Il prépare une archive du projet, l'envoie sur le VPS et lance `deploy/install-vps.sh`. Le mot de passe est demandé 2 ou 3 fois ; à la toute première connexion, taper `yes`.
3. Ouvrir https://vps-fc0ca6c9.vps.ovh.ca et se connecter avec un compte NPDC.

Le script installe Node.js, nginx (HTTPS Let's Encrypt, redirection HTTP → HTTPS), le pare-feu (SSH, 80, 443) et le service `mms`, qui redémarre tout seul. Le site écoute seulement sur 127.0.0.1 ; nginx est la seule porte d'entrée.

Pour une mise à jour, relancer `envoyer-vps.bat` : le code est remplacé, mais les données du serveur (comptes, tableaux de bord, veilles, `.env`) sont conservées.

Sur le serveur (`ssh ubuntu@15.235.103.226`) :

```
sudo systemctl status mms          # état
sudo journalctl -u mms -n 50       # journal
sudo nano /opt/mms/.env            # réglages (clé Claude, SMTP, MMS_DEMO…), puis : sudo systemctl restart mms
sudo -u mms node /opt/mms/server/users.js add prenom.nom@npdc.gov.ly "Nom"
```

## API

| Route | Rôle |
|---|---|
| `GET /api/news?q=&days=&flux=&category=&channel=&lang=&page=&size=` | fil paginé |
| `GET /api/news/facets` | valeurs disponibles pour les filtres |
| `GET /api/news/stats?days=&flux=` | statistiques |
| `GET /api/report?day=AAAA-MM-JJ&flux=` | rapport d'une journée |
| `GET /api/health` | état des sources, de l'analyse intelligente et des données d'exemple |
| `GET /api/ai/analysis?days=1\|7\|30&flux=` | dernière analyse intelligente en mémoire |
| `POST /api/ai/analysis?days=&flux=` | lance l'analyse avec Claude |
| `GET /api/dashboards` / `PUT /api/dashboards` | tableaux de bord enregistrés `{ boards }` |
| `GET /api/watches`, `POST /api/watches`, `PATCH /api/watches/:id`, `DELETE /api/watches/:id` | veille programmée |
| `GET /api/news/watches` · `GET /api/news?watch=<id>` | menu « الرصد » et actualités d'une veille |
| `POST /api/feedback` | enregistre un avis `{ rating, comment }` |

## Prochaines étapes possibles

- Connexion par compte (reprendre l'authentification de NewsRadar).
- Envoi du rapport du jour par e-mail, comme les veilles programmées de NewsRadar.
- Déploiement sur le VPS OVH derrière nginx, à côté de NewsRadar.
