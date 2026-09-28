import * as world from './world-geometry-yard.js?v=1.71.1';
import { createAuthoredWorldCollision } from './authored-world-collision.js?v=1.71.1';
export const {worldBlockerAt,worldBlockedAt,worldMoveBlockedAt,worldHeightExpansionBlockedAt,findTraversalCandidate,collisionDebugStats}=createAuthoredWorldCollision(world);
