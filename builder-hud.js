// Presentation and hit testing only. All edits go through the builder's command stack.
// Layout is shared by painting, pointer input, keyboard focus and controller focus.
import { GAMEPAD_BUTTON as B } from "./gamepad-input.js?v=2.1.0";
const inside = (p, r) =>
  p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
export function hudLayout(w, h, model, insets = {}) {
  const left = insets.left || 0,
    right = insets.right || 0,
    top = insets.top || 0,
    bottom = insets.bottom || 0;
  if (left || right || top || bottom) {
    const l = hudLayout(w - left - right, h - top - bottom, model);
    for (const list of [l.buttons, l.panels, l.labels])
      for (const r of list) {
        r.x += left;
        r.y += top;
      }
    return l;
  }
  const buttons = [],
    panels = [],
    labels = [],
    m = 10,
    gap = 4,
    narrow = w < 600;
  const add = (id, label, x, y, bw = 44, bh = 44, extra = {}) =>
    buttons.push({ id, label, x, y, w: bw, h: bh, ...extra });
  const label = (text, x, y, maxWidth, align = "center") =>
    labels.push({ text, x, y, maxWidth, align });
  const row = (items, y, max = 76) => {
    const bw = Math.min(
        max,
        (w - 20 - (items.length - 1) * gap) / items.length,
      ),
      total = items.length * bw + (items.length - 1) * gap;
    items.forEach((it, i) =>
      add(
        it[0],
        it[1],
        (w - total) / 2 + i * (bw + gap),
        y,
        bw,
        44,
        it[2] || {},
      ),
    );
  };
  const slider = (id, title, value, min, max, step, x, y, bw) =>
    add(id, title, x, y, bw, 48, { slider: true, value, min, max, step });
  add("menu", "☰", m, m, 44, 44, { aria: "Map menu" });
  add("undo", "↶", 58, m, 44, 44, { aria: "Undo", disabled: !model.undo });
  add("redo", "↷", 106, m, 44, 44, { aria: "Redo", disabled: !model.redo });
  add("overview", model.overview ? "Walk" : "Top", w - 126, m, 56, 44, {
    aria: "Change camera",
    disabled: !model.building,
  });
  add("playtest", model.building ? "Test" : "Edit", w - 66, m, 56, 44, {
    accent: !model.building,
    disabled: !!model.pending,
  });
  if (w >= 600) label(model.modeLabel || "SELECT", w / 2, 32, w - 300);
  if (model.building) {
    if (!model.overview) {
      add("up", "↑", w - 54, 72, 44, 44, { hold: 1, aria: "Fly up" });
      add("down", "↓", w - 54, 120, 44, 44, { hold: -1, aria: "Fly down" });
    }
    const isBrush = ["terrain", "paint"].includes(model.mode),
      barY = h - 56;
    const base = [
      [
        "select",
        "Select",
        {
          selected: ["select", "move", "rotate", "scale"].includes(model.tool),
        },
      ],
      ["pick", "Objects", { selected: model.placing }],
      ["terrain", "Ground", { selected: isBrush }],
    ];
    const recent = (model.quick || []).slice(
      0,
      Math.max(0, Math.min(4, Math.floor((w - 20) / 60) - 4)),
    );
    const hotbar = [
      ...base,
      ...recent.map((o, i) => [
        "quick:" + i,
        o.label,
        { thumbnail: o.thumbnail, quick: true },
      ]),
      ["tools", "More"],
    ];
    row(hotbar, barY, 64);
    if (model.pending) {
      row(
        [
          ["apply", "Apply", { accent: true, disabled: !model.valid }],
          ["cancel", "Cancel"],
        ],
        h - 106,
        88,
      );
    } else if (model.selected) {
      row(
        [
          ["move", "Move", { selected: model.tool === "move" }],
          ...(model.rotatable
            ? [["rotate-tool", "Rotate", { selected: model.tool === "rotate" }]]
            : []),
          ...(model.resizable
            ? [["scale-tool", "Size", { selected: model.tool === "scale" }]]
            : []),
          ["copy", "Copy"],
          ["erase", "Delete"],
          ["edit", "More"],
        ],
        h - 106,
        64,
      );
    } else if (model.placing) {
      row(
        [
          ["rotate", "Rotate"],
          ["place", "Place", { accent: true, disabled: !model.valid }],
          ["done", "Cancel"],
        ],
        h - 106,
        80,
      );
    } else if (!isBrush) {
      row(
        [
          ["multi", "Multi", { selected: model.multi }],
          ["snap-toggle", "Snap", { selected: model.snap }],
        ],
        h - 106,
        64,
      );
    }
    if (model.selected || model.pending) {
      const controls =
        model.tool === "rotate"
          ? [
              ["turn-left", "−15°"],
              ["turn-right", "+15°"],
            ]
          : model.tool === "scale"
            ? [
                ["scale-down", "Smaller"],
                ["scale-up", "Larger"],
              ]
            : [
                ["nudge:x:-1", "←"],
                ["nudge:z:-1", "↑"],
                ["nudge:z:1", "↓"],
                ["nudge:x:1", "→"],
                ...(model.vertical
                  ? [
                      ["raise-object", "Lift"],
                      ["lower-object", "Lower"],
                    ]
                  : []),
              ];
      row(controls, h - 156, 52);
    } else if (isBrush) {
      const brush = model.brush || { radius: 6, power: 0.35, tool: "raise" };
      const bx = 10,
        bw = 212,
        by = 64;
      panels.push({
        x: bx - 4,
        y: by - 4,
        w: bw + 8,
        h: model.mode === "terrain" ? 154 : 102,
      });
      if (model.mode === "terrain")
        ["raise", "lower", "smooth", "level"].forEach((t, i) =>
          add(
            "brush-tool:" + t,
            t === "level" ? "Flatten" : t[0].toUpperCase() + t.slice(1),
            bx + i * 54,
            by,
            50,
            44,
            { selected: brush.tool === t },
          ),
        );
      else add("brush-settings", "Ground material", bx, by, bw, 44);
      slider("brush-radius", "Size", brush.radius, 2, 30, 2, bx, by + 48, bw);
      if (model.mode === "terrain")
        slider(
          "brush-power",
          "Strength",
          brush.power || 0.35,
          0.1,
          1,
          0.1,
          bx,
          by + 100,
          bw,
        );
      row(
        [
          ["place", model.primary || "Paint", { accent: true }],
          ["brush-settings", "Options"],
          ["done", "Done"],
        ],
        h - 106,
        80,
      );
    }
    if (model.tip && !isBrush && h >= 450)
      label(
        model.tip,
        w / 2,
        h - (model.selected || model.pending ? 174 : 122),
        w - 40,
      );
  } else add("place", "Fire test", w - 100, h - 104, 90, 44, { accent: true });
  if (!model.overview && !model.panel) label("+", w / 2, h / 2, 20);
  if (model.panel) {
    buttons.length = panels.length = labels.length = 0;
    const p = model.panel,
      keyboard = p.kind === "keyboard",
      library = p.kind === "library";
    const pw = keyboard
      ? Math.min(600, w - 20)
      : library
        ? Math.min(650, w - 20)
        : Math.min(320, w - 20);
    const px = library || keyboard ? (w - pw) / 2 : w - 10 - pw;
    if (keyboard) {
      const chars = p.numeric
        ? "1234567890.-"
        : p.digits
          ? "1234567890.-_"
          : "qwertyuiopasdfghjklzxcvbnm";
      const keys = [...chars].map((ch) => [
        "text:" + (p.caps ? ch.toUpperCase() : ch),
        p.caps ? ch.toUpperCase() : ch,
      ]);
      if (!p.numeric)
        keys.push(
          ["text:digits", p.digits ? "ABC" : "123"],
          ["text:caps", "Shift"],
          ["text:space", "Space"],
        );
      keys.push(
        ["text:back", "⌫"],
        ["text:cancel", "Cancel"],
        ["text:done", "Done"],
      );
      const cols = Math.max(1, Math.floor((pw - 16) / 48)),
        rows = Math.ceil(keys.length / cols),
        ph = 80 + rows * 48,
        py = Math.max(10, (h - ph) / 2),
        kw = (pw - 16 - (cols - 1) * 4) / cols;
      panels.push({ x: px, y: py, w: pw, h: ph });
      label(p.title, px + 12, py + 22, pw - 24, "left");
      label((p.value || "") + "│", px + 12, py + 55, pw - 24, "left");
      keys.forEach(([id, text], i) =>
        add(
          id,
          text,
          px + 8 + (i % cols) * (kw + 4),
          py + 76 + Math.floor(i / cols) * 48,
          kw,
          44,
          { accent: id === "text:done" },
        ),
      );
    } else {
      const tabs = p.tabs || [],
        primaryItems = p.primaryPair ? (p.items || []).slice(0, 2) : [],
        primaryH = primaryItems.length ? 48 : 0,
        items = p.primaryPair ? (p.items || []).slice(2) : p.items || [],
        cols = library ? Math.max(2, Math.floor((pw - 20) / 104)) : 1,
        rowH = library ? 98 : 48;
      const tabRows = library
        ? Math.ceil(tabs.length / Math.max(3, Math.floor((pw - 16) / 80)))
        : 0;
      const lines = [];
      let line = "";
      for (const word of (p.description || "").split(/\s+/)) {
        if ((line + " " + word).length > Math.floor((pw - 24) / 7) && line) {
          lines.push(line);
          line = word;
        } else line += (line ? " " : "") + word;
      }
      if (line) lines.push(line);
      const maxLines = Math.max(1, Math.floor((h - 180) / 18)),
        textPages = Math.max(1, Math.ceil(lines.length / maxLines));
      const offset =
        56 + primaryH + tabRows * 48 + Math.min(lines.length, maxLines) * 18;
      const reserve =
        items.length >
          Math.max(1, Math.floor((h - 24 - offset - 8) / rowH)) * cols ||
        textPages > 1
          ? 48
          : 8;
      const rows = Math.max(1, Math.floor((h - 24 - offset - reserve) / rowH)),
        perPage = rows * cols,
        pages = textPages - 1 + Math.max(1, Math.ceil(items.length / perPage)),
        page = Math.min(model.page || 0, pages - 1);
      const shown =
        page < textPages - 1
          ? []
          : items.slice(
              (page - textPages + 1) * perPage,
              (page - textPages + 2) * perPage,
            );
      const shownLines = lines.slice(
        Math.min(page, textPages - 1) * maxLines,
        (Math.min(page, textPages - 1) + 1) * maxLines,
      );
      const ph = Math.min(
        h - 20,
        56 +
          primaryH +
          tabRows * 48 +
          shownLines.length * 18 +
          Math.ceil(shown.length / cols) * rowH +
          (pages > 1 ? 48 : 8),
      );
      const py = library ? Math.max(10, h - ph - 10) : 10;
      panels.push({ x: px, y: py, w: pw, h: ph });
      label(p.title, px + 12, py + 26, pw - 68, "left");
      add("close", p.back ? "‹" : "×", px + pw - 48, py + 4, 44, 44, {
        aria: p.back ? "Back" : "Close",
        disabled: p.title === "Working…",
      });
      const tc = Math.max(3, Math.floor((pw - 16) / 80)),
        tw = (pw - 16 - (tc - 1) * 4) / tc;
      tabs.forEach((it, i) =>
        add(
          it.id,
          it.label,
          px + 8 + (i % tc) * (tw + 4),
          py + 52 + Math.floor(i / tc) * 48,
          tw,
          44,
          it,
        ),
      );
      shownLines.forEach((text, i) =>
        label(text, px + 12, py + 64 + tabRows * 48 + i * 18, pw - 24, "left"),
      );
      primaryItems.forEach((it, i) =>
        add(
          it.id,
          it.label,
          px + 8 + (i * (pw - 12)) / 2,
          py + 56,
          (pw - 20) / 2,
          44,
          it,
        ),
      );
      const sy = py + 56 + primaryH + tabRows * 48 + shownLines.length * 18,
        cw = (pw - 16 - (cols - 1) * 4) / cols;
      shown.forEach((it, i) =>
        add(
          it.id,
          it.label,
          px + 8 + (i % cols) * (cw + 4),
          sy + Math.floor(i / cols) * rowH,
          cw,
          rowH - 4,
          it,
        ),
      );
      if (pages > 1) {
        add("previous", "‹", px + 8, py + ph - 48, 44, 44, {
          disabled: page === 0,
        });
        add("next", "›", px + pw - 52, py + ph - 48, 44, 44, {
          disabled: page === pages - 1,
        });
        label(`${page + 1} / ${pages}`, px + pw / 2, py + ph - 26, 100);
      }
    }
  }
  return { buttons, panels, labels };
}
function box(c, r, fill, stroke) {
  c.beginPath();
  c.roundRect(r.x, r.y, r.w, r.h, 7);
  c.fillStyle = fill;
  c.fill();
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = 1;
    c.stroke();
  }
}
function toolIcon(c, id, x, y) {
  if (
    ![
      "select",
      "pick",
      "terrain",
      "tools",
      "move",
      "rotate-tool",
      "scale-tool",
      "copy",
      "erase",
      "edit",
    ].includes(id)
  )
    return false;
  c.save();
  c.translate(x, y);
  c.lineWidth = 1.6;
  c.strokeStyle = c.fillStyle;
  c.lineJoin = "round";
  c.beginPath();
  if (id === "select") {
    c.moveTo(-6, -8);
    c.lineTo(-6, 8);
    c.lineTo(-1, 3);
    c.lineTo(4, 8);
    c.lineTo(7, 5);
    c.lineTo(2, 0);
    c.lineTo(9, 0);
    c.closePath();
  } else if (id === "pick") {
    for (const [x, y] of [
      [-8, -8],
      [2, -8],
      [-8, 2],
      [2, 2],
    ])
      c.rect(x, y, 6, 6);
  } else if (id === "terrain") {
    c.moveTo(-10, 7);
    c.lineTo(-3, -6);
    c.lineTo(2, 2);
    c.lineTo(6, -3);
    c.lineTo(11, 7);
    c.closePath();
  } else if (id === "tools" || id === "edit") {
    for (const x of [-7, 0, 7]) {
      c.moveTo(x + 1.5, 0);
      c.arc(x, 0, 1.5, 0, Math.PI * 2);
    }
  } else if (id === "copy") {
    c.rect(-7, -7, 11, 11);
    c.rect(-3, -3, 11, 11);
  } else if (id === "erase") {
    c.moveTo(-8, -5);
    c.lineTo(8, -5);
    c.moveTo(-5, -5);
    c.lineTo(-4, 8);
    c.lineTo(4, 8);
    c.lineTo(5, -5);
    c.moveTo(-3, -8);
    c.lineTo(3, -8);
  } else if (id === "rotate-tool") {
    c.arc(0, 0, 8, 0.2, Math.PI * 1.65);
    c.moveTo(1, -10);
    c.lineTo(4, -7);
    c.lineTo(0, -5);
  } else if (id === "scale-tool") {
    c.moveTo(-8, 8);
    c.lineTo(8, -8);
    c.moveTo(2, -8);
    c.lineTo(8, -8);
    c.lineTo(8, -2);
    c.moveTo(-8, 2);
    c.lineTo(-8, 8);
    c.lineTo(-2, 8);
  } else {
    for (let i = 0; i < 4; i++) {
      c.rotate(Math.PI / 2);
      c.moveTo(0, 0);
      c.lineTo(0, -9);
      c.moveTo(-3, -6);
      c.lineTo(0, -9);
      c.lineTo(3, -6);
    }
  }
  c.stroke();
  c.restore();
  return true;
}
function icon(c, id, x, y) {
  if (
    ![
      "menu",
      "undo",
      "redo",
      "up",
      "down",
      "close",
      "previous",
      "next",
    ].includes(id)
  )
    return false;
  c.save();
  c.translate(x, y);
  c.strokeStyle = c.fillStyle;
  c.lineWidth = 2;
  c.lineCap = "round";
  c.lineJoin = "round";
  c.beginPath();
  if (id === "menu") {
    for (const yy of [-6, 0, 6]) {
      c.moveTo(-8, yy);
      c.lineTo(8, yy);
    }
  } else if (id === "close") {
    c.moveTo(-6, -6);
    c.lineTo(6, 6);
    c.moveTo(6, -6);
    c.lineTo(-6, 6);
  } else if (id === "undo" || id === "redo") {
    if (id === "redo") c.scale(-1, 1);
    c.moveTo(-8, -4);
    c.lineTo(2, -4);
    c.bezierCurveTo(12, -4, 12, 8, 2, 8);
    c.moveTo(-3, -9);
    c.lineTo(-8, -4);
    c.lineTo(-3, 1);
  } else if (id === "up" || id === "down") {
    if (id === "down") c.scale(1, -1);
    c.moveTo(0, 9);
    c.lineTo(0, -9);
    c.moveTo(-6, -3);
    c.lineTo(0, -9);
    c.lineTo(6, -3);
  } else {
    if (id === "next") c.scale(-1, 1);
    c.moveTo(3, -7);
    c.lineTo(-4, 0);
    c.lineTo(3, 7);
  }
  c.stroke();
  c.restore();
  return true;
}
export function paintHUD(
  c,
  layout,
  { focus = "", pressed = "", images = new Map() } = {},
) {
  for (const line of layout.lines || []) {
    c.strokeStyle = line.color;
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(line.x, line.y);
    c.lineTo(line.x2, line.y2);
    c.stroke();
  }
  for (const panel of layout.panels)
    box(c, panel, "rgba(13,18,21,.97)", panel.mode ? "#8da6b5" : "#4c585e");
  c.textBaseline = "middle";
  c.textAlign = "center";
  for (const b of layout.buttons) {
    c.globalAlpha = b.disabled ? 0.42 : 1;
    const active = b.selected || b.accent;
    box(
      c,
      b,
      active ? "#d7ff58" : "rgba(13,18,21,.9)",
      focus === b.id || pressed === b.id ? "#ffffff" : "#596268",
    );
    if (focus === b.id) {
      c.strokeStyle = "#fff";
      c.lineWidth = 2;
      c.stroke();
    }
    if (b.slider) {
      const value = Number(b.value) || 0,
        t = Math.max(0, Math.min(1, (value - b.min) / (b.max - b.min)));
      c.fillStyle = "#edf1f2";
      c.font = "600 12px system-ui";
      c.textAlign = "left";
      c.fillText(b.label, b.x + 10, b.y + 12, b.w - 65);
      c.textAlign = "right";
      c.fillText(
        b.id === "brush-power" ? `${Math.round(value*100)}%` : String(Number(value.toFixed(2))),
        b.x + b.w - 10,
        b.y + 12,
        60,
      );
      c.fillStyle = "#455159";
      c.fillRect(b.x + 14, b.y + 32, b.w - 28, 3);
      c.fillStyle = "#d7ff58";
      c.fillRect(b.x + 14, b.y + 32, (b.w - 28) * t, 3);
      c.beginPath();
      c.arc(b.x + 14 + (b.w - 28) * t, b.y + 33, 7, 0, Math.PI * 2);
      c.fill();
      c.textAlign = "center";
      continue;
    }
    const img = b.thumbnail && images.get(b.thumbnail);
    if (img) {
      const scale = Math.min(
          (b.w - 14) / (img.width || 144),
          (b.h - 22) / (img.height || 112),
        ),
        iw = (img.width || 144) * scale,
        ih = (img.height || 112) * scale;
      c.drawImage(img, b.x + (b.w - iw) / 2, b.y + 3, iw, ih);
    }
    c.fillStyle = active ? "#11170d" : "#edf1f2";
    c.font = `600 ${b.label.length > 12 ? 12 : 14}px system-ui, sans-serif`;
    if (toolIcon(c, b.id, b.x + b.w / 2, b.y + 14)) {
      c.font = "600 10px system-ui";
      c.fillText(b.label, b.x + b.w / 2, b.y + 35, b.w - 6);
      continue;
    }
    if (
      !(b.id === "close" && b.label === "Back") &&
      icon(c, b.id, b.x + b.w / 2, b.y + b.h / 2)
    ) {
    } else
      c.fillText(
        b.label,
        b.x + b.w / 2,
        b.y + (img ? b.h - 10 : b.h / 2),
        b.w - 10,
      );
  }
  c.globalAlpha = 1;
  for (const l of layout.labels) {
    c.font = "600 13px system-ui, sans-serif";
    c.textAlign = l.align || "center";
    c.fillStyle = "#f0f3f4";
    c.shadowColor = "#000";
    c.shadowBlur = 5;
    c.fillText(l.text, l.x, l.y, l.maxWidth);
    c.shadowBlur = 0;
  }
}
export function createBuilderHUD({
  stage,
  active,
  model,
  action,
  lift,
  pause,
  transform,
}) {
  const canvas = document.createElement("canvas");
  canvas.id = "builderHUD";
  canvas.setAttribute("aria-hidden", "true");
  stage.appendChild(canvas);
  const access = document.createElement("div");
  access.className = "builder-access";
  access.setAttribute("role", "toolbar");
  access.setAttribute("aria-label", "Map builder tools");
  stage.appendChild(access);
  const status = document.createElement("span");
  status.className = "builder-access";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  stage.appendChild(status);
  const ctx = canvas.getContext("2d"),
    images = new Map();
  let layout = { buttons: [], panels: [], labels: [] },
    paintSignature = "",
    imageVersion = 0,
    signature = "",
    focus = "",
    pressed = null,
    visible = true,
    toolbarFocus = false,
    w = 0,
    h = 0;
  function render() {
    visible = active();
    canvas.hidden = access.hidden = status.hidden = !visible;
    if (!visible) return;
    const rect = stage.getBoundingClientRect();
    w = rect.width;
    h = rect.height;
    if (w < 1 || h < 1) return;
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    if (
      canvas.width !== Math.round(w * scale) ||
      canvas.height !== Math.round(h * scale)
    ) {
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
    }
    const m = model(),
      style = getComputedStyle(stage),
      insets = Object.fromEntries(
        ["left", "right", "top", "bottom"].map((k) => [
          k,
          parseFloat(style.getPropertyValue("--builder-safe-" + k)) || 0,
        ]),
      );
    layout = hudLayout(w, h, m, insets);
    if (pressed?.slider) {
      const b = layout.buttons.find((b) => b.id === pressed.id);
      if (b) b.value = pressed.value;
    }
    if (m.gizmo && !m.panel) {
      layout.lines = [];
      const { origin, axes } = m.gizmo;
      for (const a of axes) {
        const b = {
          id: "axis-" + a.axis,
          label: a.label,
          x: a.end.x - 22,
          y: a.end.y - 22,
          w: 44,
          h: 44,
          axis: a.axis,
          origin,
          dx: a.end.x - origin.x,
          dy: a.end.y - origin.y,
          length: a.length,
        };
        if (
          b.x < 80 ||
          b.x + b.w > w - 100 ||
          b.y < 70 ||
          b.y + b.h > h - 160 ||
          layout.buttons.some(
            (r) =>
              b.x < r.x + r.w &&
              b.x + b.w > r.x &&
              b.y < r.y + r.h &&
              b.y + b.h > r.y,
          )
        )
          continue;
        layout.lines.push({
          x: origin.x,
          y: origin.y,
          x2: a.end.x,
          y2: a.end.y,
          color: a.color,
        });
        layout.buttons.push(b);
      }
    }
    for (const b of layout.buttons)
      if (b.thumbnail && !images.has(b.thumbnail)) {
        const img = new Image();
        images.set(b.thumbnail, img);
        img.onload = () => {
          imageVersion++;
          render();
        };
        img.src = b.thumbnail;
      }
    const paintKey = JSON.stringify([
      w,
      h,
      scale,
      layout,
      focus,
      pressed?.id,
      imageVersion,
    ]);
    if (paintKey === paintSignature) return;
    paintSignature = paintKey;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, w, h);
    paintHUD(ctx, layout, { focus, pressed: pressed?.id, images });
    const announcement = m.panel
      ? [m.panel.title, m.panel.description, m.panel.value]
          .filter(Boolean)
          .join(". ")
      : m.tip || "";
    if (status.textContent !== announcement) status.textContent = announcement;
    if (!layout.buttons.some((b) => b.id === focus && !b.disabled)) focus = "";
    const sig = layout.buttons
      .map((b) => [b.id, b.label, !!b.disabled, !!b.selected].join(":"))
      .join("|");
    if (signature !== sig) {
      signature = sig;
      const hadFocus = access.contains(stage.getRootNode().activeElement);
      access.replaceChildren(
        ...layout.buttons.map((b) => {
          const el = document.createElement("button");
          el.textContent = b.aria || b.label;
          el.dataset.hud = b.id;
          el.disabled = !!b.disabled;
          el.setAttribute("aria-pressed", String(!!b.selected));
          el.onclick = () => {
            if (b.hold) action(b.hold > 0 ? "fly-step-up" : "fly-step-down");
            else if (b.slider)
              commitSlider(b, Math.min(b.max, b.value + b.step));
            else action(b.id);
            render();
          };
          el.onfocus = () => {
            focus = b.id;
            pause?.();
            render();
          };
          return el;
        }),
      );
      if (hadFocus) access.querySelector(`[data-hud="${focus}"]`)?.focus();
    }
  }
  function point(ev) {
    const r = stage.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }
  function stop(ev) {
    ev.preventDefault();
    ev.stopImmediatePropagation();
  }
  function down(ev) {
    if (
      !active() ||
      ev.button > 0 ||
      ev
        .composedPath()
        .some(
          (n) => n !== canvas && n !== stage && n?.matches?.("button,input"),
        )
    )
      return;
    // A locked mouse controls the crosshair, never buttons underneath it.
    if (stage.getRootNode().pointerLockElement || document.pointerLockElement)
      return;
    render();
    const p = point(ev),
      b = [...layout.buttons].reverse().find((b) => inside(p, b));
    if (!b && !model().panel) return;
    stop(ev);
    if (pressed || b?.disabled) return;
    pressed = {
      id: b?.id || "",
      pointer: ev.pointerId,
      hold: b?.hold || 0,
      start: p,
      handle: b?.axis ? b : null,
      slider: b?.slider ? { ...b } : null,
      value: b?.value,
    };
    stage.setPointerCapture(ev.pointerId);
    if (b?.hold) lift(b.hold);
    else pause?.();
    if (b?.axis) transform?.("start", b.axis, 0);
    if (b?.slider) pressed.value = sliderValue(b, p);
    render();
  }
  function release(ev, cancel = false) {
    if (!pressed || ev.pointerId !== pressed.pointer) return;
    stop(ev);
    const p = pressed;
    pressed = null;
    lift(0);
    if (stage.hasPointerCapture?.(ev.pointerId))
      stage.releasePointerCapture(ev.pointerId);
    if (p.slider) {
      if (!cancel) commitSlider(p.slider, p.value);
    } else if (p.handle)
      transform?.(cancel ? "cancel" : "end", p.handle.axis, 0);
    else if (!cancel && !p.hold) {
      const b = layout.buttons.find((b) => b.id === p.id);
      if (b && !b.disabled && inside(point(ev), b)) action(p.id);
    }
    render();
  }
  function sliderValue(b, p) {
    const t = Math.max(0, Math.min(1, (p.x - b.x - 14) / (b.w - 28)));
    return Math.max(
      b.min,
      Math.min(
        b.max,
        Math.round((b.min + t * (b.max - b.min)) / b.step) * b.step,
      ),
    );
  }
  function commitSlider(b, value) {
    action((b.id.startsWith("ui:") ? "value:" : "") + b.id + ":" + value);
  }
  function move(ev) {
    if (pressed?.pointer !== ev.pointerId) return;
    stop(ev);
    if (pressed.slider) {
      pressed.value = sliderValue(pressed.slider, point(ev));
      render();
      return;
    }
    const b = pressed.handle;
    if (!b) return;
    const p = point(ev),
      dx = p.x - pressed.start.x,
      dy = p.y - pressed.start.y;
    const delta =
      b.axis === "rotation"
        ? dx * 0.75
        : ((dx * b.dx + dy * b.dy) / Math.max(1, b.dx * b.dx + b.dy * b.dy)) *
          b.length;
    transform?.("move", b.axis, delta);
    render();
  }
  const up = (ev) => release(ev),
    cancel = (ev) => release(ev, true);
  stage.addEventListener("pointerdown", down, true);
  stage.addEventListener("pointermove", move, true);
  stage.addEventListener("pointerup", up, true);
  stage.addEventListener("pointercancel", cancel, true);
  stage.addEventListener("lostpointercapture", cancel, true);
  const reset = () => {
    if (pressed?.handle) transform?.("cancel", pressed.handle.axis, 0);
    pressed = null;
    toolbarFocus = false;
    lift(0);
    render();
  };
  window.addEventListener("blur", reset);
  const observer = new ResizeObserver(render);
  observer.observe(stage);
  function controller(frame) {
    const p = frame.pressed || [];
    if (!model().panel && model().building && p[B.LT]) {
      toolbarFocus = !toolbarFocus;
      focus = "";
      pause?.();
    }
    if (!model().panel && !toolbarFocus) return false;
    if (!model().panel && (p[B.B] || !model().building)) {
      toolbarFocus = false;
      focus = "";
      render();
      return true;
    }
    render();
    const list = layout.buttons.filter((b) => !b.disabled);
    let i = list.findIndex((b) => b.id === focus);
    if (i < 0) i = list[0]?.id === "close" && list.length > 1 ? 1 : 0;
    if (p[B.B] || p[B.MENU]) action("close");
    else if (list[i]?.slider && (p[B.DPAD_LEFT] || p[B.DPAD_RIGHT] || p[B.A])) {
      const b = list[i];
      commitSlider(
        b,
        Math.max(
          b.min,
          Math.min(b.max, b.value + (p[B.DPAD_LEFT] ? -1 : 1) * b.step),
        ),
      );
    } else if (p[B.A]) action(list[i]?.id);
    else {
      const dx = p[B.DPAD_RIGHT] ? 1 : p[B.DPAD_LEFT] ? -1 : 0,
        dy = p[B.DPAD_DOWN] ? 1 : p[B.DPAD_UP] ? -1 : 0;
      if ((dx || dy) && list[i]) {
        const a = list[i],
          ax = a.x + a.w / 2,
          ay = a.y + a.h / 2;
        let best = null,
          score = Infinity;
        for (const b of list) {
          const x = b.x + b.w / 2 - ax,
            y = b.y + b.h / 2 - ay;
          if (dx * x + dy * y <= 1) continue;
          const n = Math.hypot(x, y) + Math.abs(dx ? y : x) * 2;
          if (n < score) {
            score = n;
            best = b;
          }
        }
        if (best) i = list.indexOf(best);
      }
      focus = list[i]?.id || "";
    }
    render();
    return true;
  }
  function key(ev) {
    const map = {
      ArrowLeft: B.DPAD_LEFT,
      ArrowRight: B.DPAD_RIGHT,
      ArrowUp: B.DPAD_UP,
      ArrowDown: B.DPAD_DOWN,
      Enter: B.A,
      Escape: B.B,
    };
    if (!(ev.key in map)) return false;
    const pressed = [];
    pressed[map[ev.key]] = true;
    return controller({ pressed });
  }

  return {
    render,
    controller,
    key,
    reset,
    get focusActive() {
      return toolbarFocus;
    },
    get layout() {
      return layout;
    },
    destroy() {
      observer.disconnect();
      window.removeEventListener("blur", reset);
      for (const [event, fn] of [
        ["pointerdown", down],
        ["pointermove", move],
        ["pointerup", up],
        ["pointercancel", cancel],
        ["lostpointercapture", cancel],
      ])
        stage.removeEventListener(event, fn, true);
      canvas.remove();
      access.remove();
      status.remove();
    },
  };
}
