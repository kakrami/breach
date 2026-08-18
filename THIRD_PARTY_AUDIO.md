# Breachline default audio sources

Breachline v1.16.8 uses CC0 audio for its built-in sound cues. Default files are loaded asynchronously and cached by the browser; the large firearm recordings are loaded only for the weapon being equipped instead of warming every gun at startup. Local user-uploaded overrides remain device-only and take priority.

Attribution is not required for CC0, but source provenance is kept here for maintenance.

| Breachline cue | Source | Creator | License |
|---|---|---|---|
| Intro music | Psycho Punch | KiluaBoy | CC0 |
| Pistol fire | Free Firearms SFX Library – 1911 A_34P | Ben Jaszczak et al. | CC0 |
| Assault rifle fire | Free Firearms SFX Library – AR-15 D_24P | Ben Jaszczak et al. | CC0 |
| Shotgun fire | Free Firearms SFX Library – Mossberg N_26P | Ben Jaszczak et al. | CC0 |
| Sniper fire | Free Firearms SFX Library – Mosin Nagant M_21P | Ben Jaszczak et al. | CC0 |
| Pistol reload | Gun reload sounds – gunreload1 | SpringySpringo | CC0 |
| Assault rifle reload | Gun reload sounds – assaultriflereload1 | SpringySpringo | CC0 |
| Shotgun shell load | Gun Reload Sound Effects – singlebullet1 | BMacZero | CC0 |
| Shotgun pump action | Gun reload sounds – shotguncock | SpringySpringo | CC0 |
| Sniper reload | Gun Reload Sound Effects – clipload2 | BMacZero | CC0 |
| Hitmarker | Skill hit – skill_hit.mp3 | pauliuw | CC0 |
| Headshot | Basic Sound Effects – bell1 | n4 | CC0 |
| Elimination confirm | Basic Sound Effects – success | n4 | CC0 |
| Announcer cue | Various Sound Effects – snd_npc_message | Spring Spring | CC0 |
| God / shield | Basic Sound Effects – vibrophone1 | n4 | CC0 |
| Damage taken | Hurt Sound Effects – hurt_01 | EZduzziteh | CC0 |
| Jump | Jump and Run and Stand – jump | mieki256 | CC0 |
| Footstep left | Footsteps – 01-footstep | GboxMikeFozzy | CC0 |
| Footstep right | Footsteps – 02-footstep | GboxMikeFozzy | CC0 |
| Landing | Jump Landing Sound | MentalSanityOff | CC0 |
| Flash throw | Various Sound Effects – snd_throw1 | Spring Spring | CC0 |
| Semtex throw | Various Sound Effects – cannonball_tap | Spring Spring | CC0 |
| Flash impact | Metal Impact Sounds – clink1 | BMacZero | CC0 |
| Semtex impact | Metal Impact Sounds – thud2 | BMacZero | CC0 |
| Semtex beep | Beep Sound – beep | OpenGameArt contributor | CC0 |
| Flash detonation | flash bang sound | teeeece | CC0 |
| Semtex explosion | Rpg Sound Effect Pack – explosion_5 | Delta12 Studio | CC0 |

Primary source sites: GitHub mirror of the Free Firearms SFX Library and OpenGameArt.org.


## v1.16.8 audio mapping changes

- Pistol fire now uses the prior Mosin Nagant / sniper recording.
- Sniper fire now uses the prior 1911 / pistol recording.
- Shotgun fire now uses the prior AR-15 / assault-rifle recording.
- Assault-rifle fire now uses the prior Mossberg / shotgun recording.
- Semtex throw intentionally uses the same built-in throw asset as Flash. A local Semtex Throw override can still replace it independently.
- Headshot default is a bundled one-word `Headshot` announcement generated specifically for Breachline and stored at `audio/headshot-announcer.ogg`.
- Elimination confirmation now uses `snd_enemyscream.wav` from Spring Spring's **Various Sound Effects** on OpenGameArt, released under CC0: https://opengameart.org/content/various-sound-effects-0
