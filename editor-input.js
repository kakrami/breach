import { GAMEPAD_BUTTON as B } from "./gamepad-input.js?v=2.1.0";
import { clamp } from "./builder-model.js?v=2.1.0";
// Screen navigation is independent of document tools. Editing actions share one dispatcher.
export function createEditorInput(e, active, panels) {
  const pointers = new Map();
  let gesture = null,
    pinch = null;
  const point = (ev) => {
    const r = e.stage.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };
  const stop = (ev) => {
    ev.preventDefault();
    ev.stopImmediatePropagation();
  };
  function cancel() {
    if (e.dragging) e.cancel();
    pointers.clear();
    gesture = null;
    pinch = null;
    e.state.lift = e.state.controllerLift = 0;
    e.gameRuntime.pauseInput();
  }
  function down(ev) {
    if (active() && e.gameRuntime.transformPointer?.("down", ev)) {
      stop(ev);
      return;
    }
    if (
      !active() ||
      e.panel ||
      e.state.camera !== "top" ||
      e.state.phase !== "edit"
    )
      return;
    stop(ev);
    const p = point(ev);
    pointers.set(ev.pointerId, p);
    e.stage.setPointerCapture(ev.pointerId);
    e.pointer = p;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      gesture = null;
      pinch = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
        camera: { ...e.camera },
      };
      return;
    }
    gesture = {
      id: ev.pointerId,
      start: p,
      last: p,
      pan: ev.button !== 0,
      moved: false,
      camera: { ...e.camera },
    };
    if (ev.button === 0 && ["terrain", "paint"].includes(e.state.tool)) {
      const hit = e.pick(e.gameRuntime.ray(p));
      if (hit && !hit.object) gesture.brush = [{ x: hit.x, z: hit.z }];
    }
  }
  function move(ev) {
    if (active() && e.gameRuntime.transformPointer?.("move", ev)) {
      stop(ev);
      return;
    }
    if (!active() || e.panel || e.state.camera !== "top") return;
    const p = point(ev);
    e.pointer = p;
    if (pointers.has(ev.pointerId)) {
      stop(ev);
      pointers.set(ev.pointerId, p);
    }
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()],
        distance = Math.hypot(a.x - b.x, a.y - b.y);
      e.camera.span = clamp(
        (pinch.camera.span * pinch.distance) / Math.max(1, distance),
        12,
        700,
      );
      const unit = pinch.camera.span / e.stage.getBoundingClientRect().height;
      e.camera.x = pinch.camera.x - ((a.x + b.x) / 2 - pinch.x) * unit;
      e.camera.z = pinch.camera.z - ((a.y + b.y) / 2 - pinch.y) * unit;
      return;
    }
    if (gesture?.id === ev.pointerId) {
      if (gesture.brush) {
        const hit = e.pick(e.gameRuntime.ray(p)),
          last = gesture.brush.at(-1);
        if (
          hit &&
          !hit.object &&
          Math.hypot(hit.x - last.x, hit.z - last.z) >
            Math.max(0.5, e.brush.radius * 0.1)
        )
          gesture.brush.push({ x: hit.x, z: hit.z });
        return;
      }
      gesture.moved ||=
        Math.hypot(p.x - gesture.start.x, p.y - gesture.start.y) > 7;
      if (gesture.moved) {
        const unit =
          gesture.camera.span / e.stage.getBoundingClientRect().height;
        e.camera.x = gesture.camera.x - (p.x - gesture.start.x) * unit;
        e.camera.z = gesture.camera.z - (p.y - gesture.start.y) * unit;
      }
    }
  }
  function up(ev) {
    if (active() && e.gameRuntime.transformPointer?.("up", ev)) {
      stop(ev);
      return;
    }
    if (!pointers.has(ev.pointerId)) return;
    stop(ev);
    pointers.delete(ev.pointerId);
    const brush = gesture?.brush;
    const tap =
      !brush &&
      gesture?.id === ev.pointerId &&
      !gesture.moved &&
      !gesture.pan &&
      !pinch;
    gesture = null;
    if (!pointers.size) pinch = null;
    if (e.stage.hasPointerCapture?.(ev.pointerId))
      e.stage.releasePointerCapture(ev.pointerId);
    if (brush) e.strokePath(brush);
    else if (tap) {
      e.pointer = point(ev);
      const multi = e.multiSelect;
      e.multiSelect = multi || !!ev.shiftKey;
      e.primary();
      e.multiSelect = multi;
    }
  }
  function cancelled(ev) {
    if (active() && e.gameRuntime.transformPointer?.("cancel", ev)) {
      stop(ev);
      return;
    }
    if (!pointers.has(ev.pointerId)) return;
    stop(ev);
    cancel();
  }
  function wheel(ev) {
    if (!active() || e.panel || e.state.camera !== "top") return;
    stop(ev);
    e.camera.span = clamp(e.camera.span * Math.exp(ev.deltaY * 0.001), 12, 700);
  }
  function key(ev) {
    if (!active()) return;
    if (panels.key(ev) || e.hud.key(ev)) {
      stop(ev);
      return;
    }
    if (e.panel) return;
    const k = ev.key.toLowerCase(),
      cmd = ev.ctrlKey || ev.metaKey;
    let action = null;
    if (cmd && k === "z") action = ev.shiftKey ? "redo" : "undo";
    else if (cmd && k === "s") action = "save";
    else if (cmd && k === "d") action = "copy";
    else if (k === "escape")
      action = e.transaction || e.roadPoints.length ? "cancel" : "menu";
    else if (k === "tab") action = "menu";
    else if (k === "e") action = "place";
    else if (k === "q") action = "pick";
    else if (k === "v") action = "select";
    else if (k === "r") action = "rotate";
    else if (k === "delete" || k === "backspace") action = "erase";
    else if (k === "pageup") action = "raise-object";
    else if (k === "pagedown") action = "lower-object";
    else if (k === "f") action = "overview";
    if (action) {
      stop(ev);
      if (!ev.repeat) e.action(action);
    }
  }
  function controller(frame, dt) {
    if (!active() || !frame?.connected) return false;
    if (e.hud.controller(frame)) {
      e.state.controllerLift = 0;
      return true;
    }
    const p = frame.pressed || [],
      s = e.state;
    s.controllerLift =
      s.phase === "edit" && !e.panel
        ? (frame.held?.[B.RB] ? 1 : 0) - (frame.held?.[B.LB] ? 1 : 0)
        : 0;
    if (p[B.MENU]) e.action("menu");
    else if (p[B.VIEW]) e.action("playtest");
    if (s.phase === "test") {
      if (p[B.RT]) e.primary();
      return true;
    }
    if (s.camera === "top") {
      const speed = e.camera.span * 0.5 * dt;
      e.camera.x += (frame.moveX || 0) * speed;
      e.camera.z += (frame.moveY || 0) * speed;
      e.camera.span = clamp(
        e.camera.span * Math.exp((frame.lookY || 0) * dt),
        12,
        700,
      );
      e.pointer = null;
    }
    if (p[B.RT] || p[B.A]) e.action("place");
    if (p[B.Y]) e.action(e.selected.size ? "edit" : "pick");
    if (p[B.B]) e.action("cancel");
    if (p[B.X]) e.action("rotate");
    if (p[B.DPAD_LEFT]) e.action(e.selected.size ? "nudge:x:-1" : "select");
    if (p[B.DPAD_RIGHT]) e.action(e.selected.size ? "nudge:x:1" : "pick");
    if (p[B.DPAD_UP]) e.action("raise-object");
    if (p[B.DPAD_DOWN]) e.action("lower-object");
    return true;
  }
  const listeners = [
    ["pointerdown", down],
    ["pointermove", move],
    ["pointerup", up],
    ["pointercancel", cancelled],
    ["lostpointercapture", cancelled],
    ["wheel", wheel],
  ];
  for (const [n, f] of listeners)
    e.stage.addEventListener(n, f, { capture: true, passive: false });
  window.addEventListener("keydown", key, true);
  window.addEventListener("blur", cancel);
  return {
    cancel,
    controller,
    destroy() {
      cancel();
      for (const [n, f] of listeners) e.stage.removeEventListener(n, f, true);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", cancel);
    },
  };
}
