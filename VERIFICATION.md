# Breach 2.19.0 — Arsenal

Complete client/server package, protocol 113. Upload both folders together. This release has not been deployed.

## Weapon identities

| Existing saved ID | Display name | Action and model |
| --- | --- | --- |
| pistol | GLOCK 19 | Reciprocating slide, polymer frame, slide-mounted reflex sight |
| akimbo1887 | WINCHESTER 1887 · DUAL | Two lever-action shotguns, individual cycling levers, shell carriers |
| assault | FN SCAR-L | Tan receiver and stock, fitted magazine and modular handguard |
| ump | HK UMP45 | Compact receiver, skeleton stock and straight magazine |
| machineGun | M249 | Opening feed cover, belt, ammunition box and folding bipod |
| shotgun | REMINGTON 870 | Moving pump, tubular magazine and individual shell loading |
| semiShotgun | SAIGA-12 | Self-loading action, curved detachable magazine |
| battleRifle | BATTLE RIFLE | Custom orange/green/black rifle with a visible manual bolt |
| sniper | SVD DRAGUNOV | Semiautomatic action, thumbhole stock, detachable magazine and scope |
| grenadeLauncher | M79 | Break-action barrel and visible 40 mm loading round |
| rpg | RPG-7 | Launch tube, warhead and visible rocket loading |

The Battle Rifle remains a custom design based on the supplied reference, rather than borrowing an unrelated real weapon's name. All saved weapon IDs, attachment rules, damage, capacities and other gameplay values are preserved.

## What changed

- `weapon-models.js` supplies the whole arsenal to first-person play, remote players and the armory. Separate obsolete weapon builders were removed. Static parts are batched by material; remote players build weapon geometry on first equip. Base weapons use 8–29 visible meshes and approximately 556–3,108 triangles per gun, before attachments and hands.
- Models have distinct stocks, receivers, grips, magazines, sights and actions. Extended magazines, barrels and stocks replace the appropriate parts. Muzzle accessories and flashes follow the selected barrel. Hands follow the selected foregrip or moving action. M249's bipod folds when unequipped.
- The Battle Rifle's receiver now has an open action. Its bolt shares the barrel axis, lifts before traveling, returns before locking, and follows the effective cooldown. The right hand reaches the real handle. Its reference colors remain intact.
- Reloads move magazines, belts, feed covers, shells, hinged barrels and rockets as appropriate. Glock's empty slide stays open until the reload closes it; SVD uses a semiautomatic bolt. Interrupted poses return to their equipped state.
- Existing handling recordings are retimed to the reload phases. Playback follows the effective reload duration; cancellation stops local reload audio. The Battle Rifle has its own reload sequence.
- Preview templates remain neutral and cannot change a live firing or reload pose. Weapon thumbnails are rendered from the same new models, and their URLs carry the release version to refresh returning clients' cached images.
- Names and role labels come from shared weapon definitions throughout loadouts, host tuning and Infected supply. The 1887's fast-reload attachment is presented as a shell carrier. Existing class overview/edit/selection and automatic-save flows are retained.
- Replays capture the shooter's loadout, ammo and reload state, follow recorded weapon changes, and pose the same model parts on the replay timeline. Dual levers are tracked independently. Stopping a replay restores the viewer's loadout presentation. Remote launcher presentation returns to its loaded state after reload.
- Initial weapon normalization has its optional replay state initialized before startup, avoiding an initialization-order error introduced during the rebuild and caught by the browser gate.

## Verification

- **38 native browser integration checks:** actual touch and controller navigation; class/attachment edits and persistence; hover versus committed choices; Back/reopen behavior; host tuning and permission rejection; queued class respawn/reconnect; all eleven weapons spawning, aiming, firing, consuming authoritative ammo and reloading; 104 visual attachment configurations; 30 optic aim-axis alignments; neutral previews; remote model reuse; killcam/final replay poses, weapon changes and restoration. No browser errors.
- **17 Infected browser checks:** supply selection, outbreak, purchases, touch/controller controls, construction, status effects, conversion, movement, respawn, armory bounds and results. No browser errors.
- **55 weapon/mode authority cases:** every weapon in TDM, FFA, Moon, Zombies and Sandbox fires, cancels reload on weapon swap or equipment use, retains its ammo correctly and completes an empty reload.
- **296 attachment/stat configurations:** displayed metrics agree with base and host-tuned rules. Existing numeric weapon balance is unchanged.
- **8 Battle Rifle authority checks:** exact bolt cooldown, swap-bypass rejection, reload, effective attachment rules, mode preparation, Infected purchase/reconnect and supply-grid bounds.
- **15 mode edge checks:** Infected equipment/status rules, restart/disconnect handling and ordinary mode lifecycle behavior.
- Native layouts checked at **667×375, 844×390 and 932×430**. All eleven hip/ADS/reload views and updated preview images were visually inspected in Chromium WebGL.
- Final archive gate checks **142 JavaScript files**, **287 local imports**, **41 shared module pairs**, matching versions/protocol, all **272 files**, and clean/returning/malformed-save startup in portrait and landscape.

The earlier map grounding, ladder and terrain repairs remain intact. This update changes no authored map geometry, match economy or weapon balance. Browser automation uses a local authoritative worker fixture. Public deployment, real network latency, physical phones/controllers and Safari were not tested.
