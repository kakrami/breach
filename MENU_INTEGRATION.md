# Menu integration map

The existing canvas UI and gameplay state remain authoritative.

| Component | Responsibility |
| --- | --- |
| `game-menu.js` | Landscape layout, fixed card sizes, pagination, preview selection, native semantic controls |
| `client.js:createIntegratedMenuAdapter` | Lobby/class data, game actions, preference updates and host draft handling |
| `menu-scene.js` | Shared 3D preview renderer and thumbnail cache |
| `menu-equipment.js` | Equipment and killstreak display models |
| `native-layout.js` | Screen dispatch, physical hit geometry, input ownership, remaining game overlays |
| `app-lifecycle.js` | Entry, landscape gate, fullscreen and gameplay input lifecycle |

The integrated menu is used for the main menu, lobby, loadout, settings and host/player panels. The game retains its existing pause, connection, confirmation, text entry, HUD and Map Builder infrastructure.

The client and server folders must be uploaded to their respective existing repositories. Keep the two folders separate. Client entry points and existing gameplay file names are unchanged. Deploy the server using its existing Wrangler configuration, and publish the client with the repository's existing GitHub Pages process. The in-game version and `version.json` should both show 2.9.0 after deployment.
