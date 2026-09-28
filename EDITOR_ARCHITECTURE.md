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

Map menu/history at top left; Test and camera at top right. Editing tool rail at left; context actions at bottom; properties/library in a single right panel. Up/down retain game flight. Game touch movement/look is reused. Camera changes never choose tools. Place and Select are separately named and visibly marked. Keyboard, touch and controller actions use identical command entry points.

## Research / reuse

Godot's 3D workspace documents separate selection, transform modes, snapping, camera navigation and grouping: https://docs.godotengine.org/en/stable/tutorials/3d/introduction_to_3d.html
Three.js TransformControls implements scene-object transformation separately from the camera: https://threejs.org/docs/pages/TransformControls.html
The matching Three.js r185 addon is MIT licensed; its notice is included under vendor. The game renderer remains on its existing revision.

## Acceptance

No tool choice changes camera. No cancelled preview changes document/signature/history. Undo/redo covers object edits, terrain, settings and replacement/import. Committed geometry is compiled before publication to the game. Selection and placement use canonical parts. Test/export/publish do not silently repair maps. Client/server and lifecycle signatures must match. Canvas targets stay within safe areas and do not overlap. Actual-device and live-server verification must be reported separately from local tests.
