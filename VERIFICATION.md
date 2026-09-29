# Breach 2.4.0 — verification and release status

This is a release candidate, not a public deployment. Update both supplied folders together: protocol 99 preserves the new road path contract.

## Terrain and support revision

The brush engine now integrates elapsed time at a fixed simulation step. Raise, Lower, Flatten and Smooth have a Rate control, an immediate tap application and continuous stationary holds. Flatten retains the stroke's starting height. Per-sample slope limits replace the global multiplier that could stop an entire stroke. Structures protect only their required terrain interpolation footprint, outlined in orange. Brush size is bounded by the terrain grid resolution so a small brush cannot miss all editable samples. No-op strokes report why ground did not change and do not add undo entries. Backgrounding or hiding the page cancels an active stroke.

Shared `terrain-support.js` selects a level building base from the uphill footprint samples, blends a supported pad into surrounding terrain and generates a solid foundation extending to the lowest sampled ground. The rendered terrain triangles remain flat throughout the interior, including rotated footprints. Spawns follow a compact level pad. Grounded props follow their support surface; stairs/ramps use their low endpoint consistently in editor and runtime. Roads conform to sculpted ground without locking or flattening the entire road footprint. Steep building/prop placement, buried ramps and obstructed starts receive invalid previews.

Save and Publish operations are sequenced so a Publish requested during an in-progress Save is not silently discarded. A map replacement cancels the queued operation through the document epoch check.

Additional checks passed: all four stationary holds in actual Chromium mouse and emulated-touch input; equal-duration strokes at 15 and 60 simulation/render schedules; independent local slope constraints; spawn height/walkability; both sculpt/place orders; rotated interior flatness and foundation stability; export/import and delete/undo collider identity; steep-placement rejection. Save/publish/reopen passed in the local server-sanitizer harness. Real game movement at a sloped building site passed doorway traversal, wall sprint collision and jumping-wall collision. Forty-eight additional sloped-site movement checks supplement the original 48 flat-ground checks.

The full physical-device and all-object collision-laboratory release gates below remain open. These tests establish the listed cases, not exhaustive certification of every possible map.

## Changes

- Edit mode uses orbit, pan and anchored pinch/wheel zoom. Player movement is reserved for Test. Touching an object selects it; active placement/terrain tools own their gestures. Camera changes never select a different tool. Move still provides object height controls.
- Terrain and ground paint follow the dragging finger/pointer. The runtime preview updates before release; a completed stroke produces one undo entry. Cancellation, blur, toolbar activation and a second finger discard the interrupted stroke. Two fingers then navigate. Controller sticks pan/orbit, bumpers zoom and RT holds the brush; disconnect cancels the stroke.
- Roads are saved paths with editable points, smooth curves, midpoint bend handles, endpoint extension, width and transform. Finish commits the path once. Legacy rectangular roads can also be edited as paths. Move/Rotate preserve path coordinates. Map Check follows expanded paths.
- Road surfaces and markings are split along the exact terrain triangles. This addresses ground protruding between mismatched surface triangles. Markings are clipped at other road footprints; curved sections share a continuous dash phase.
- Existing shared catalog, geometry/collision, command history, canvas UI, object selection/transforms, height, undo/redo, import/export, templates, Test, save and publish remain available.

## Verified for this revision

- Actual headless Chromium/WebGL2 mouse and emulated-touch sessions: orbit/zoom without moving the player; live brush preview, one-command undo, interrupted-stroke cancellation; road drawing, handle reshaping, surface selection, save, publish and reopen. No page JavaScript errors occurred in successful runs.
- Full desktop application regression: library, object placement, selection, transform gizmo/cancellation, nudge, apply, undo/redo, camera toggle, game Test movement, save, publish, reopen and close. Game movement checks exercised doorway traversal, sprinting into a wall, crouching, jumping and a projectile through the doorway.
- 4,880 generated road triangles checked at multiple interior points on flat and uneven terrain. Their interpolated heights match the underlying canonical terrain plus the surface offset. Path shape, smoothness and width survive client/server sanitization and reopen; undo/redo, move/rotate and cancellation preserve path identity.
- 2,489 geometry/lifecycle assertions, including 2,436 wall checks and official/custom parity fixtures; 48 movement sweeps.
- Session regression across 34 presets, detached previews, history, import, terrain, roads, starts, mounds, generation and attached ladders.
- 3,528 workspace layout checks and 3,804 panel/library/input checks, plus road toolbar cases, for bounds, target sizes and overlap. Pointer/controller adapter checks cover cancellation, idle-controller ownership and disconnect.
- JavaScript syntax, dependency closure, matching client/server shared modules and version/protocol consistency.

Browser save/publish tests use a local API harness with the shipped server sanitizers. They do not constitute a live authenticated production-server test. Test hooks and QA files are excluded from the two release folders.

## Remaining release gates

- Real Apple/Safari devices: gestures, safe areas, keyboard, graphics recovery and file import/export.
- Physical controllers, including focus recovery and reconnect behavior.
- Live server authentication, durable storage, publish permissions and published-map multiplayer loading.
- Full hands-on collision laboratory course: mantle/climb, repeated slides, upper-floor impacts, seams, corners and escape attempts across every variation.
- Performance on intended lower-end devices and large maps. Brush previews are throttled, but still rebuild the affected runtime through the existing whole-world rebuild path.

These checks remain unverified; this package is not certified defect-free or production-ready. The collision laboratory remains available under Starting maps and `maps/collision-lab.breachmap.json`.

## Reuse

The editor continues using the game's renderer, assets and collision. Three.js r185 TransformControls is MIT licensed; see `vendor/THREE-LICENSE.txt`. Architecture and research references are in `EDITOR_ARCHITECTURE.md`.
