# Breach 2.9.0 — integrated native menus

This package contains the game with the approved menu integrated. It is not a standalone menu demo. It has not been deployed to GitHub Pages or the production Worker.

## Integration

- `game-menu.js` draws the landscape interface into the existing UI canvas. Its semantic widgets use the game's input ownership, keyboard, controller and touch infrastructure.
- The adapter in `client.js` reads live game state and invokes the existing game actions and network messages. It does not create a second player, room or loadout store.
- `menu-scene.js` uses a single offscreen WebGL renderer. Weapon and attachment previews use the actual game model builders. `menu-equipment.js` supplies the approved equipment and killstreak display models.
- Players, match rules, maps, five loadout classes, attachment comparisons, equipment, killstreaks, settings and host controls are connected to the game.
- Alpha and Bravo have inline bot controls and direct team switching. Rosters page at a stable row size when capacity is exceeded.
- Attachment selection previews the model and stat changes before Equip. Changing a class or weapon clears any stale comparison.
- Host tuning and player permissions use Apply / Cancel. Leaving with changes presents an explicit apply/discard choice. Settings use the game's real ranges, defaults and preferences; numeric settings support direct slider dragging and precise steps.
- Portrait remains blocked throughout menus and gameplay. Match start requests fullscreen from the initiating gesture and requests landscape locking where supported. Unsupported orientation APIs retain the rotate gate.
- Visible version, import cache keys, version.json, shared version exports and Worker package metadata are 2.9.0. Wire protocol remains 102.

## Verification

- Production client booted in headless Chromium without uncaught JavaScript errors.
- Touch/mobile browser emulation confirmed fullscreen=true, landscapeReady=true and canPlay=true immediately after the real server matchReset response.
- Actual canvas hit testing exercised bot controls, team switching, score limits, attachment preview/equip, equipment, host tuning, settings slider dragging and Apply/Cancel, unsaved-change confirmation and keyboard navigation.
- All ten weapons and every compatible attachment preview rendered using the game models.
- Menu layouts checked at 667×375, 844×390, 932×430 and 1440×900: no menu scroll regions or offscreen hit targets.
- Host and guest controls, maximum bot counts, stable roster pagination, portrait blocking and return to landscape checked.
- The Start Match control produced a complete startMatch message after input preparation.
- The real Worker GameRoom handler accepted the generated loadout and start payloads. It preserved class/tuning choices, created the expected bot counts, handled team and God/admin changes, rejected guest start/tuning requests, and accepted live host tuning.
- The actual Worker matchReset response was delivered to the client, which entered the match and accepted gameplay input.
- Session-shell checks cover synchronous fullscreen requests, orientation lock ordering, denied APIs, installed app mode, guest entry, mid-match rotation, pause/resume and return to the lobby.
- JavaScript syntax, shared client/server metadata and archive integrity checked.

## Device and deployment limits

Automated browser checks do not replace testing on physical iOS/Android devices. Browser fullscreen/orientation support differs by platform. The production GitHub Actions pipeline, GitHub Pages deployment and live Worker connectivity were not exercised by these local checks.
