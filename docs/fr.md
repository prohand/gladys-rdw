# RDW

Suivez vos véhicules néerlandais dans Gladys : **APK** (le contrôle technique
périodique), **assurance WAM** et **rappels ouverts**, lus dans le registre
public de la RDW, l'autorité néerlandaise des véhicules.

## Ce qu'il vous faut

- Gladys **5.1 ou plus récent**.
- Les **plaques d'immatriculation** de vos véhicules (plaques néerlandaises).
- Rien d'autre : le registre RDW est en données ouvertes, sans compte ni clé.

## Configuration

Ouvrez **Intégrations → RDW → Configuration**.

| Champ                        | Quoi saisir                                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Plaques                      | Vos plaques, séparées par des virgules : `AB-123-C, 12-XYZ-3`. Tirets, espaces et minuscules n'ont pas d'importance.                       |
| Rappel APK (jours)           | Combien de jours avant l'échéance de l'APK le véhicule apparaît « à faire » (30 par défaut).                                               |
| Lecture du registre (heures) | Heures entre deux lectures du registre (6 par défaut). Il change au plus une fois par jour.                                                |
| Jeton d'application          | Facultatif. Jeton gratuit sur [opendata.rdw.nl](https://opendata.rdw.nl/) qui lève la limite de requêtes. Inutile pour quelques véhicules. |

Enregistrez, puis cliquez sur **Tester la connexion** : le message indique
combien de véhicules le registre a trouvés, quelles plaques il ne connaît pas,
et ce qui n'était pas une plaque.

**Consulter une plaque** vérifie n'importe quelle plaque sans la suivre —
avant de l'ajouter, ou pour une voiture que vous comptez acheter.

## Appareils

Ouvrez **Découvrir** : chaque plaque est proposée comme un appareil, nommé
d'après le registre (`Volkswagen Golf (AB-123-C)`). Ajoutez ceux que vous
voulez. Chacun a :

| Fonction        | Valeur                                                                            |
| --------------- | --------------------------------------------------------------------------------- |
| Jours avant APK | Jours jusqu'à l'échéance de l'APK. `0` le dernier jour, négatif une fois expirée. |
| Échéance APK    | Le dernier jour de validité de l'APK, `AAAA-MM-JJ`.                               |
| Assuré (WAM)    | `1` quand le registre connaît une assurance au tiers WAM, `0` sinon.              |
| Rappel ouvert   | `1` quand un rappel constructeur reste à faire, `0` sinon.                        |

Une valeur que le registre ne donne pas (un cyclomoteur sans APK, par exemple)
reste vide : elle n'est jamais inventée.

Le badge de chaque appareil dit où en sont les données : **cloud** quand le
registre a répondu, **injoignable** quand il n'a pas répondu (les dernières
valeurs lues sont gardées), et un **point orange** quand le registre ne connaît
pas la plaque (vérifiez-la avec **Consulter une plaque**).

## Scènes et tableau de bord (Gladys 5.1)

### Déclencheurs

| Déclencheur                | Quand il se déclenche                                                                                                      | Variables                              |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| **APK à faire ou expirée** | L'APK entre dans la période de rappel (« bientôt à faire »), puis à nouveau quand elle expire. Une fois par date et étape. | plate, vehicle, expiry_date, days_left |
| **Rappel ouvert**          | Le registre indique un rappel qui n'y était pas.                                                                           | plate, vehicle                         |
| **Assurance terminée**     | Le registre n'indique plus d'assurance WAM pour un véhicule qui en avait une.                                              | plate, vehicle                         |

Chaque déclencheur peut être limité à un véhicule ; celui de l'APK aussi à une
étape (bientôt à faire, expirée). Dans les actions suivantes, lisez les détails
avec `{{triggerEvent.data.plate}}`, `{{triggerEvent.data.days_left}}`…

Les déclencheurs s'activent **une fois par changement**, pas à chaque lecture,
et une mise à jour ou un redémarrage ne les relance pas. Un véhicule déjà « à
faire » quand vous l'ajoutez déclenche le rappel APK tout de suite ; les
déclencheurs de rappel et d'assurance attendent un changement.

### Actions

| Action                       | Ce qu'elle fait                                  | Sorties                                                                                   |
| ---------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| **Actualiser les véhicules** | Lit le registre maintenant.                      | success, vehicles, alerts                                                                 |
| **Lire un véhicule**         | Donne à la scène les informations d'un véhicule. | found, plate, vehicle, apk_stage, apk_expiry, apk_days_left, insured, open_recall, alerts |

`apk_stage` vaut `ok`, `due_soon`, `expired` ou `unknown`. `alerts` compte ce
qui demande attention (APK à faire ou expirée, pas assuré, rappel ouvert).

### Widget

Ajoutez le widget **Véhicules RDW** à un tableau de bord : une carte par
véhicule, avec sa date d'APK et un badge montrant ce qui demande attention en
premier (APK expirée, non assuré, rappel ouvert, APK bientôt). Réglages :

- **Un seul véhicule** : affiche ce véhicule, avec ses jours avant APK en tuile
  en direct ;
- **Seulement ce qui demande attention** : masque les véhicules en règle.

Le bouton **Actualiser** lit le registre tout de suite.

### Exemple

« Me rappeler l'APK » : déclencheur **APK à faire ou expirée** (étape : bientôt
à faire) → action **Envoyer un message** : `APK de {{triggerEvent.data.vehicle}}
({{triggerEvent.data.plate}}) dans {{triggerEvent.data.days_left}} jours.`

## En cas de problème

- **« Cette plaque n'est pas dans le registre RDW »** : vérifiez la plaque avec
  **Consulter une plaque**. Seules les plaques néerlandaises sont dans le
  registre ; un véhicule exporté ou détruit peut en disparaître.
- **« Le registre RDW ne répond pas »** : le portail est en panne ou limite
  votre adresse. Les valeurs déjà lues sont gardées ; la lecture suivante
  réessaie. Ajoutez un jeton d'application si cela arrive souvent.
- Le registre est mis à jour une fois par jour : une nouvelle assurance ou une
  APK passée peut mettre un jour à apparaître.

## Vie privée

Les plaques sont envoyées uniquement à `opendata.rdw.nl`. L'intégration garde
le dernier état vu de chaque véhicule dans son propre stockage, pour ne
déclencher qu'une fois.
