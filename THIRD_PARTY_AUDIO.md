# Breachline default audio provenance

Breachline v1.16.5 uses a deliberately small CC0 sample set for realistic high-value FPS cues. Attribution is not required by CC0, but provenance is kept here for maintainability. Other default cues remain original procedural Web Audio sounds.

## CC0 sampled defaults

- **Gunshot transient** — `gunshot_0.mp3` from **Basic Sound Effects** by **n4**, OpenGameArt. License: **CC0 1.0**. Used as the recorded transient for pistol, assault rifle, shotgun, sniper, and flash detonation, with per-cue playback-rate/gain shaping.
  Source page: https://opengameart.org/content/basic-sound-effects
- **Weapon reload / mechanical impact** — `gun_reload_lock_or_click_sound.mp3` by **pauliuw**, OpenGameArt. License: **CC0 1.0**. Used for reload and low-volume tactical impact variants.
  Source page: https://opengameart.org/content/gun-reload-lock-or-click-sound
- **Explosion** — `explosion_5.ogg` from **Rpg Sound Effect Pack** by **Delta12 Studio**, OpenGameArt. License: **CC0 1.0**. Used for Semtex detonation.
  Source page: https://opengameart.org/content/rpg-sound-effect-pack
- **Hurt** — `hurt_1.ogg` from **Rpg Sound Effect Pack** by **Delta12 Studio**, OpenGameArt. License: **CC0 1.0**. Used for damage taken.
  Source page: https://opengameart.org/content/rpg-sound-effect-pack

## Performance policy

The four source files total about 99 KB. They are loaded asynchronously only after the player enters the experience, reused through small fixed audio pools, and never awaited in the combat path. If a remote sample is unavailable, Breachline immediately falls back to its built-in procedural cue. User-uploaded local sounds always take priority over both.
