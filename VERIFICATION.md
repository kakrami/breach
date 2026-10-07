# Breach 2.12.0 — integrated gameplay improvements

Client and server update, protocol 105. Upload both folders together. This package has not been deployed.

## Gameplay changes

- Infection is one round: 20 seconds of preparation, then the selected four, six or eight minute clock (six by default). Infected win by converting every survivor; survivors win on time. Dead infected respawn and never trigger a survivor victory. Final standings appear immediately, followed by the normal lobby return.
- Only lethal damage from infected claws, mutation shots or an infected bomb converts a survivor. Self-inflicted and unattributed deaths keep the survivor role, money, ammunition and equipment through a safe respawn. They award no money. A cloud or projectile retains its source even if the attacker disconnects.
- Infected bots now share visible-target selection, last-seen memory, patrol, reaction delay and limited aim rotation with other bots. Hidden survivor positions are not used as live chase targets. Difficulty changes reactions, accuracy and burst discipline; bots do not exceed weapon fire-rate or player movement limits. Infected movement uses the same role rules as the player.
- Both bot and player projectiles use the shared weapon launch contract. Bots resolve configured weapon rules; ladder/traversal transitions block firing. Shared damage entry points reject friendly damage and damage after a match or its timer has ended.
- Shields use the incoming attack direction, stop bullets from penetrating through the shield bearer, and preserve rear/blast weaknesses. Fully absorbed hits do not cause blood, knockback or a health-regeneration delay. Attackers receive shield-hit feedback.
- Damage indicators use the actual impact/cloud/explosion source rather than the attacker's current position. Claws and toxic damage now have directional feedback even without physical knockback. Toxic clouds show a move-out warning. The respawn shop shows the weapon that killed you; taking damage closes an open survivor supply shop.
- Combat damage income renews after a bounded 30-second window instead of permanently exhausting a target's earnings. Repeat kill/assist rewards remain limited; accidental deaths cannot farm rewards. Purchases remain authoritative and reject requests beyond the active phase deadline.
- Reconnect inventory belongs to the match's start timestamp, preventing a previous match's role, money or equipment from being restored into a new match. Respawns clear stale AI target knowledge and aim state.
- Existing Infection spawn safety is retained: at least 24m enemy separation, cover in both sight directions, predicted proximity, physical support/collision, hazards and two walking exits. Unsafe respawns wait and retry. An opening roster that cannot fit returns to the lobby with an explanation.
- Menus/HUD now describe one round consistently. Queued survivors count correctly. Survivor accidental deaths show their actual respawn countdown. Removed a scoreboard button that overlapped the final-results heading.

## Verification

- New gameplay regressions cover accidental-death recovery without inventory/cash refills, valid persistent infection damage, unknown-source rejection, bounded renewable income, incoming-direction shield absorption, cross-match reconnect isolation, hidden-target rejection and difficulty limits.
- Server match flows cover all six modes. TDM, FFA and Moon include death/respawn and time-limit results; Waves includes overrun; Sandbox remains open until ended. All verify frozen final results and lobby return. Infection covers both outcomes, last-infected death, single final result and no automatic second round.
- Two complete simulated Infection matches run bot movement, combat, projectiles, regeneration, purchases, conversions and safe respawns on Yard and Highlands. Health, money and positions are checked throughout. These are correctness simulations, not human balance playtests.
- Infection combat/spawn regressions cover gun ammo/reload/heat, shield front/rear/break, toxic projectile collision and damage, recovery/cooldowns, sole-infected disconnect, supplies, reconnect state and timer boundaries.
- Safe opening deployment verified with 24 actors on all five official maps and 12 on the bundled custom map. The custom map's insufficient 24-actor capacity is rejected. Moving-enemy reselection and no-safe-spawn retry are verified.
- Production browser-to-worker test uses real touch purchases, focus without purchase, mutation fire, bomb use, death shop, safe respawn, final results, explicit next-match start, survivor supply and source/blocked-damage feedback.
- Native touch/controller armory regression covers pinch, rotation, horizontal swipe without accidental equip, offscreen focus navigation and unchanged factory stat markers. Layouts checked at 667×375, 844×390 and 932×430.
- All 272 attachment-stat combinations still pass. Landscape/fullscreen refusal, portrait input gating, pause/resume, lobby return and complete scoreboard paging pass.
- Package checks cover JavaScript syntax, local imports, shared client/server rules, version/cache references, preserved entry filenames and ZIP integrity.

Tests run in the actual server code and headless Chromium with touch/controller emulation. Physical phones/controllers, live networking and deployment were not tested. Multiplayer balance still needs human playtesting. Existing damage, health and weapon-stat balance was preserved rather than retuned from these simulations.

## Upload

Upload the contents of `1_SERVER_REPO_UPLOAD` and `2_CLIENT_REPO_UPLOAD` to their respective repositories. Both sides must use protocol 105. Check the visible game version or `version.json` for **2.12.0** after deployment.
