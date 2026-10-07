import * as world from './world-geometry-yard.js?v=2.13.0';
import { createAuthoredWorldCollision } from './authored-world-collision.js?v=2.13.0';
export const {worldBlockerAt,worldBlockedAt,worldMoveBlockedAt,worldHeightExpansionBlockedAt,findTraversalCandidate,collisionDebugStats}=createAuthoredWorldCollision(world);
