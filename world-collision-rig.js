import * as world from './world-geometry-rig.js?v=2.8.0';
import { createAuthoredWorldCollision } from './authored-world-collision.js?v=2.8.0';
export const {worldBlockerAt,worldBlockedAt,worldMoveBlockedAt,worldHeightExpansionBlockedAt,findTraversalCandidate,collisionDebugStats}=createAuthoredWorldCollision(world);
