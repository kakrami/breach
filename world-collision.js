import * as world from './world-geometry.js?v=2.0.0';
import { createAuthoredWorldCollision } from './authored-world-collision.js?v=2.0.0';
export const {worldBlockerAt,worldBlockedAt,worldMoveBlockedAt,worldHeightExpansionBlockedAt,findTraversalCandidate,collisionDebugStats}=createAuthoredWorldCollision(world);
