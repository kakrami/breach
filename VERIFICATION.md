# Breach 2.10.0 — Infected mode

Integrated client and server, protocol 104. This package has not been deployed.

## Behavior

- Three rounds, each with 20 seconds of preparation and a default six-minute survival clock. Hosts can select four, six or eight minutes. Initial infected assignments rotate. Survivors win on time; infected win when everyone is converted. Killing the last living infected does not end a round.
- Infected return after four seconds, reduced to three in the final minute. They retain purchases and cash through death. A lethal survivor hit queues a safe infected spawn instead of reviving the player beside their attacker.
- Every deployment checks current opponents, predicted proximity, solid-cover sight lines in both directions, collision, floor support, hazards and recent combat. Enemy separation is at least 24 metres. Candidates require two clear six-metre walking exits; this is local exit validation, not an exhaustive global navigation proof.
- No unsafe spawn fallback. Blocked respawns stay queued and retry. An opening roster that cannot fit safely returns to the lobby with a clear message to reduce bots or choose another map.
- Both roles earn money. Rewards cover hostile damage, kills/conversions, assists and survivor supply collection, with limits on repeat farming. Round budgets reset to $2,000. Reconnecting preserves inventory, ammo and health and cannot grant a free refill.
- Infected equipment: claws, throwable infected bomb with a finite toxic cloud, mutation machine gun with ammo/reload/heat, directional heavy shield with durability, screech reveal and carapace health upgrade. The shield has rear/blast weaknesses; actions have recovery times.
- Survivors buy weapons, armor, medkits and grenades. Rotating supply points award ammo and cash and allow nearby purchases. Infected can buy during preparation or while dead. Purchases and equipment are server-authoritative.
- Bots use the same damage, buying, equipment and spawn rules. Solo practice gets an infected bot. A disconnected sole infected is replaced rather than awarding a round.
- Native canvas shops have six equal-height 3D cards, direct tap/click/A purchases and no scrolling. Focus only previews. Equipment appears in gameplay; role HUD, round results, scoreboards and sound cues are integrated.
- Existing direct-equip armory, attachment guides, settings, roster controls, relationship colors and landscape lifecycle are retained.

## Controls

| Action | Keyboard | Controller | Touch |
| --- | --- | --- | --- |
| Claws / mutation gun | Fire | RT | Fire |
| Mutation reload | R | X / square | Reload |
| Claws / gun switch | Weapon switch | Y / triangle | Swap |
| Infected bomb | G | RB / R1 | Toxic |
| Heavy shield | Q toggle | Hold LT / L2 | Shield toggle |
| Screech | F | LB / L1 | Screech |
| Nearby survivor supply shop | B | D-pad up | Supply button |
| Survivor medkit | H | D-pad down | Medkit button |

Pausing releases a held shield and gameplay input. Shop cards activate immediately with tap/click/A; there is no second Equip button.

## Verification performed

- Actual server room tests: complete three-round lifecycle, last-infected death, conversion, timer boundary, round budgets, role restrictions, repeat purchases, retained equipment, solo bots, disconnect replacement and reconnect preservation.
- Combat tests: fire rate, ammo, reload, overheating, recovery times, shield front/rear/break behavior, toxic projectile collision and gradual cloud damage, reveal cooldown, friendly/self reward rejection, maximum-health regeneration and one-time supply rewards.
- Real map collision tests: safe initial deployment for 24 actors on Highlands, Depot, Yard, Rig and Moon; 12 actors on the bundled custom map. Its 24-actor roster is intentionally rejected for insufficient covered capacity. Runtime tests move survivors into a previously selected spawn and verify reselection; an entirely blocked map waits and recovers when safe space returns.
- Production browser-to-worker integration: real touch purchase, authoritative ammo/bomb consumption, death shop, safe respawn, retained equipment, next-round role change and active survivor supply purchase. No uncaught browser errors in completed flows.
- Native six-card shops fit 667×375, 844×390 and 932×430 with no scrolling. Actual 3D thumbnails and phone screenshots inspected. Controller focus is verified not to purchase.
- Existing menu interaction, landscape/fullscreen lifecycle and scoreboard paging regression checks passed. These cover direct equipment selection, controller navigation, settings, team/bot controls, portrait input blocking, API refusal and complete scoreboard rows.
- Release checks validate JavaScript syntax, shared rules, version/cache references, ZIP integrity and preservation of existing entry filenames.

Tests use headless Chromium, touch emulation and simulated controller handlers. Physical phones/controllers and live deployment were not tested. Gameplay balance still needs multiplayer playtesting. Browser restrictions can refuse forced fullscreen/orientation lock; the landscape input gate remains in place.

## Upload

Upload the contents of `1_SERVER_REPO_UPLOAD` and `2_CLIENT_REPO_UPLOAD` to their respective repositories. Both must be updated: this release uses protocol 104. Preserve the existing entry filenames. After deployment, check the in-game version and `version.json` for 2.10.0.
