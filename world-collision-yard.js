import * as world from './world-geometry-yard.js?v=2.9.0';
import { createAuthoredWorldCollision } from './authored-world-collision.js?v=2.9.0';
export const {worldBlockerAt,worldBlockedAt,worldMoveBlockedAt,worldHeightExpansionBlockedAt,findTraversalCandidate,collisionDebugStats}=createAuthoredWorldCollision(world);
