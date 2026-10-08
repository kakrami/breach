# Breach 2.15.0 — Infection gameplay rebuild

Client and server release, protocol 109. Upload both folders to their respective repositories. This package has not been deployed.

## Round and combat

One 20-second preparation phase leads into one six-minute round by default. Preparation allows movement and free primary-weapon selection; the selected weapon remains equipped at outbreak. Four/eight-minute host options remain available. Survivors win at time expiry; infected win once everyone is converted. Killing an infected never ends the round.

Standard infection requires a server-validated claw hit within 1.65m, facing the target and with clear line of sight. Two contacts consume the starting 100 armor; the next converts. Claws have a one-second cooldown. New conversions happen in place with a visible 2.2-second grace period, without a forced shop or death screen. Guns cannot infect.

Infected respawn automatically after four seconds once a safe position is available. Spawns require at least 24m separation, solid cover from survivors, supported ground, clear exits and a navigable route into combat. Authored cover edges supplement the map's spawn/navigation anchors; unsafe fallback placement is never used. Late joiners become infected after outbreak. Reconnect preserves inventory, class, health and currency through a safe spawn queue.

One first infected is selected up to eight participants, two for 9–16 and three for 17–24. Selection uses rotation history and randomized ties. First-life health scales from 1.2× to 1.8× with roster size. That bonus does not reapply on reconnect or later respawns.

## Four free infected classes

| Class | Health | Movement | Ability | Cooldown |
| --- | ---: | ---: | --- | ---: |
| Runner | 1000 | 103% | Brief committed-direction dash | 13s |
| Leaper | 1200 | 100% | Forward pounce with boosted jump | 16s |
| Brute | 1900 | 88% | Resistant charge that breaks barricades | 20s |
| Stalker | 950 | 106% | Quiet footsteps with a modest movement boost; remains visible | 18s |

Abilities are free and use the existing tactical input. Their movement, cooldowns, windup and status are authoritative. Class changes queue for the next spawn; they cannot heal a living player. Infected bots can change class between lives instead of repeating the same approach indefinitely.

Sustained knockback has a shared impulse budget and speed cap. The server sends the actual clamped impulse to the client. Repeated frost has a shorter effect. Carapace provides temporary resistance instead of invulnerability; Purge clears fire/frost and briefly resists those statuses.

## Economy and field play

Both roles start with 8 ammo packs, capped at 60. Survivor damage and kills earn packs with repeated-target farming limits. Infected earn packs for armor contacts, conversions and assists. Conversion preserves currency. All purchases validate phase, role, funds and ownership before spending.

Human shop: six primary weapons, armor, napalm, frost, flare and one carried barricade kit. Guns are free during preparation and cost 3 AP afterward. Players start with armor, one of each utility grenade and a barricade kit. Armor cannot be repurchased within seven seconds of a claw hit.

Infected shop: Carapace (9 AP) and Purge (5 AP). An owned item can be selected without buying it again. Paid night vision, medkits, mutation guns and heavy shields are absent from the standard shop. Humans have a flashlight; infected have ambient night vision.

Host-enabled Chaos adds antidote (25 AP) and infection bomb (20 AP). It is off by default. An antidote cannot cure the first or last infected. A bomb respects cover and cannot convert the last survivor. Standard mode has no ranged conversion.

Defense markers sit on supported ground with multiple clear approaches. Construction is contextual, takes one action and refuses occupied space without consuming the kit. A team can have three active barricades. Their rendered wood, player collision and projectile collision come from the same geometry compiler. Four claws or one Brute charge destroy them. Highlands, Yard, Depot and Rig gain a second ladder approach to their authored roof holds, with real attach/climb/dismount endpoints.

Optional field supplies appear periodically during combat, with no added phase or shop timer. Each drop serves two different survivors, restoring up to 50 armor and one napalm/frost grenade, subject to carry limits. Collection is automatic at close range with line of sight. Drops expire; a survivor cannot repeatedly claim the same drop.

Contextual pings mark danger, supplies or regroup locations. Only teammates receive them. Bots use sight, nearby gunfire/footsteps and team reports; hidden silent players are not directly tracked. Infected search defense locations and rooftops, flank with allies and use class abilities. Survivors seek cover, coordinate reload opportunities, face threats while retreating and switch away from a sniper rifle at close range. Terrain-height changes no longer send bots toward unrelated ladders; roof descent can route around ground obstacles.

Conversion grace, class windup, claws, frost, burning and resistance have visible feedback. Stalker footsteps are suppressed during its ability. The final minute adds restrained music, with increased intensity in the final 20 seconds and a last-survivor announcement.

## Controls

| Input | Survivor | Infected |
| --- | --- | --- |
| Touch | Armory, Ping, contextual Build, Frost, Napalm, Flare | Claws, free class ability, selected equipment, Armory, Ping |
| Keyboard | B armory; Q frost; G napalm; F flare; E build; H ping | Fire claws; Q/F ability; G selected equipment; B armory; H ping |
| Controller | Up armory; LB frost; RB napalm; Left contextual build/flare; Down ping | Fire claws; LT/LB ability; RB selected equipment; Up armory; Down ping |

Shop focus/hover never spends packs. Activate once to purchase/equip or queue a class; B/Back closes the shop. Shopping does not stop the match or hold respawn. Cards fit common landscape phones without scrolling.

## Verification

Checks run the actual worker, shared collision/movement code and game client. Browser tests use headless Chromium with emulated touch/controller input.

- Start → preparation → weapon purchase → outbreak → combat → conversion → death → automatic respawn → results → lobby/restart.
- All six weapons equip, fire, swap, reload and survive reconnect. Both win conditions, late joins, last-infected disconnect replacement and post-result purchase rejection.
- Four class profiles, ability windup/cooldown restrictions, actual touch pounce, conversion grace, bounded knockback, Purge while frozen and owned-item selection without spending.
- Standard/Chaos restrictions, armor contact and range rules, napalm persistence, frost, grenade inventory and cover checks.
- Contextual touch building, authoritative/client geometry synchronization after match reset, occupied-space refusal, barricade destruction and restoration of the original world for other modes.
- Supply pickup/expiry, team-only ping snapshots, touch ping and bot sound/search behavior.
- Mixed 24-actor starts on Highlands, Yard, Depot, Rig and Moon. Reachable covered spawn checks and full group simulations with combat, deaths and respawns.
- Real bot ladder pursuit and conversion on the four roof maps, plus descent and ground pursuit from the added roof routes.
- Final-minute music state and cleanup; status visuals and their expiry.
- Armory fit at 667×375, 844×390 and 932×430, with 44px-or-larger controls and no scrolling. Browser cycle has no uncaught errors.
- TDM, FFA, Moon, Waves and Sandbox retain their existing warmup and run bot/projectile checks.
- Release JavaScript syntax, local imports, shared-module parity, version/protocol consistency and ZIP integrity.

Six minutes is the default match budget, not a forced minimum. Contested rounds are intended to last 4–6 minutes; earned early wins remain possible. Automated matches check the complete cycle and reveal mechanical problems, but do not establish human multiplayer balance. Physical phones/controllers, production networking and deployment were not tested.

## Upload

Upload the contents of `1_SERVER_REPO_UPLOAD` and `2_CLIENT_REPO_UPLOAD` to their respective repositories. Both sides must use protocol 109. After deployment, the game and `version.json` should report 2.15.0.
