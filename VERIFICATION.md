# Breach 2.8.0 — landscape menu rebuild

Local release; not deployed. Preserve both repository folders. Protocol 102 is unchanged.

## Changes

- Landscape throughout the app: entry, lobby, menus, settings and match. Portrait displays a rotation gate; gameplay input is blocked until landscape returns.
- Fullscreen requested from the initiating gesture, followed by landscape locking when supported. Landscape remains requested when returning to the lobby. Manifest orientation is landscape.
- New horizontal lobby composition: actual map imagery, compact squad panels, integrated weapon preview, compact navigation and a single Deploy action.
- Real map and weapon renders shipped as local assets. Condensed display font bundled with its redistribution license.
- Maps, all five classes and all five killstreaks fit in horizontal galleries. Match uses a compact mode grid and rule controls.
- Weapon editor uses a larger interactive preview, six readable stats, attachment controls and paged choices.
- Main menu, roster, settings, host controls, text input and chat history use fixed layouts or explicit paging instead of scrolling. Map Builder remains a separate editing workspace.
- Player details open a focused panel instead of expanding roster rows. Large rosters page with both teams aligned.
- Version and cache keys updated together. Gameplay rules and network message schemas are unchanged.

## Verified locally

- Production client boot and actual Canvas2D renderer in headless Chromium, with no uncaught JavaScript errors.
- Rendered and visually inspected landscape screens at 667×375, 852×393, 932×430 and 1440×900.
- Actual touch event dispatch: bot counts, score limit, map selection, class editor, weapon selection, attachment tray, killstreak selection and Settings.
- Main lobby tabs: no registered scrolling regions, in-bounds hit targets and unobstructed Deploy button across those four viewport sizes.
- Large roster and Settings pagination, plus actual browser portrait gate and landscape return.
- Text editor layout and no scrolling at compact phone sizes.
- Deterministic session-shell checks: synchronous fullscreen request, request/lock ordering, standalone app mode, denied APIs, guest entry, portrait input blocking, initial rotation, mid-match rotation, pause/resume and landscape retained in lobby.
- JavaScript syntax and ZIP integrity.

## Remaining device validation

Browser checks use simulated local multiplayer state. No production multiplayer session or deployment was performed. Physical Android/iPhone rotation, Safari and hardware controller testing remain outstanding. If a browser refuses fullscreen or orientation locking, the rotation gate asks the player to turn the device manually.
