# Breach 2.13.0 — Infection flow corrections

Client and server release, protocol 106. Upload both folders. This package has not been deployed.

## Changes

- Infection starts directly in one 20-second preparation phase. The ordinary multiplayer warmup no longer runs first. The initial match snapshot contains the assigned roles, inventories and safe positions together. The selected four, six or eight minute match follows; there is one round.
- Assault rifle costs $1,800 against $2,000 starting cash. This provides a rifle-only starting choice versus UMP plus armor. Buying a primary equips it with a full magazine and cancels the old weapon's reload/action. Other weapons are not refilled by that purchase. Duplicate purchases of the equipped primary do not charge again. Shop cards label the equipped weapon, show purchase feedback, and explain that a new primary replaces the old primary.
- Preparation and shopping block local reload, swap and fire prediction, matching the server's restrictions. These inputs previously could leave the client displaying a state the server had rejected. Rifle delivery, its visible first-person model, and ammunition consumption after preparation were verified through the actual client/worker flow. The simple purchase path did not reproduce the reported missing rifle; the purchase/reload and input-state inconsistencies found around it have been corrected.
- Only a lethal claw attack converts a survivor. The attack path requires close range, facing and line of sight. Infected gunfire and toxic clouds can weaken survivors but cannot remove their final health point, kill them or infect them. Persistent effects retain this behavior after their owner disconnects.
- Mutation gun costs $3,500, above the starting budget. Conversion retains unspent cash without granting another $2,000. Free claws remain available regardless of money. Damage income now updates the player's cash display immediately. Infected bots switch to closing for a claw finish against weakened targets.
- Conversion opens an armory that holds the player's respawn until Deploy. Its minimum respawn cooldown continues while shopping; it does not restart on Deploy. The round clock continues normally. Later infected deaths automatically respawn, with an optional Armory button that holds the queue while shopping. Touch, keyboard and controller use the same actions. Reconnect preserves the held shop, purchases and remaining cooldown. A late join during preparation cannot hold the entire match in the preparation phase.
- Deploy still requires a safe spawn: at least 24m from survivors, solid cover in both sight directions, valid physical support, clearance and walking exits. Unsafe locations wait and retry without placing an infected beside a survivor. Insufficient opening map capacity returns to the lobby with an explanation.
- Expired supply points cannot accept purchases or award resources. Match-end purchases cannot charge money. Existing accidental survivor deaths retain their role and inventory; an infected death does not end the round.
- Fixed an undefined rounding helper in authoritative movement corrections. A rejected movement update now sends its correction instead of throwing a server error.

## Verification performed

- The real touch Start button loads the game renderer and enters preparation directly. A starter assault rifle purchase remains equipped, renders, and fires after the timer; server and client ammunition both decrease correctly.
- Client-to-worker tests exercise a replacement purchase during an existing reload, post-purchase firing, retained weapon/ammo in an authoritative reconnect snapshot, duplicate purchase rejection, and preparation input gating.
- Conversion shopping stays open beyond the original four-second cooldown. Touch purchase and Deploy preserve gear. Ordinary deaths offer optional Armory, controller Back deploys from the held shop, and an untouched later death automatically respawns.
- Server tests cover nonlethal bullets/clouds, source persistence after disconnect, valid melee conversion, retained cash without conversion bonuses, immediate damage income, late joining, held reconnect state, expired supplies, safe deployment, and post-result purchase rejection.
- Movement correction tests force an invalid displacement and verify a valid correction while preserving the purchased weapon.
- Existing combat regressions cover mutation ammo/heat/reload, shield front/rear/break and projectile blocking, toxic projectile collision and lifetime, supplies, sole-infected disconnect, timer boundaries and frozen final results.
- Spawn checks cover 24 actors on all five official maps, 12 on the bundled custom map, moving-enemy reselection and unsafe-spawn retries. Insufficient custom-map capacity is rejected.
- Complete four-minute Infection simulations on Yard and Highlands exercise bots, combat, projectiles, purchases, conversions, regeneration, safe respawns and timer results. These check correctness; they do not establish human multiplayer balance.
- Other mode regressions cover TDM, FFA, Moon, Waves and Sandbox match flow, appropriate death/respawn behavior, final results and lobby return.
- Shop layouts retain six cards and no scrolling at 667×375, 844×390 and 932×430. Touch and controller focus never purchase until activated.
- Release checks validate JavaScript syntax, local imports, shared client/server rules, version/cache references, preserved filenames and ZIP integrity.

Testing uses the actual server code and headless Chromium with touch/controller emulation. Physical phones/controllers, production networking and deployment were not tested.

## Upload

Upload the contents of `1_SERVER_REPO_UPLOAD` and `2_CLIENT_REPO_UPLOAD` to their respective repositories. Both sides must use protocol 106. After deployment, check the visible version or `version.json` for **2.13.0**.
