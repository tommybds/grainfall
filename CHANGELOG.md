## Changelog

Ce projet suit le format de [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) et applique (au mieux) la sémantique de versionnage.

## [0.2.0] - 2026-01-29

### Added
- **Dash** (clavier `Espace`/`Shift` + bouton UI) avec cooldown affiché dans le HUD.
- **Aimant à pickups** (attraction + auto-pickup) + upgrades **MAGNET+** / **DASH+**.
- **Menu d’upgrade** (3 choix) sur level-up + touches `1/2/3` + support tactile.
- **Télégraphie boss** (warning + HUD) et **wind-up spitter** (indication visuelle).
- **Synergies**:
  - ricochet: +dégâts après rebond
  - shotgun: knockback
  - lance: bleed/DOT
- **Nouvelle map** `winter` (Hiver/Verglas) + thème dédié.
- **Lien GitHub** dans le menu + footer.
- **Google Tag** (gtag) intégré.
- **Licence MIT** (`LICENSE`).

### Changed
- **Renommage** du projet: Survivor → **Grainfall**.
- **Tirs**: collisions murs (détruit la plupart du temps, ricochet parfois) + projectiles rendus **orientés** selon leur direction.
- **Pickups**: meilleure lisibilité (pulse + halo + légère couleur).
- **HUD**: ajout d’infos “boss bientôt”, objectif de run, dash.
- **Hell**: murs un peu plus “patternés” (diagonales) pour plus de lisibilité.

### Removed
- **Boue**: suppression complète (génération + glyph + effet).
- **Hit-stop** (micro-freeze) retiré pour éviter les impressions de ralentissement.

### Fixed
- `winter`: verglas uniquement (pas de boue).
- Contrôles menu: désactivation des raccourcis de sélection pendant une run.

[0.2.0]: https://github.com/tommybds/grainfall
