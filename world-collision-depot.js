import * as world from './world-geometry-depot.js?v=1.74.0';
import { createAuthoredWorldCollision } from './authored-world-collision.js?v=1.74.0';
export const {worldBlockerAt,worldBlockedAt,worldMoveBlockedAt,worldHeightExpansionBlockedAt,findTraversalCandidate,collisionDebugStats}=createAuthoredWorldCollision(world);
