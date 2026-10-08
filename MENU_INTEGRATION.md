# Menu and gameplay integration — 2.19.0

The canvas widget graph and live game state remain authoritative. Menus use the game's renderer and input ownership.

| Component | Responsibility |
| --- | --- |
| game-menu.js | Class overview/editor/picker presentation, temporary focus previews, direct activation, menu navigation and slider gestures |
| client.js:createIntegratedMenuAdapter | Existing loadout commit paths, per-weapon preferences, automatic settings saves, minimal host patches and authoritative acknowledgments |
| app-lifecycle.js | Fullscreen/landscape gates, gameplay input ownership and nested settings/loadout panel history |
| armory-stats.js | Actual weapon metrics, fixed factory comparisons and per-metric scales |
| game-config.js:resolveWeaponRules | Shared client/server tuning and attachment resolution |
| menu-scene.js | Shared 3D renderer, weapon framing and projected attachment anchors |
| weapon-models.js / battle-rifle.js | Shared arsenal geometry, fitted components and mechanical poses for play and neutral previews |
| native-layout.js | Canvas hit testing, preview gestures, hover, safe-area layout and shared text/chat keyboard |
| match-menu-ui.js | Scoreboard/results, paging and role shops |
| team-model.js | Self lime, friendly human green, friendly bot blue and enemy red |
| worker.js | Authoritative loadout/class commits, host permissions and settings acknowledgments |

## Class editing and play selection

Class cards always open an overview and reset temporary equipment/attachment state. The class header and editor belong to one panel. Overview equipment cards enter the appropriate editor; the equipment strip switches categories inside that panel. Back returns to overview and then the parent screen.

Saved class edits use the existing loadout commit path. Outside a match, editing does not activate a class for play. In a match, the class picker exposes selection separately from Edit; selection queues the class through the existing server path. Infected retains its role-specific Armory and authoritative class purchases/selection.

Killstreaks are shared across classes and have a separate editor entry. Hover/controller focus never commits a weapon, attachment, equipment item or shop purchase. A click/tap/controller activation commits once. Per-weapon attachment preferences are normalized through shared rules and never replace authoritative match state on receipt.

Attachment leaders use projected 3D anchors from the same model as the preview. They update with rotation and zoom. Stats compare the full selected build with that weapon's factory build under current match tuning; their existing values and fixed comparison scales are retained.

## Settings and host tuning

Personal discrete settings save immediately. Slider movement has a transient preview; release commits. Keyboard/controller steps commit immediately. Back flushes any remaining personal preview and restores the previous panel. Graphics rebuild only when their setting changes.

Host slider preview is local and sends one minimal field patch on release. Pending values remain visible until their revision is acknowledged. The server validates host permission in lobby and match, normalizes the patch, and broadcasts accepted authoritative settings with the revision. Rejection returns the authoritative state. Reset sends default gameplay and weapon tuning; it does not reset player permissions. Player permissions use their existing authoritative action path.

Menu Apply/Cancel drafts and unsaved-settings prompts are removed. Destructive reset confirmations and map-builder edit transactions retain their distinct purpose.

## Gameplay feedback

Routine combat uses existing sound, impacts, hitmarkers, status and kill feed. Important role/round events and deployed enemy streak warnings use bounded, expiring announcements. Purchase errors remain in the shop; blocked actions use a single short message near the relevant control. Infected world markers preserve projected position, avoid major controls, hide offscreen markers and limit overlapping labels.

Existing Infection mechanics, dynamic geometry, inventories, collision, safe spawns and bot navigation remain in their shared/server modules. The arsenal release retains this menu flow and the host-settings acknowledgment contract. Both upload folders use version 2.19.0 and protocol 113. See VERIFICATION.md for the checks and limits.
