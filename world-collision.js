import * as world from './world-geometry.js?v=2.6.2';
import { createAuthoredWorldCollision } from './authored-world-collision.js?v=2.6.2';
export const {worldBlockerAt,worldBlockedAt,worldMoveBlockedAt,worldHeightExpansionBlockedAt,findTraversalCandidate,collisionDebugStats}=createAuthoredWorldCollision(world);
