# Breach 2.18.0 — Battle Rifle

Complete client/server package, protocol 112. Upload both folders together. This release has not been deployed.

## Added

- **Battle Rifle** is a selectable primary weapon: six rounds, one projectile per trigger press, a 1,000 ms bolt cycle, 2,050 ms reload, 80 base damage and iron sights. Its precision role sits between the automatic rifles and the scoped Sniper.
- The model follows the supplied reference: a broad orange stock and receiver, black butt pad and ribbed fore-end, long lime-green rail and barrel shroud, orange muzzle caps and small red accents.
- One model factory supplies first-person play, other players and the armory preview. Fixed details are batched by material. The bolt lifts, retracts, returns and locks, with the trigger hand following its handle and a mechanical handling cue. Reloading moves the magazine and operates the bolt.
- Red dot, holographic and 3× optics, suppressor, extended/fast magazines and laser attachments use the existing shared attachment rules. The factory color scheme remains intact.
- Client prediction and the authoritative server use the same cooldown. Repeated trigger presses or switching weapons cannot bypass it. Holding fire does not repeat shots.
- Loadout classes, bots, multiplayer snapshots, replay shot presentation, host tuning and the Infected supply catalog recognize the new weapon. Infected preparation offers it free, consistent with the other weapons.
- The Infected supply grid now includes all seven weapons. Host weapon controls accommodate eleven weapons without overlapping the tuning fields.

## Verification

- **21 native browser integration checks:** loadout selection and persistence, actual touch rail scrolling, controller preview/commit, attachments, class switching and respawn, host permissions and weapon tuning, firing and cooldown, bolt travel, held-fire behavior, ADS, authoritative reload, and matching remote model construction. No browser errors.
- **17 Infected browser integration checks:** every supply weapon equips; Battle Rifle survives the outbreak and fires; touch purchases, field interactions, controller navigation, conversion, respawn and results remain functional. No browser errors.
- **8 focused authority checks:** actual worker fire acceptance, exact cooldown boundary, swap bypass rejection, reload, attachment rules, variable-speed bolt phases, round preparation in TDM/FFA/Moon/Zombies/Sandbox, Infected purchases/reconnect, and seven-item shop bounds.
- **296 attachment/stat configurations across 11 weapons:** base and host-tuned rules agree with displayed stats; the original ten weapons retain their prior rules.
- **15 mode edge checks:** Infected status/equipment transitions, match restart/disconnect handling and all five ordinary mode lifecycles.
- Landscape layouts checked at **667×375, 844×390 and 932×430**. First-person hip/ADS views and the reference-inspired model were visually inspected in Chromium WebGL.
- Release validation: **141 JavaScript files**, **282 local imports**, **41 shared module pairs**, matching client/server version and protocol, and a complete **269-file** archive. The only added file is `2_CLIENT_REPO_UPLOAD/battle-rifle.js`.

The map grounding, ladder and terrain repairs from 2.17.0 are retained. This weapon release does not change map geometry or the existing match economy. Browser automation used a local authoritative worker fixture; live deployment, real network latency and physical-device performance were not tested.
