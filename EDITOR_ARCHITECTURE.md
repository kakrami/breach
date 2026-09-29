# Map Builder architecture and acceptance contract

The editor is a local game session, rendered by the game renderer. The document is the source of truth. The shared object catalog and geometry compiler produce the same visible parts and collision used by official maps, uploaded maps and the server.

## Workflow

Create opens a flat map with explicit team starts. Library choice enters Place with a translucent candidate. Select picks committed objects and shows Move / Rotate / Resize (when supported), Copy, Delete and Properties. Move and resize previews remain separate until Apply; Cancel and pointer cancellation discard previews. Terrain uses protected footprints and bounded slopes. Test temporarily switches to game physics and returns to the previous camera and tool. Save, Export and Publish serialize the committed document without changing it. Reopen imports the same asset IDs, transforms and groups.

## Ownership

- `builder-model.js`: document, compatibility, canonical compiler, validation and document operations. No camera, renderer or pointer controller.
- `editor-session.js`: one tool/camera/phase state, selection, preview transaction and history. Every document mutation commits atomically through the history pipeline.
- `editor-input.js`: pointer, keyboard and controller gestures dispatch session actions; no map mutation.
- `builder-hud.js` and `builder-panels.js`: canvas presentation, accessible action mirrors and panel descriptions.
- `client.js` game runtime bridge: actual world, camera, movement and collision. Both perspective and top camera render the same scene.

## Layout and input

Map menu/history at top left; Test and camera at top right. A compact bottom hotbar holds Select, Objects, Ground, recent assets and More. Context actions sit above the hotbar. The object library opens directly to thumbnail categories. Brush controls remain on the left with inline size/strength sliders; other settings use compact content-sized drawers. Editing uses an orbit target, yaw, pitch and zoom distance. Single-pointer drag orbits, two fingers pan/pinch, and tools own single-pointer edits. Walking and the game touch controls are confined to Test. Object height remains available through Move. Camera changes never choose tools. Place and Select are separately named and visibly marked. Keyboard, touch and controller actions use identical command entry points.

## Research / reuse

Godot's 3D workspace documents separate selection, transform modes, snapping, camera navigation and grouping: https://docs.godotengine.org/en/stable/tutorials/3d/introduction_to_3d.html
Three.js TransformControls implements scene-object transformation separately from the camera: https://threejs.org/docs/pages/TransformControls.html
The matching Three.js r185 addon is MIT licensed; its notice is included under vendor. The game renderer remains on its existing revision.

## Acceptance

No tool choice changes camera. No cancelled preview changes document/signature/history. Undo/redo covers object edits, terrain, settings and replacement/import. Committed geometry is compiled before publication to the game. Selection and placement use canonical parts. Test/export/publish do not silently repair maps. Client/server and lifecycle signatures must match. Canvas targets stay within safe areas and do not overlap. Actual-device and live-server verification must be reported separately from local tests.

Numeric adjustments use canvas sliders: drag previews a value, release commits once, cancellation/blur discards the draft. Controller LT focuses the toolbar, D-pad navigates or adjusts a focused slider, and B returns to world control. World movement pauses during toolbar focus.


## Navigation and paths, 2.3.0

The edit camera is independent of player position and every editing tool. Input arbitration owns complete gestures: pointer cancellation, blur, toolbar activation and a second finger roll back an interrupted stroke. Disconnected controllers cancel their pending stroke; idle connected controllers do not steal pointer input. Brush changes compile into a detached runtime for live preview, limited to ten refreshes per second, then commit as one history command on release. This still rebuilds world geometry during preview; lower-end device performance remains a release gate.

`road-path.js` is shared by client and server. Maps retain local path nodes, a smooth flag, width and transform. Paths expand into the same canonical road segments in both runtimes. The client clips surface and marking polygons against each underlying terrain triangle before generating vertices, avoiding interpolation across an unrelated ground triangle. Roads remain surface treatments on the canonical terrain collider. Markings are clipped at other road footprints. Legacy rectangles remain valid and become editable paths when Path is chosen. Move and Rotate preserve local path nodes; arbitrary length scaling is replaced by editing endpoints. Map Check samples the expanded road segments.


## Terrain application and supports, 2.3.0

Brush application integrates timestamped positions at 60 simulation steps per second; rendering is separately throttled. The initial tap adds one small application, and every mode continues during a hold. Rate controls terrain change per unit time. The detached document and runtime compile before replacing the visible revision; release commits one snapshot and cancellation restores the prior runtime.

`safe-terrain.js` applies independent local derivative bounds and exposes its exact protected footprints to the canvas overlay. Buildings, stairs/ramps/platforms and ladders retain required supporting samples. Roads, spawns and grounded props are no longer blanket exclusions. `terrain-support.js` is the common placement profile and blending implementation used by the document resolver and the client/server geometry compiler. Buildings use a level uphill base and a solid foundation down to the lowest footprint sample. Spawns have compact flat pads. Roads are terrain-conforming surface geometry, not terrain-flattening stamps. Existing map object identities and path definitions are retained.
