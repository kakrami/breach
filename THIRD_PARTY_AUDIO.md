# Breachline v1.16.12 fixed audio mapping

The in-game audio picker/settings system was removed in v1.16.10. The following cue mapping is fixed from the user's Breachline Sound Picker v1.6 export.

## Required attribution

Some selected sounds are not CC0:

- **Jack Menhorn – FPS Placeholder Sounds**: CC-BY 3.0. Used for Death Scream (`pain_jack_03.wav`), Announcer Cue (`bodyimpact_jack_01.wav`), Flash Throw (`punch_jack_01.wav`), and Semtex Throw (`punch_jack_02.wav`). Source: https://opengameart.org/content/fps-placeholder-sounds
- **VoiceBosch – EFFORT SOUNDS (Male) - Audio Pack**: CC-BY-SA 4.0. Used for God / Shield (`12._effort_grunt_male.wav`) and Damage Taken (`06._effort_grunt_male.wav`). Preferred attribution: VoiceBosch. Source: https://opengameart.org/content/effort-sounds-male-audio-pack

The remaining external assets selected here are CC0/public-domain sources or the bundled Breachline headshot announcement.

## Fixed cue mapping

- **Intro Music** → Psycho Punch — KiluaBoy · OpenGameArt — `https://opengameart.org/sites/default/files/Psycho%20Punch_1.ogg`
- **Pistol Fire** → Mosin Nagant Gunshot — Free Firearms SFX Library · Mosin Nagant M_21P — `https://raw.githubusercontent.com/buddingmonkey/FreeFirearmsSFXLibrary/main/Prepared%20SFX/Mosin%20Nagant/M_21P.wav`
- **Assault Rifle Fire** → Mossberg Gunshot — Free Firearms SFX Library · Mossberg N_26P — `https://raw.githubusercontent.com/buddingmonkey/FreeFirearmsSFXLibrary/main/Prepared%20SFX/Mossberg/N_26P.wav`
- **Shotgun Fire** → AR-15 Gunshot — Free Firearms SFX Library · AR-15 D_24P — `https://raw.githubusercontent.com/buddingmonkey/FreeFirearmsSFXLibrary/main/Prepared%20SFX/AR-15/D_24P.wav`
- **Sniper Fire** → 1911 Gunshot — Free Firearms SFX Library · 1911 A_34P — `https://raw.githubusercontent.com/buddingmonkey/FreeFirearmsSFXLibrary/main/Prepared%20SFX/1911/A_34P.wav`
- **Pistol Reload** → Pistol Reload — SpringySpringo · OpenGameArt — `https://opengameart.org/sites/default/files/gunreload1.wav`
- **Assault Rifle Reload** → Assault Rifle Reload — SpringySpringo · OpenGameArt — `https://opengameart.org/sites/default/files/assaultriflereload1_0.wav`
- **Shotgun Shell Load** → Single Shell Load — BMacZero · OpenGameArt — `https://opengameart.org/sites/default/files/singlebullet1.wav`
- **Shotgun Pump Action** → Shotgun Pump — SpringySpringo · OpenGameArt — `https://opengameart.org/sites/default/files/shotguncock_0.wav`
- **Sniper Reload** → Clip Load — BMacZero · OpenGameArt — `https://opengameart.org/sites/default/files/clipload2.wav`
- **Hitmarker** → Hurt Vocal — EZduzziteh · OpenGameArt — `https://opengameart.org/sites/default/files/hurt_01_0.mp3`
- **Headshot Announcement** → Headshot Announcement — Breachline bundled announcement — `audio/headshot-announcer.ogg`
- **Death Scream** → Pain Vocal 03 — Jack Menhorn · FPS Placeholder Sounds · OpenGameArt — `https://opengameart.org/sites/default/files/pain_jack_03.wav`
- **Announcer Cue** → Body Impact Vocal Foley — Jack Menhorn · FPS Placeholder Sounds · OpenGameArt — `https://opengameart.org/sites/default/files/bodyimpact_jack_01.wav`
- **God / Shield** → Effort / Pain Grunt 12 — VoiceBosch · Effort Sounds (Male) · OpenGameArt — `https://opengameart.org/sites/default/files/12._effort_grunt_male.wav`
- **Damage Taken** → Effort / Pain Grunt 06 — VoiceBosch · Effort Sounds (Male) · OpenGameArt — `https://opengameart.org/sites/default/files/06._effort_grunt_male.wav`
- **Jump** → Jump — mieki256 · OpenGameArt — `https://opengameart.org/sites/default/files/jump.flac`
- **Footstep Left** → Footstep 01 — GboxMikeFozzy · OpenGameArt — `https://opengameart.org/sites/default/files/01-footstep.ogg`
- **Footstep Right** → Footstep 02 — GboxMikeFozzy · OpenGameArt — `https://opengameart.org/sites/default/files/02-footstep.ogg`
- **Landing** → Landing — MentalSanityOff · OpenGameArt — `https://opengameart.org/sites/default/files/jumpland48000.mp3`
- **Flash Throw** → Punch / Hit Candidate 01 — Jack Menhorn · FPS Placeholder Sounds · OpenGameArt — `https://opengameart.org/sites/default/files/punch_jack_01.wav`
- **Semtex Throw** → Punch / Hit Candidate 02 — Jack Menhorn · FPS Placeholder Sounds · OpenGameArt — `https://opengameart.org/sites/default/files/punch_jack_02.wav`
- **Flash Impact** → Metal Clink — BMacZero · OpenGameArt — `https://opengameart.org/sites/default/files/clink1_0.wav`
- **Semtex Stick / Impact** → Impact Thud — BMacZero · OpenGameArt — `https://opengameart.org/sites/default/files/thud2.wav`
- **Semtex Beep** → NPC Message — Spring Spring · OpenGameArt — `https://opengameart.org/sites/default/files/snd_npc_message.wav`
- **Flash Detonation** → Flashbang Detonation — teeeece · OpenGameArt — `https://opengameart.org/sites/default/files/flash_bang.wav`
- **Semtex Explosion** → Explosion 5 — Delta12 Studio · OpenGameArt — `https://opengameart.org/sites/default/files/explosion_5.ogg`


## v1.16.12 persistent low-latency playback

Several selected source recordings contain leading silence or multiple recorded events. Breachline applies the same smart one-shot treatment used by Sound Picker v1.6: each fixed cue is analyzed during startup, the first audible transient is detected with a small pre-roll, and gameplay keeps only the cue-appropriate one-shot window. One-shot cues use pre-decoded Web Audio buffers with the `interactive` latency hint instead of starting remote media elements when the event fires.

Downloaded CORS-readable source files are stored in IndexedDB together with their detected onset so reloads reuse the on-device copy instead of downloading the source again. Sources that cannot be read through CORS are stored in the browser Cache Storage and served cache-first by `audio-cache-sw.js`; an IndexedDB marker prevents repeated CORS download attempts on later loads. The game requests persistent browser storage on entry. Large firearm source WAVs are not retained in RAM after processing; only their short trimmed AudioBuffers remain in memory. Semtex beep duration is additionally capped below the current accelerating beep interval to prevent overlapping vocal/message tails.
