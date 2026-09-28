import * as world from './world-geometry-rig.js?v=1.72.0';
import { createAuthoredWorldCollision } from './authored-world-collision.js?v=1.72.0';
export const {worldBlockerAt,worldBlockedAt,worldMoveBlockedAt,worldHeightExpansionBlockedAt,findTraversalCandidate,collisionDebugStats}=createAuthoredWorldCollision(world);
