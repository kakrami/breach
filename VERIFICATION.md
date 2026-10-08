# Breach 2.16.0 — Flow and feedback cleanup

Full client and server release, protocol 110. Upload the contents of both numbered folders to their respective repositories. This package has not been deployed.

## What changed

- Class selection in the editor opens that class's overview, including when tapping the currently selected class. Switching classes clears the previous equipment category, attachment selection, scroll offsets and temporary preview.
- The class name, four equipment cards and equipment editor share one panel. The equipment strip appears inside that panel while editing. The extra Overview/Loadout button and menu Use Class action are removed.
- The in-match loadout opens a class picker: select a class to queue it for the next spawn, or choose Edit to adjust it. Editing saved classes outside a match does not change the class selected for play.
- Killstreaks have a separate entry because they are shared across classes. The interface no longer implies that each class owns separate streak choices.
- Selecting equipment or an attachment saves it. Hover/controller focus only previews. Attachment leaders use model coordinates and follow rotation/zoom. Back closes each level in order; Settings returns to the exact editor context.
- Personal settings and host Cheats controls save when changed. Sliders preview during dragging and commit on release; keyboard/controller steps commit immediately. Apply/Cancel drafts and their obsolete controls are removed. Reset confirmation remains.
- The server now accepts authorized host tuning in the lobby as well as during a match. Field patches and revision acknowledgments keep pending controls from jumping backward. Unauthorized edits return the current authoritative settings.
- Repeated MISSED, CLAW HIT, SHIELD HIT, burning, pickup, selection and routine kill banners are removed. Combat retains impact visuals, hitmarkers, sound, status and the kill feed. Important round/role events and enemy streak warnings remain. Announcement queues are bounded and stale entries expire.
- Purchase feedback stays in the shop. Blocked actions give one short message near the relevant control. Infected utility controls are compact, duplicate role text and NO KIT are removed, and world markers are culled/prioritized instead of stacking against screen edges.
- Infected rosters use role labels. Infected bot names no longer retain obsolete Alpha/Bravo prefixes after conversion. Targeting-map colors use the shared self/friendly-human/friendly-bot/enemy relationship model.
- Pause-menu wording now says In Match: the online match continues. Fullscreen wording reflects current state. Settings navigation uses the shared lifecycle panel history.

## Verification performed for this release

The browser checks run the production client and actual worker code through a local in-memory room fixture. They use headless Chromium with emulated touch, mouse and controller actions; no production room is contacted.

- 14 menu/loadout/settings integration checks: class switching, same-class selection, direct saves, temporary previews, anchored leaders, Settings Back, reopen persistence, authorized and rejected host tuning, touch slider release, lobby class edits, in-match class selection, respawn/reconnect and repeated claw feedback.
- Layout inspection at 667×375, 844×390 and 932×430. Loadout editors remain within the viewport without page scrolling. Screenshots of class overview, gunsmith, class picker, host settings and Infected HUD were inspected.
- 17 Infected browser checks: every shop weapon, preparation/outbreak, role shops, controller focus/back, touch movement/fire/build/ping/pounce, conversion, automatic respawn, status visuals, final-minute music and results.
- 23 authoritative round-cycle checks: both victory conditions, armor/range/cover rules, inventory, queued classes, safe respawn, reconnect, late join, standard/Chaos restrictions and 24-player starts.
- 16 authoritative feature checks: four classes and abilities, first-infected bonus, inventory restrictions, bounded knockback, barricade collision/destruction, supply pickup/expiry, team-only pings, bot perception and safe-spawn candidates on five maps.
- 15 edge checks: fire/frost, grenade inventory, flare, Chaos, post-result purchase rejection, restart and last-infected disconnect, plus TDM, FFA, Moon, Waves and Sandbox warmup/movement regression checks.
- 272 attachment/tuning configurations across ten weapons: resolved gameplay rules, fixed factory comparisons, gain/loss intervals, inverse metrics, rounding and special weapon metrics.
- Shared lifecycle checks: fullscreen/landscape handling, denied browser APIs, standalone entry, guest entry, rotate/pause/resume, nested panel Back and cleared navigation history across sessions.
- Map-builder smoke checks: open, playtest, return to edit, export/import runtime geometry parity, dirty-exit protection and clean reopen.
- Release JavaScript syntax, local module imports, shared-module parity, version/protocol consistency and ZIP integrity.

Automated checks do not establish human multiplayer balance. Physical phones/controllers, Safari, real multi-device networking and production deployment were not tested. Map-builder publishing was not exercised against a live account.

## Upload

Keep the two-folder layout. Upload `1_SERVER_REPO_UPLOAD` to the server repository and `2_CLIENT_REPO_UPLOAD` to the client repository. Both must use protocol 110. After deployment, the title and `version.json` should show 2.16.0.
