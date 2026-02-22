Original prompt: fais ça ? Utilise plusieurs boucles par contexte (ex: 3-5 pistes “exploration espace”). Ajoute une règle anti-répétition (ne jamais rejouer les 1-2 dernières pistes). Découpe en stems (drone, basse, percu) et active/désactive selon l’action. Insère des mini-variations toutes les 8/16 mesures (fill, filtre, break, silence court). mais on est toujours en combat actuellement, pas d'exploration

- [done] Implémenter un pool de boucles combat (rotation automatique entre scores).
- [done] Appliquer anti-répétition stricte sur les 2 dernières boucles.
- [done] Lier les stems (drone/bass/percu) à l’action de combat, pas seulement à la progression.
- [done] Ajouter des micro-variations 8/16 mesures (fill + break + filtre).
- [done] Tester en jeu via client Playwright et vérifier screenshots + erreurs console.

## Update 1
- Implémenté la rotation automatique des boucles en contexte combat (`barsPerLoop=16`) avec anti-répétition sur les 2 derniers morceaux.
- Ajouté une énergie d’action (`actionEnergy`) alimentée par les tirs/impacts/explosions pour piloter les stems.
- Les stems `drone`, `bass`, `percussion` sont maintenant dynamiques via `currentStemMix()`.
- Ajouté des variations régulières:
  - tous les 8 bars: fill batterie + sweep filtre
  - tous les 16 bars: mini break (silence court sur 3 steps) + kick de reprise
- Vérification syntaxe OK: `node --check src/audio/audio.js`.
- Reste à faire: validation visuelle/console en exécution réelle via Playwright.

## Update 2
- Validation runtime effectuée via fallback Playwright custom (le client du skill `develop-web-game` était bloqué par résolution ESM de `playwright`).
- Résultat: `errors: []` (aucune erreur console/page).
- Artefacts visuels inspectés:
  - `/tmp/grainfall-audio-test/shot-0.png`
  - `/tmp/grainfall-audio-test/shot-1.png`
  - `/tmp/grainfall-audio-test/shot-2.png`
  - `/tmp/grainfall-audio-test/shot-3.png`
- État UI confirmé en fin de run: `MUSIQUE: ON`.
- TODO restant: aucun blocant identifié pour cette demande.

## Update 3
- Ajout d'un mini onboarding clavier desktop dans le menu principal (`desktopOnboarding`), avec rappel des touches:
  - `ZQSD/WASD/Flèches` (déplacement)
  - `Espace/Shift` (dash)
  - `P` (pause)
  - `R` (recommencer)
- Ajout d'un bouton `Compris` pour fermer l'encart.
- Mémorisation du dismiss via `localStorage` (`gf_desktop_onboarding_v1`), affichage uniquement sur profil desktop (`min-width:720`, hover + pointer fin).
- Styles dédiés ajoutés, et masquage sur mobile / desktop de faible hauteur pour éviter de surcharger le panel.
- À faire: run Playwright + vérification screenshots/console après cette modif.

## Update 4
- Validation technique effectuée via build: `npm run build` OK (sans erreur).
- Le run Playwright a été explicitement abandonné à la demande utilisateur ("pas besoin de Playwright").
- TODO restant: aucun pour la demande onboarding desktop.

## Update 3
- Implémenté un MVP de phase exploration toutes les 5 vagues.
- Ajouté les états de run: `phase`, `waveClock`, `exploreT`, `exploreThreat`, `exploreSites`, etc.
- `waveClock` n'avance plus pendant exploration, ce qui évite de skipper des vagues combat.
- En exploration:
  - pas de spawn standard,
  - 3 POI générés autour du joueur,
  - objectif: en capturer 1 avant la fin du timer,
  - menace dynamique (distance + temps) avec embuscades scriptées.
- Récompenses POI: heal / 1 upgrade / 2 upgrades (armurerie).
- Transition entrée/sortie explicite via floats + fenêtre de calme.
- HUD: affichage `PHASE`, timer exploration, menace, et POI restants.
- Validation:
  - `node --check` OK (`waves.js`, `game.js`, `renderer.js`),
  - `npm run build` OK,
  - smoke test navigateur headless: aucune erreur console/page, HUD contient bien `PHASE COMBAT`.

## Update 4
- Suite à la demande utilisateur, validation sans Playwright.
- Vérifications faites:
  - `node --check` sur `src/game/waves.js`, `src/game/game.js`, `src/render/renderer.js`.
  - `npm run build` OK.
  - simulation Node de `updateWaves`:
    - exploration déclenchée à wave 5 puis 10 puis 15,
    - retour combat après timeout exploration,
    - `waveClock` gelé en exploration (les vagues combat ne sont pas sautées).
  - simulation Node de capture POI:
    - récompense appliquée,
    - sortie exploration anticipée vers combat.

## Update 5
- Corrections des effets de bord signalés:
  1) Exploration ne démarre plus si un boss est vivant (état + entités), donc plus de coupure boss.
  2) POI exploration validés contre murs/collisions (retries + fallback walkable) pour éviter les points inaccessibles.
  3) Timer exploration continue de décroitre même en pause/upgrade (anti-freeze exploit).
  4) Objectif `SURVIVE` basé sur `waveClock` (temps combat), plus sur le temps global `t`.
- Validation sans Playwright:
  - `node --check` OK,
  - `npm run build` OK,
  - simulation boss actif => pas d’exploration; boss disparu => exploration autorisée,
  - simulation placement POI (classic/winter/hell) => 0 cas invalides sur 120 runs/map,
  - simulation pause+upgrade => `exploreT` tombe bien à 0 et phase repasse `combat`.

## Update 6
- Basculé le mode musique vers une playlist de fichiers audio externes (5 pistes demandées).
- `src/audio/musicScores.js` remplace les partitions synthétiques par les 5 morceaux:
  - OpenGameArt Space Station
  - OpenGameArt Nebulous
  - OpenGameArt Space/Scifi Ambient
  - FMA Space/Sleep/Meditation
  - Pixabay Space Ambient Cinematic
- `src/audio/audio.js`:
  - lecture via `HTMLAudioElement` connecté au bus musique WebAudio,
  - enchaînement auto des pistes en fin de morceau,
  - anti-répétition sur les 2 derniers titres,
  - fallback automatique vers une autre piste en cas d’erreur de chargement.
- Ajout des crédits/licences et des noms de fichiers attendus dans `src/audio/tracks/CREDITS.md`.
- Validation: `node --check` + `npm run build` OK.

## Update 7
- Decision produit appliquee: suppression complete de la phase exploration (plutot qu'une refonte).
- `src/game/waves.js`:
  - retrait total de la logique exploration (POI, menace, embuscades, transitions),
  - boucle de progression des vagues maintenant 100% combat + boss.
- `src/game/game.js`:
  - retrait des etats `phase`/`explore*`/`lastExploreWave`,
  - suppression du traitement special en pause pour exploration,
  - `waveClock` continue de piloter le timing combat et l'objectif `SURVIVE`.
- `src/render/renderer.js`:
  - retrait du rendu des POI exploration,
  - HUD simplifie avec `PHASE COMBAT` en permanence.
- Validation sans Playwright:
  - `node --check src/game/waves.js src/game/game.js src/render/renderer.js` OK,
  - `npm run build` OK.

## Update 8
- Rework gameplay suite selon feedback utilisateur:
  - dégâts de contact rebalancés par type d'ennemi (mêlée plus dangereux, shooters moins punitifs au contact),
  - boss repassés en cadence déterministe par vagues (`CFG.bossEvery`) au lieu du trigger pur kills,
  - HUD boss mis à jour (`NEXT BOSS W...`) pour refléter la nouvelle logique.
- Murs destructibles implémentés:
  - état runtime: `brokenWalls` + `wallDamage`,
  - collisions/rendu lisent maintenant les murs cassés (`sampleTile(..., brokenWalls)`),
  - ennemis qui poussent contre un mur le dégradent progressivement (plus rapide en map `hell`),
  - certains tirs joueur cassent aussi les murs (impacts de projectiles + explosion de mine).
- Fichiers principaux touchés:
  - `src/game/world.js` (API murs destructibles),
  - `src/game/game.js` (grind ennemi sur murs + état run),
  - `src/game/combat.js` (dégâts murs par projectiles + contactMul),
  - `src/game/entities.js` (profil contact par ennemi),
  - `src/game/waves.js` (boss par vagues),
  - `src/render/renderer.js` (HUD boss + rendu murs cassés).
- Validation sans Playwright:
  - `node --check` sur fichiers modifiés OK,
  - `npm run build` OK.
- Ajustement final: affichage boss corrige pour pointer vers la prochaine vague future (ex: apres boss W5, HUD affiche directement W10).

## Update 9
- Implémentation du pack global demandé:
  1) Lisibilité combat
     - télégraphes renforcés (lignes de direction charge/spit, anneaux de cible pour AOE),
     - code couleur danger amélioré (projectiles `spit`/`bossShot`, flèche d'impact selon `damageKind`),
     - ajout d'un indicateur d'affix visuel par élite (`V/F/B/X`).
  2) Director IA (priorité haute)
     - calcul en temps réel de la pression (`HP`, densité ennemie, proximité, tempo de kills),
     - modulation dynamique du spawn (`directorSpawnMul`) pour éviter runs trop plates ou injustes,
     - respiration forcée courte sous pression extrême + mini-rush automatique si combat trop plat,
     - affichage HUD `MENACE` (% pression Director).
  3) Élites avec affixes
     - spawn affixé progressif à partir de wave 6: `vampire`, `frenzy`, `armored`, `explosive`,
     - `armored`: réduction dégâts entrants,
     - `frenzy`: vitesse augmente quand HP baisse,
     - `vampire`: vol de vie sur dégâts contact,
     - `explosive`: explosion à la mort (joueur + chaîne légère sur ennemis proches).
  4) Choix de nouveau stuff trop fréquents
     - réduction des drops `buff` (plus de `heal`, moins d'ouvertures menu),
     - cadence level-up menu ralentie (1 choix tous 3/2/1 niveaux selon phase de run),
     - courbe XP augmentée (`xpToNext`) pour espacer les ouvertures.
- Audio danger spécifique ajouté (`audio.warning(kind)`): `charge`, `aoe`, `shot`, `bossShot`, `rush`, `boss`, `danger`.
- Validation sans Playwright:
  - `node --check` (tous fichiers modifiés) OK,
  - `npm run build` OK.
