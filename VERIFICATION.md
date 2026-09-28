# Breach 2.1.0 — verification and release status

This package is a release candidate. It has not been deployed to the public site. Client and server must be updated together (protocol 97).

## UI revision 2.1.0

Replaced the tool rail and oversized generic grids with a compact bottom hotbar, recent-object thumbnails, contextual object actions and a tabbed visual library. The map menu fits in one page at the tested landscape sizes. Terrain uses a surface-following brush ring and inline size/strength sliders. Numeric property fields also use sliders rather than a modal numeric keyboard. Cancelled slider drags never change document state. Settings drawers size to their contents. Controller LT offers focus access to all visible toolbar actions. Thumbnail caching waits for texture readiness and uses the correct output color space. The shared game HUD requests CPU-backed Canvas2D rasterization before each WebGL texture upload. Browser comparisons reproduced retained joystick pixels with GPU-backed drawing surfaces; the CPU-backed source cleared them in a normal screenshot run without diagnostic pixel reads or forced repainting. The existing canvas and renderer ownership are retained.

Desktop and emulated-touch browser passes include the new library, brush sliders, single-page map menu and the full placement/edit/test/save/publish/reopen workflow. These checks use a local server-sanitizer harness, not a production deployment.

## Rebuilt

The editor now has one session state, one command/history pipeline, detached transform previews, and independent camera and tool choices. It uses the game's scene, renderer, movement, input and collision. The previous walk-builder and builder-flow controllers and 2D editor renderer were removed. The object library is defined in the shared catalog. Asset IDs survive save/export/publish; old maps retain compatibility normalization.

Canvas controls provide Place, Select, Move, Rotate, supported Resize, object height, flight Up/Down, terrain tools, undo/redo, groups, properties, roads, starts, templates, import/export, Map Check, Test, save and publish. Test uses game movement and a projectile collision probe. Both camera views show the same world. Map Check runs canonical geometry validation in a worker. Collision overlays show player, projectile or both channels.

## Automated checks completed

- 2,489 geometry/lifecycle assertions, including 2,436 wall checks; four official/custom fixtures and shared client/server contracts.
- 48 movement sweeps covering standing, crouch/slide heights, floor seams, ceilings and doorway/window projectile openings, plus rotated/scaled pieces.
- All 34 library presets, detached previews, cancellation, history, import, terrain, roads/curves, starts, generation and attached ladder rotation/deletion.
- 3,760 main-workspace layout checks and 3,804 panel/keyboard/library checks for bounds, minimum 44-pixel targets and button overlap across narrow and desktop sizes.
- Input adapter checks for pointer cancellation, blur, held flight, multitouch, controller menu actions and teardown.
- Terrain drag commits once; interrupted strokes and two-finger camera gestures leave document/history unchanged.
- Spatial-index optimization preserves exact geometry/collision/terrain signatures against the previous compiler in ten fixtures.
- JavaScript syntax, local module dependency closure, release metadata and matching shared client/server sources.

## Actual browser checks

Headless Chromium with real WebGL2/software rendering exercised canvas controls for placement, selection, modification, undo/redo, camera switching, Test, save, publish, reopen and close. Desktop mouse dragging exercised the Three.js transform gizmo and cancellation. Touch emulation exercised joystick movement and interrupted flight holds. Actual game movement functions checked doorway traversal, sprinting into a wall, crouching, jumping and a projectile passing through a doorway.

The local API harness calls the shipped server sanitizers. It is not a live authenticated server or online multiplayer session. Browser setup uses test-only hooks which are not included in the shipped source.

## Collision laboratory

Use Map menu → Starting maps → Collision test map (replacement is undoable), or import `maps/collision-lab.breachmap.json`. The fixture contains 172 objects on a flat heightfield, all 34 library presets in rotated variations, scalable pieces, ladders and team starts. Its canonical signature is `06fa4d74`. Use the collision overlay and Test to inspect it.

## Remaining release gates

- Real Apple devices/Safari: touch gestures, safe areas, keyboard, WebGL context recovery and file import/export.
- Physical gamepads: bindings, focus recovery and device reconnect behavior.
- Live server: authentication, durable save/reopen, publish permissions and loading the published map into multiplayer play.
- Full hands-on collision laboratory traversal: mantle/climb, repeated slides, upper-floor impacts, seams/corners and deliberate escape attempts across every variation.
- Performance on intended lower-end devices and large user maps; committed edits currently rebuild the runtime world atomically.

These are unverified gates, not claims of known failure. Automated and emulated checks do not certify a defect-free release.

## Reused implementation and license

Three.js r185 TransformControls is included under its MIT license (`vendor/THREE-LICENSE.txt`), matching the game's renderer revision. Research and architecture references are recorded in `EDITOR_ARCHITECTURE.md`.
