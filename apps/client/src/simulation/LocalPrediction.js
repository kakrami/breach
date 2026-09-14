import { cloneInputFrame, clonePlayer } from "../../../../packages/shared/src/player.js";
import { CLIENT_FIXED_STEP, MOVEMENT, simulatePlayerMovement } from "../../../../packages/simulation/src/movement.js";
export class LocalPrediction {
    authoritative = null;
    predicted = null;
    pending = [];
    nextSeq = 1;
    sentThroughSeq = 0;
    setAuthoritative(player) {
        const previous = this.predicted;
        const lifeReset = !this.authoritative || this.authoritative.lifeId !== player.lifeId || this.authoritative.life !== player.life;
        this.authoritative = clonePlayer(player);
        const ack = player.movement.lastProcessedInputSeq;
        while (this.pending.length && this.pending[0].seq <= ack)
            this.pending.shift();
        if (lifeReset) {
            this.pending.length = 0;
            this.sentThroughSeq = ack;
            this.nextSeq = ack + 1;
        }
        else {
            this.nextSeq = Math.max(this.nextSeq, ack + 1, (this.pending.at(-1)?.seq ?? ack) + 1);
            this.sentThroughSeq = Math.max(this.sentThroughSeq, ack);
        }
        let replay = clonePlayer(player);
        if (replay.life === "alive") {
            for (const frame of this.pending)
                replay = simulatePlayerMovement(replay, frame, CLIENT_FIXED_STEP);
        }
        this.predicted = replay;
        return {
            correctedDistance: previous ? Math.hypot(previous.transform.x - replay.transform.x, previous.transform.y - replay.transform.y, previous.transform.z - replay.transform.z) : 0,
            acknowledgedSeq: ack,
            pendingCount: this.pending.length,
            lifeReset
        };
    }
    predict(action) {
        const current = this.predicted;
        if (!current || current.life !== "alive" || !current.connected)
            return null;
        const yaw = wrapAngle(current.transform.yaw - action.lookX);
        const pitch = clamp(current.transform.pitch - action.lookY, -MOVEMENT.maxPitch, MOVEMENT.maxPitch);
        const frame = {
            seq: this.nextSeq++,
            moveX: action.moveX,
            moveY: action.moveY,
            yaw,
            pitch,
            jumpPressed: action.jumpPressed,
            sprintHeld: action.sprintHeld,
            crouchHeld: action.crouchHeld
        };
        this.pending.push(frame);
        this.predicted = simulatePlayerMovement(current, frame, CLIENT_FIXED_STEP);
        return cloneInputFrame(frame);
    }
    unsentBatch(maxFrames = 12) {
        return this.pending.filter((frame) => frame.seq > this.sentThroughSeq).slice(0, maxFrames).map(cloneInputFrame);
    }
    markSent(lastSeq) {
        this.sentThroughSeq = Math.max(this.sentThroughSeq, lastSeq);
    }
    markAllUnsent() {
        const ack = this.authoritative?.movement.lastProcessedInputSeq ?? 0;
        this.sentThroughSeq = ack;
    }
    state() {
        return this.predicted ? clonePlayer(this.predicted) : null;
    }
    pendingCount() {
        return this.pending.length;
    }
    clear() {
        this.authoritative = null;
        this.predicted = null;
        this.pending.length = 0;
        this.nextSeq = 1;
        this.sentThroughSeq = 0;
    }
}
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function wrapAngle(value) {
    let n = value;
    while (n > Math.PI)
        n -= Math.PI * 2;
    while (n < -Math.PI)
        n += Math.PI * 2;
    return n;
}
