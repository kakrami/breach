import { DEFAULT_MATCH_RULES } from './game-config.js?v=1.18.6';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function normalizeMatchState(value, now = Date.now(), rules = DEFAULT_MATCH_RULES) {
  const v = value && typeof value === 'object' ? value : {};
  const r = rules && typeof rules === 'object' ? rules : DEFAULT_MATCH_RULES;
  const scoreLimit = clamp(Math.floor(number(v.scoreLimit, number(r.scoreLimit, DEFAULT_MATCH_RULES.scoreLimit))), 5, 100);
  const timeLimitMs = clamp(Math.round(number(v.timeLimitMs, number(r.timeLimitMs, DEFAULT_MATCH_RULES.timeLimitMs))), 120000, 1800000);
  return {
    status: ['waiting','warmup','active','ended'].includes(v.status) ? v.status : 'waiting',
    round: Math.max(1, Math.floor(number(v.round, 1))),
    blueScore: Math.max(0, Math.floor(number(v.blueScore))),
    redScore: Math.max(0, Math.floor(number(v.redScore))),
    scoreLimit,
    timeLimitMs,
    warmupEndsAt: Math.max(0, number(v.warmupEndsAt)),
    startedAt: Math.max(0, number(v.startedAt)),
    endsAt: Math.max(0, number(v.endsAt)),
    endedAt: Math.max(0, number(v.endedAt)),
    restartAt: Math.max(0, number(v.restartAt)),
    winner: ['blue','red','draw'].includes(v.winner) ? v.winner : '',
    reason: String(v.reason || '').slice(0, 24),
    updatedAt: Math.max(0, number(v.updatedAt, now)),
  };
}
