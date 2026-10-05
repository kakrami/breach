import * as world from './world-geometry.js?v=2.7.1';
import { createAuthoredWorldCollision } from './authored-world-collision.js?v=2.7.1';
export const {worldBlockerAt,worldBlockedAt,worldMoveBlockedAt,worldHeightExpansionBlockedAt,findTraversalCandidate,collisionDebugStats}=createAuthoredWorldCollision(world);
