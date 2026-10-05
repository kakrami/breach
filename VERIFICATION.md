# Breach 2.7.0 — canvas menu rebuild

This is a local review release, not a deployed build. Upload the two repository folders together when deployment is approved. Protocol remains 102; no network message schema changed.

## User interface

- The browser entrypoint contains the game canvas and menu canvas. Menus use a semantic widget graph, explicit responsive geometry, Canvas2D painting and shared input/focus. HTML controls, hidden text inputs, DOM/CSS menu measurement, the old canvas mirror and duplicated menu stylesheet are removed.
- Play combines hosting, room-code entry and room browsing. Front navigation opens saved loadouts, Builder and Settings.
- Lobby uses Players, Match, Maps and Loadout, with killstreaks nested under preparation. Roster inspection, bot/team actions, map/library selection, host tuning and the primary start action retain their server permissions.
- Loadout preserves Classes → Class → equipment/weapon → attachments, names, immediate saved selections, stat comparisons and interactive weapon previews. Match changes retain their existing next-spawn/equip-now behavior.
- Settings use explicit Apply/Cancel, including mute. Reset stages defaults. Fullscreen and developer recording/download/clear are explicitly separate immediate actions. Host gameplay/weapon tuning is staged; player/team actions remain immediate.
- Pause has Resume, Loadout, Players, Settings, host options and a confirmed Leave/Return action. Guests receive a read-only player roster with their permitted team action. Returning everyone to the lobby is explicitly identified in the host confirmation.
- Shops, scoreboard, all-player results, death/loadout actions, replay/status notices and strike targeting use shared canvas styling and hit geometry. Results retain all rows and support scroll. The shop owns input while open and buys on release/A instead of leaking input to gameplay.
- Chat and text entry are canvas-rendered. Physical keyboard input and in-game keys share the same data; no native text-selection surface exists. Menus support portrait and landscape, safe-area insets, bounded scrolling and keyboard/controller focus. Gameplay still requires landscape on touch devices; paused menus remain accessible in portrait.
- Builder uses the same drawing primitives, independent clipped scrolling and Objects / Ground / Tools / Properties / Map navigation. Its HUD and game renderer are sibling canvases. Selection, transforms, terrain/paint, roads, catalog/groups, generation, validation, save, publish, reopen, autosave recovery and unsaved-exit handling remain.
- Map file import/export were removed as requested. Existing saved maps and local saved data were not deleted. Draft save, reopen and publish remain. The former standalone Builder URL redirects into the integrated workspace.

## Input fixes

The rebuild includes pointer-context cancellation, focus restoration, slider/hold rollback, release-only menu activation, suppression of native selection/callout/context-menu behavior, controller-disconnect brush cancellation and failed-WebGL-start input release. Refreshing room browsing clears stale join validation. Canvas-only presentation does not itself establish compatibility with every Apple device; see the verification limits below.

## Preserved gameplay

Weapons, attachments, recoil, aiming, movement, collision, physics, AI, relationship colors and balance remain outside this redesign. The 2.6.2 Infection damage/conversion/refund behavior, boss telegraphs/recovery/weakpoints, Moon supply flybys/pickups and protocol-102 room behavior remain. UI ownership intentionally prevents movement/fire through a modal menu; it does not change simulation constants.

## Local checks

Verification includes actual production-module startup in a deterministic browser-API fixture, native widget/event/focus tests, renderer hit/scroll and responsive-layout checks, production action tests, all-player results, controller adapters, interrupted pointer gestures and Builder lifecycle tests against fixture APIs. Canvas2D raster previews were generated and inspected for desktop, phone portrait and short landscape layouts.

Existing regressions compare core gameplay with the earlier Git baselines and exercise role/economy preservation, shared geometry, server collision/routing, boss phases and Moon supply behavior. JavaScript parsing, import closure, in-process Worker startup/health/origin checks and extracted-package integrity checks are part of release validation.

## Not verified on hardware

The fixtures are not browser, multiplayer or physical-controller tests. Real WebGL rendering, Safari/iPhone/iPad behavior, physical Xbox controllers, IME, live WebSockets, Durable Object persistence and low-end device performance remain unverified here. Local Chromium could not launch because its socket creation was denied; the available cloud browser reports disabled WebGL.

Before deployment, test long holds and multitouch on Apple devices, keyboard/controller navigation through every menu, rotation and interruption during edits, game start failure/recovery, lobby return/reconnect, Builder Test and transform capture, and live two-client gameplay. Confirm that saved maps reopen and publish correctly against the intended server. No claim of physical-device acceptance is made by this package.
