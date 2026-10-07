# Breach 2.14.1 — Classic Infection

Client and server release, protocol 108. Upload both folders to their respective repositories. This package has not been deployed.

## Completion fixes in 2.14.1

- Fixed both shotguns being rejected by ordinary primary-slot validation. All six Infection weapons now equip, swap, reload and survive reconnects through the authoritative inventory path.
- Reset the whole lobby before checking preparation spawns, preventing old bot teams from blocking a full lobby's start.
- Resolved authored ladder endpoints against the actual terrain and roof surfaces. Infected bots now route to ladders and pursue rooftop survivors on Highlands, Yard, Depot and Rig.
- Napalm follows affected infected for its full duration after they leave the blast. Frost, burning and madness have distinct timed visual effects and local status labels.
- Compacted the scoreboard to its roster, kept paging controls at 44px and replaced obsolete series scores with actual roster counts for this one-round mode.

## Game cycle

1. Start directly in one 20-second preparation phase. Everyone is human, can move to cover, and has a default UMP. Choose one of six primary weapons free during preparation; it equips immediately and survives the outbreak.
2. The outbreak selects initial infected using rotation history and randomized ties. Larger groups receive additional initial infected. Initial infected relocate to safe covered positions at least 24m from survivors. First infected have doubled class health.
3. Play one four, six or eight minute round. Survivors shoot and use knockback, armor, napalm, frost and flares to hold out. Unarmored claw contact immediately converts a survivor in place. Two claw contacts consume 100 armor; the next converts. Range, facing and cover are checked by the server.
4. Infected use claws, six free classes and earned upgrades. Mutation guns, heavy shields and toxic cash pickups are removed. Classes trade health, movement, jumping and knockback; Leech heals on conversion. A living class change queues for the next spawn without healing the current body.
5. Infected deaths trigger a four-second automatic respawn, subject to a safe location being available. Death alone never awards survivors a win. Conversion has a brief protection/attack grace and never forces a death screen or shop.
6. All humans infected means infected win. Humans remaining at the time limit means survivors win. One results screen follows. Returning to the lobby and starting again rebuilds the preparation state.

## Economy and equipment

Both sides start with 10 ammo packs (AP), not dollars. Conversion preserves the remaining balance. Humans earn packs for damage and kills; infected earn them through infections and assists. Repeated damage farming is bounded. Primary weapons cost 3 AP after preparation. Purchases validate phase, role, funds and ownership on the server; rejected purchases cannot spend packs.

Human equipment: medkit, armor, napalm, frost, flare and night vision. Human players begin with one of each grenade type. Infection uses dusk lighting, a human flashlight and infected night vision. Grenades travel and collide with the world before applying their effects.

Infected equipment: Zombie Madness (15 AP), antidote (25 AP), optional infection bomb (20 AP). Madness grants five seconds of protection and has an activation cooldown. Antidotes cannot cure a first infected, remove the last infected or be repeatedly reused. Infection bombs are host-controlled, off by default, respect cover and cannot convert the last survivor. Ordinary infected gunfire is rejected.

The armory is optional and remains accessible during play, while dead for class selection, and from Pause. Shopping does not pause the match or delay respawn. All cards keep consistent height; three-item equipment panels use one row.

## Controls

- Touch: Armory, Frost, Napalm, Flare and Heal buttons; infected fire buttons attack with claws. Madness replaces the tactical control. The optional bomb uses the lethal control.
- Keyboard: B armory; Q frost/madness; G napalm/infection bomb; F flare/madness; H medkit. Standard firing and movement remain unchanged.
- Controller: D-pad Up armory; LB frost/madness; RB napalm/infection bomb; Left flare; Down heal; LT madness when infected. Shop bumpers change tabs; navigation previews without buying; A activates; B closes.

## Verification performed

The tests run the actual worker and game client, with headless Chromium and emulated touch/controller input.

- Actual Start, one preparation phase, all six free weapon choices, touch movement, outbreak, visible rifle and matching client/server ammunition after firing. Every weapon also passes swap, reload acknowledgement and reconnect checks.
- Equipment purchases, free class choice, controller focus without spending, tab navigation, Pause-to-Armory and Back-to-combat.
- Immediate claw conversion without a death/shop interruption, queued class selection, authoritative death and automatic respawn into the chosen class.
- One results screen, both win conditions, post-result purchase rejection, lobby return and clean restart.
- Reconnect preserving inventory, ammo, health, class and packs; correct late-join roles; replacement infected when the last infected disconnects.
- Range/cover/armor rules, conversion grace, madness, antidote limits, frost, napalm, flare flight and inventory gates, host bomb setting and final-survivor protection. Napalm continues after leaving its blast and expires correctly; all three status visuals are created and removed with their authoritative timers.
- All six classes match their shared movement/jump profiles.
- Mixed 24-actor opening deployment on Highlands, Yard, Depot, Rig and Moon. Safe respawn retries preserve separation rather than using an unsafe fallback.
- Four complete group simulations with 10–16 actors on Yard, Highlands, Depot and Rig, including combat, conversion, safe respawns and infected victories. Separate clock-expiry cases establish survivor victories. These simulations demonstrate the complete cycle, not human balance.
- Rooftop pursuit and melee conversion on all four maps with authored ladders. Bots route around cover using actual collision geometry and climb to elevated targets.
- Other mode smoke checks: TDM, FFA, Moon, Waves and Sandbox retain normal warmup and run bot/projectile simulation without errors.
- Armory fit at 667×375, 844×390 and 932×430, with no scrolling and touch targets of at least 44px. Final browser cycle has no uncaught runtime errors.
- Release checks: JavaScript syntax, local imports, shared rules, matching version/protocol, archive contents and ZIP integrity.

These checks establish the implemented cycle and input behavior. Physical phones/controllers, production networking, deployment and human multiplayer balance were not tested.

## Upload

Upload the contents of `1_SERVER_REPO_UPLOAD` and `2_CLIENT_REPO_UPLOAD` to their respective repositories. Both sides must use protocol 108. After deploying, check the visible version or `version.json` for 2.14.1.
