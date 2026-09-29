import { EDITOR_ITEMS } from "./editor-library.js?v=2.5.0";
// Canvas panel descriptions and commands. No DOM controls or browser prompts.
import { APP_VERSION } from "./game-config.js?v=2.5.0";
import {
  assetResizeMode,
  BUILDING_MATERIALS,
} from "./object-catalog.js?v=2.5.0";
import {
  CATALOG,
  MATERIALS,
  ENV_PRESETS,
  EnvironmentRules,
  SettingsCommand,
  EnvironmentCommand,
  PatchCommand,
  Validator,
  IssueGuide,
  clone,
  uid,
  clamp,
} from "./builder-model.js?v=2.5.0";
export function createBuilderPanels({
  editor: e,
  save,
  publish,
  exit,
  importFile,
  exportFile,
  restore,
}) {
  let screen = null,
    history = [],
    actions = new Map(),
    keyboard = null,
    busy = false,
    checkRevision = -1,
    checkDoc = null,
    checkIssues = [],
    checkPending = false,
    checkError = "",
    libraryGroup = "Buildings";
  const selection = () => e.allSelected();
  function show(name, data = {}, push = true) {
    if(name === "save-map"){task(save);return;}
    if (e.transaction && name !== "error") {
      e.toast("Apply or Cancel the current edit");
      return;
    }
    e.cancelInteraction?.();
    if (push && screen) history.push(screen);
    screen = { name, data };
    keyboard = null;
    e.panel = { model };
    e.state.page = 0;
    e.state.lift = 0;
    e.state.controllerLift = 0;
    e.gameRuntime?.pauseInput();
    e.syncUI();
  }
  function close() {
    if (busy || screen?.name === "working") return;
    if (history.length) {
      const s = history.pop();
      show(s.name, s.data, false);
    } else {
      screen = null;
      keyboard = null;
      e.panel = null;
    }
    e.syncUI();
  }
  function reset() {
    history = [];
    screen = null;
    keyboard = null;
    e.panel = null;
  }
  function dismiss() {
    reset();
  }
  function item(label, run, options = {}) {
    const id = "ui:" + actions.size;
    actions.set(id, run);
    return { id, label, ...options };
  }
  function field(label, value, set, { min = -300, max = 300, step = 1 } = {}) {
    const row = item(label, () => {}, { slider: true, value, min, max, step });
    actions.set("value:" + row.id, (v) =>
      set(clamp(Math.round(v / step) * step, min, max)),
    );
    return row;
  }
  function choice(title, values, current, set) {
    show("choice", { title, values, current, set });
  }
  function editText(title, value, apply, numeric = false) {
    keyboard = {
      title,
      value: String(value),
      draft: String(value),
      apply,
      numeric,
      caps: false,
    };
    e.state.page = 0;
    e.syncUI();
  }
  function commitText() {
    const k = keyboard;
    if (!k) return;
    try {
      k.apply(k.draft);
      keyboard = null;
      e.syncUI();
    } catch (error) {
      k.error = error.message;
      e.syncUI();
    }
  }
  function setProperty(key, value) {
    const before = selection().map(clone),
      after = before.map((o) => ({ ...o, [key]: value }));
    if (before.length)
      e.commands.execute(new PatchCommand(e.doc, before, after, "Property"));
  }
  function changeSetting(change) {
    const before = e.settingsSnapshot(),
      after = clone(before);
    change(after);
    e.commands.execute(new SettingsCommand(e, before, after));
    e.fit();
  }
  function environment(change) {
    const before = clone(e.doc.environment),
      after = clone(before);
    change(after);
    e.commands.execute(new EnvironmentCommand(e, before, after));
  }
  function activate(mode, itemToPlace) {
    if (itemToPlace) return e.choose(itemToPlace);
    if (mode === "analysis") {
      show("analysis");
      return;
    }
    e.terrain(mode === "environment");
  }

  async function task(run) {
    if (busy) return;
    busy = true;
    e.syncUI();
    try {
      await run();
    } catch (error) {
      show("error", { message: String(error?.message || error) }, false);
    } finally {
      busy = false;
      e.syncUI();
    }
  }
  function confirm(title, message, run) {
    show("confirm", { title, message, run });
  }
  function model() {
    actions = new Map();
    if (!screen) return null;
    if (keyboard)
      return {
        title: keyboard.error || keyboard.title,
        kind: "keyboard",
        value: keyboard.draft,
        numeric: keyboard.numeric,
        caps: keyboard.caps,
        digits: keyboard.digits,
      };
    const { name, data } = screen;
    let title = "",
      items = [],
      description = "";
    if (name === "working") {
      title = "Working…";
      description = "Please wait";
    } else if (name === "restore") {
      title = "Restore autosave";
      description = "Replace this map with the saved local draft?";
      items = [item("Cancel", close), item("Restore", () => task(restore))];
    } else if (name === "choice") {
      title = data.title;
      items = data.values.map((v) => {
        const [value, label] = Array.isArray(v) ? v : [v, v];
        return item(
          label,
          () => {
            data.set(value);
            close();
          },
          { selected: value === data.current },
        );
      });
    } else if (name === "confirm") {
      title = data.title;
      description = data.message;
      items = [
        item("Cancel", close),
        item("Confirm", () =>
          task(async () => {
            await data.run();
            dismiss();
          }),
        ),
      ];
    } else if (name === "error") {
      title = "Could not finish";
      description = data.message;
      items = [item("Back", close), item("Map Check", () => show("check"))];
    } else if (name === "test-menu") {
      title = "Test map";
      items = [
        item("Return to editing", () => {
          dismiss();
          e.toggleTest();
        }),
        item("Player collision", () => {
          dismiss();
          e.gameRuntime.debugCollision("player");
        }),
        item("Projectile collision", () => {
          dismiss();
          e.gameRuntime.debugCollision("projectile");
        }),
        item("Hide collision", () => {
          dismiss();
          e.gameRuntime.debugCollision("off");
        }),
      ];
    } else if (name === "edit") {
      title = "Object properties";
      const objects = selection(),
        o = objects[0];
      if (!o) {
        description = "Select an object first";
        items = [
          item("Select", () => {
            dismiss();
            e.action("select");
          }),
        ];
      } else {
        description =
          objects.length > 1
            ? `${objects.length} selected`
            : IssueGuide.objectLabel(o);
        const groupActions = [
          item(objects.some(x=>x.groupId)?'Ungroup':'Group',()=>objects.some(x=>x.groupId)?e.ungroupSelected():e.groupSelected()),
          item('Save group',()=>editText('Group name',`Piece ${e.prefabs.length+1}`,saveGroup)),
        ];
        items = [];
        if (objects.length === 1) {
          for (const [key, label, min, max, step] of [
            ["x", "X", -e.doc.arenaLimit, e.doc.arenaLimit, 0.5],
            ["z", "Z", -e.doc.arenaLimit, e.doc.arenaLimit, 0.5],
            ["rot", "Rotation", 0, 359, 15],
            ["yOffset", "Height", -8, 20, 0.25],
            ["yaw", "Facing", 0, 359, 15],
          ])
            if (key in o && !(o.type==="road" && key==="yOffset"))
              items.push(
                field(label, o[key], (v) => setProperty(key, v), {
                  min,
                  max,
                  step,
                }),
              );
          if(o.type==="road")items.push(field("Road width",o.d,v=>setProperty("d",v),{min:1,max:40,step:.5}));
          if (o.type!=="road" && assetResizeMode(o) === "parametric")
            for (const [key, label, min, max, step] of [
              ["w", "Width", o.type === "building" ? 8 : 1, 80, 0.5],
              ["d", "Depth", o.type === "building" ? 6 : 1, 80, 0.5],
              ["h", "Height", 0.2, 40, 0.25],
              ["levels", "Floors", 1, 8, 1],
              ["floorH", "Floor height", 2.2, 5, 0.1],
              ["balcony", "Balcony", 0, 10, 0.5],
              ["rise", "Rise", 0.5, 24, 0.25],
              ["base", "Base", 2, 60, 0.5],
            ])
              if (key in o)
                items.push(
                  field(label, o[key], (v) => setProperty(key, v), {
                    min,
                    max,
                    step,
                  }),
                );
          if (o.type === "building")
            items.push(
              item("Material: " + o.style, () =>
                choice(
                  "Building material",
                  Object.keys(BUILDING_MATERIALS),
                  o.style,
                  (v) => setProperty("style", v),
                ),
              ),
            );
          if (o.type === "spawn")
            items.push(
              item("Team: " + o.team, () =>
                choice(
                  "Team",
                  [
                    ["blue", "Alpha"],
                    ["red", "Bravo"],
                    ["ffa", "Free for all"],
                  ],
                  o.team,
                  (v) => setProperty("team", v),
                ),
              ),
            );
          if (o.type === "ladder" && o.parentId)
            items.push(
              item("Detach ladder", () => {
                const before = clone(o),
                  after = { ...before, parentId: null, attached: false };
                e.commands.execute(
                  new PatchCommand(e.doc, [before], [after], "Detach ladder"),
                );
              }),
            );
          if (o.type === "ladder")
            for (const key of o.parentId
              ? ["width"]
              : ["width", "bottomY", "topY"])
              items.push(
                field(key, o[key], (v) => setProperty(key, v), {
                  min: key === "width" ? 0.5 : -8,
                  max: key === "width" ? 5 : 60,
                  step: 0.25,
                }),
              );
        }
        items.push(...groupActions);
      }
    } else if (name === "library" || name === "objects") {
      title = "Objects";
      const group = data.group || libraryGroup;
      libraryGroup = group;
      const groups = [
        ...(e.recentItems?.length ? ["Recent"] : []),
        "Buildings",
        "Pieces",
        "Cover",
        "Nature",
        "Roads",
        "Starts",
        "Groups",
      ];
      const tabs = groups.map((g) =>
        item(g, () => show("library", { group: g }, false), {
          selected: g === group,
        }),
      );
      let objects = group === "Recent" ? e.recentItems : EDITOR_ITEMS.filter((o) => o.group === group);
      if (group === "Pieces")
        objects = [
          ...objects,
          ...CATALOG.build.filter((o) => o.type === "mound"),
          ...CATALOG.gameplay.filter((o) => o.type === "ladder"),
        ];
      if (group === "Roads") objects = CATALOG.roads;
      if (group === "Starts")
        objects = CATALOG.gameplay.filter((o) => o.type !== "ladder");
      items = objects.map((o) =>
        item(o.label, () => e.choose(o), {
          thumbnail: e.gameRuntime.thumbnail?.(o),
          tile: true,
        }),
      );
      if (group === "Groups")
        items = e.prefabs.map((p) =>
          item(
            p.name,
            () => e.choose({ type: "prefab", label: p.name, prefabId: p.id }),
            { tile: true },
          ),
        );
      if (group === "Groups")
        items.push(item("Manage groups", () => show("prefabs")));
      return { title, kind: "library", tabs, items, back: false };
    } else if (name === "tools") {
      title = "Map tools";
      items = [
        item("Starts & routes", () => show("setup")),
        item("Light & weather", () => show("weather")),
        item("Snapping", () => show("snap")),
        item("Layers", () => show("layers")),
        item("Map analysis", () => show("analysis")),
      ];
    } else if (name === "roads" || name === "setup" || name === "catalog") {
      title =
        name === "roads"
          ? "Roads"
          : name === "setup"
            ? "Starts & ladders"
            : "Object library";
      const group =
        name === "roads"
          ? "roads"
          : name === "setup"
            ? "gameplay"
            : data.group || "build";
      if (name === "setup")
        items.push(
          item("Auto setup", () => e.autoGameplay()),
          item("Rebuild bot routes", () => e.autoFlow()),
        );

      items.push(
        ...CATALOG[group].map((o) =>
          item(o.label, () => activate("select", o)),
        ),
      );
    } else if (name === "paint") {
      title = "Paint ground";
      items = Object.entries(MATERIALS).map(([key, v]) =>
        item(
          v.label,
          () => {
            e.materialBrush.material = key;
            activate("environment");
          },
          { selected: e.materialBrush.material === key },
        ),
      );
      items.push(
        field(
          "Brush radius",
          e.materialBrush.radius,
          (v) => {
            e.materialBrush.radius = v;
          },
          { min: e.minimumBrushRadius(), max: 30, step: 2 },
        ),
      );
    } else if (name === "terrain") {
      title = "Shape ground";
      items = ["raise", "lower", "smooth", "level"].map((tool) =>
        item(
          tool === "level" ? "Flatten" : tool[0].toUpperCase() + tool.slice(1),
          () => {
            e.brush.tool = tool;
            activate("terrain");
          },
          { selected: e.brush.tool === tool },
        ),
      );
      items.push(
        field(
          "Brush radius",
          e.brush.radius,
          (v) => {
            e.brush.radius = v;
          },
          { min: e.minimumBrushRadius(), max: 30, step: 2 },
        ),
        field(
          "Rate",
          e.brush.rate,
          (v) => {
            e.brush.rate = v;
          },
          { min: 0.25, max: 8, step: 0.25 },
        ),
        item(
          "Sample flatten height: " + (e.brush.sampleHeight ? "On" : "Off"),
          () => {
            e.brush.sampleHeight = !e.brush.sampleHeight;
          },
        ),
        field(
          "Flatten height",
          e.brush.level,
          (v) => {
            e.brush.level = v;
          },
          { min: -6, max: 6, step: 0.25 },
        ),
        item("Flatten entire map", () =>
          confirm(
            "Flatten ground",
            "This replaces all terrain shaping. Undo can restore it.",
            () => e.resetTerrainSurface("flat"),
          ),
        ),
        item("Reset shaping", () =>
          confirm(
            "Reset shaping",
            "Restore the base terrain. Undo can restore your edits.",
            () => e.resetTerrainSurface("base"),
          ),
        ),
      );
    } else if (name === "weather") {
      title = "Light & weather";
      items = Object.entries(ENV_PRESETS).map(([key, v]) =>
        item(
          v.label,
          () => {
            const before = clone(e.doc.environment);
            e.commands.execute(
              new EnvironmentCommand(e, before, EnvironmentRules.preset(key)),
            );
          },
          { selected: e.doc.environment.preset === key },
        ),
      );
      items.push(
        item("Weather: " + e.doc.environment.weather, () =>
          choice(
            "Weather",
            ["clear", "overcast", "rain", "storm"],
            e.doc.environment.weather,
            (v) =>
              environment((a) => {
                a.weather = v;
                a.preset = "custom";
              }),
          ),
        ),
      );
      for (const [key, label, min, max, step] of [
        ["sunAzimuth", "Sun direction", 0, 359, 15],
        ["sunElevation", "Sun height", -30, 85, 5],
        ["cloudAmount", "Clouds", 0, 1, 0.1],
        ["fogAmount", "Fog", 0, 0.85, 0.05],
        ["rainIntensity", "Precipitation", 0, 1, 0.1],
        ["ambient", "Ambient light", 0.12, 1, 0.05],
        ["wetness", "Wet ground", 0, 1, 0.1],
        ["wind", "Wind", 0, 1, 0.1],
      ])
        items.push(
          field(
            label,
            e.doc.environment[key],
            (v) =>
              environment((a) => {
                a[key] = v;
                a.preset = "custom";
              }),
            { min, max, step },
          ),
        );
    } else if (name === "snap") {
      title = "Snapping";
      for (const [key, label] of [
        ["grid", "Grid"],
        ["objects", "Objects"],
        ["roads", "Road ends"],
      ])
        items.push(
          item(label + ": " + (e.snapConfig[key] ? "On" : "Off"), () => {
            e.snapConfig[key] = !e.snapConfig[key];
            e.previewKey = "";
          }),
        );
      items.push(
        field(
          "Grid size",
          e.snapConfig.gridSize,
          (v) => {
            e.snapConfig.gridSize = v;
          },
          { min: 0.25, max: 10, step: 0.25 },
        ),
        field(
          "Rotation step",
          e.snapConfig.angle,
          (v) => {
            e.snapConfig.angle = v;
          },
          { min: 1, max: 90, step: 5 },
        ),
      );
    } else if (name === "layers") {
      title = "Layer locks";
      description = "Locked objects cannot be selected or edited.";
      for (const [key, v] of Object.entries(e.layerState)) {
        items.push(
          item(key + ": " + (v.locked ? "Locked" : "Unlocked"), () => {
            v.locked = !v.locked;
            e.selected = new Set(e.allSelected().map((o) => o.id));
            e.syncUI();
            e.draw();
          }),
        );
      }
    } else if (name === "prefabs") {
      title = "Saved groups";
      items = [
        item("Save selection", () => {
          if (!selection().length) {
            e.toast("Select objects first");
            return;
          }
          editText("Group name", `Piece ${e.prefabs.length + 1}`, saveGroup);
        }),
      ];
      for (const p of e.prefabs)
        items.push(
          item("Place " + p.name, () =>
            activate("select", {
              type: "prefab",
              label: p.name,
              prefabId: p.id,
            }),
          ),
          item("Remove " + p.name, () =>
            confirm("Remove saved group", p.name, () => {
              e.prefabs = e.prefabs.filter((x) => x.id !== p.id);
              e.persistPrefabs();
            }),
          ),
        );
    } else if (name === "settings") {
      title = "Map settings";
      items = [
        item("Name: " + e.doc.meta.name, () =>
          editText("Map name", e.doc.meta.name, (v) =>
            changeSetting((a) => {
              a.meta.name = v.trim().slice(0, 64) || "NEW MAP";
            }),
          ),
        ),
        item("Base: " + e.doc.theme, () =>
          choice(
            "Base terrain",
            ["flat", "highlands", "depot", "yard", "rig"],
            e.doc.theme,
            (v) =>
              changeSetting((a) => {
                a.theme = v;
              }),
          ),
        ),
        field(
          "Play area",
          e.doc.arenaLimit,
          (v) =>
            changeSetting((a) => {
              a.arenaLimit = v;
              a.minimapLimit = Math.min(a.minimapLimit, v);
              a.terrain.heightfield = e.doc.terrain.resample(v).serialize();
              a.terrain.materials = e.doc.materials.resample(v).serialize();
            }),
          { min: Math.ceil(e.minimumArena()), max: 300, step: 5 },
        ),
        field(
          "Minimap area",
          e.doc.minimapLimit,
          (v) =>
            changeSetting((a) => {
              a.minimapLimit = v;
            }),
          { min: 20, max: e.doc.arenaLimit, step: 5 },
        ),
        item("Rebuild bot routes", () => e.autoFlow()),
        item("Generate map", () => show("generate")),
        item("Starting maps", () => show("templates")),
      ];
    } else if (name === "generate") {
      title = "Generate map";
      const d = screen.data;
      if (!d.style)
        Object.assign(d, {
          style: "urban",
          size: "medium",
          density: "normal",
          seed: "MAP",
        });
      items = [
        item("Style: " + d.style, () =>
          choice(
            "Style",
            ["urban", "mixed", "depot", "yard", "outpost", "highlands"],
            d.style,
            (v) => {
              d.style = v;
            },
          ),
        ),
        item("Size: " + d.size, () =>
          choice("Size", ["small", "medium", "large"], d.size, (v) => {
            d.size = v;
          }),
        ),
        item("Density: " + d.density, () =>
          choice("Density", ["light", "normal", "heavy"], d.density, (v) => {
            d.density = v;
          }),
        ),
        item("Seed: " + d.seed, () =>
          editText("Seed", d.seed, (v) => {
            d.seed = v;
          }),
        ),
        item("Generate", () =>
          confirm(
            "Replace current map",
            "Save or export first if you need this draft.",
            () => e.generate(d.style, d.size, d.density, d.seed),
          ),
        ),
      ];
    } else if (name === "templates") {
      title = "Starting maps";
      items = ["blank", "highlands", "depot", "yard", "rig"].map((k) =>
        item(k === "blank" ? "Flat map" : k, () =>
          confirm(
            "Replace current map",
            "Save or export first if you need this draft.",
            () => e.loadTemplate(k),
          ),
        ),
      );
      items.push(
        item("Collision test map", () =>
          confirm(
            "Replace current map",
            "Load all assets on flat ground? Undo can restore your map.",
            () => e.loadCollisionLab(),
          ),
        ),
        item("Reference map", () =>
          confirm("Replace current map", "Load the reference map?", () =>
            e.buildShowcase(),
          ),
        ),
      );
    } else if (name === "check") {
      title = "Map Check";
      if (checkDoc !== e.doc || checkRevision !== e.sceneRev) {
        const doc = e.doc,
          revision = e.sceneRev;
        checkDoc = doc;
        checkRevision = revision;
        checkIssues = [];
        checkError = "";
        checkPending = true;
        e.validate()
          .then((issues) => {
            if (checkDoc === doc && checkRevision === revision) {
              checkIssues = issues;
              checkPending = false;
              e.syncUI();
            }
          })
          .catch((error) => {
            checkError = error.message;
            checkPending = false;
            e.syncUI();
          });
      }
      const issues = checkIssues,
        status = Validator.statusFrom(issues);
      description = checkPending
        ? "Checking actual runtime collision…"
        : checkError ||
          (status.exportable
            ? (status.warnings ? "Ready to publish · warnings are optional reviews" : "Ready to publish")
            : "Fix blockers before publishing · warnings are optional reviews");
      items = [
        item(
          "Test map",
          () => {
            dismiss();
            e.action("playtest");
          },
          { disabled: checkPending },
        ),
        item("Collision overlay", () => show("analysis")),
        item("Export", () => exportFile()),
      ];
      const checkActions = items;
      items = [];
      for (const issue of issues.filter((i) => i.tone !== "good").sort((a,b) => (a.tone === "bad" ? 0 : 1) - (b.tone === "bad" ? 0 : 1))) {
        const guide = IssueGuide.describe(issue, e.doc);
        items.push(item(`${issue.tone === "bad" ? "Fix" : "Review"} · ${IssueGuide.objectLabel(e.doc.get(issue.target))}${e.doc.get(issue.target) ? ` (${Math.round(e.doc.get(issue.target).x)}, ${Math.round(e.doc.get(issue.target).z)})` : ""}`, () => show("issue", { issue, guide }), { subtitle: guide.title, aria: `${issue.tone === "bad" ? "Publishing blocker" : "Warning"}. ${guide.where}. ${guide.title}`, tone: issue.tone }));
      }
      items.push(...checkActions);
    } else if (name === "issue") {
      title = data.guide.title;
      description = `${data.issue.tone === "bad" ? "Publishing blocker" : "Warning · publishing allowed"}. ${data.guide.where}. ${data.guide.reason} ${data.guide.fix}`;
      items = [
        item(data.issue.target ? "Show object" : "Show map", () => {
          dismiss();
          if (data.issue.target) e.focusTarget(data.issue.target);
          else e.showChecks();
        }),
        item("Check again", () => show("check", {}, false)),
        item("Undo last edit", () => e.commands.undo()),
      ];
    } else if (name === "analysis") {
      title = "Collision & analysis";
      description = "Overlays show the actual compiled runtime collision.";
      items = ["player", "projectile", "both", "off"].map((mode) =>
        item(mode === "off" ? "Hide collision" : mode + " collision", () => {
          dismiss();
          e.gameRuntime.debugCollision(mode);
        }),
      );
      items.push(item("Map Check", () => show("check")));
      const m = e.analysisData();
      if (m)
        description += ` ${e.doc.all().length} objects. Inspect geometry, then Test movement.`;
    } else if (name === "help") {
      title = "Controls";
      description =
        "Tap objects to select. Drag to orbit; two fingers or right-drag pan; pinch or wheel zoom. In Ground, drag directly to paint or shape; two fingers navigate without painting. Place previews with a tap, then Place confirms. Roads: tap points, drag numbered handles or + to bend, then Finish. Other end extends the opposite end. Test uses the game’s movement. Controller: left stick pans, right stick orbits, bumpers zoom; LT focuses tools. A activates, B cancels. F focuses selection. Ctrl/Cmd+Z undoes.";
      items = [
        item("Objects", () => {
          dismiss();
          e.action("pick");
        }),
        item("Properties", () => show("edit")),
        item("Terrain tools", () => show("terrain")),
      ];
    } else if (name === "exit") {
      title = "Unsaved map";
      description = "Save this draft before returning to Maps?";
      items = [
        item("Keep editing", dismiss),
        item("Save & exit", () =>
          task(async () => {
            await save();
            exit();
          }),
        ),
        item("Discard & exit", exit),
      ];
    } else if (name === "files") {
      title = "Files";
      items = [
        item("Import map", importFile),
        item("Export map", exportFile),
        item("Restore autosave", () =>
          confirm(
            "Restore autosave",
            "Replace the current map with the saved local draft?",
            restore,
          ),
        ),
      ];
    } else {
      title = "Map · " + APP_VERSION;
      items = [
        item("Save", () => task(save), { accent: true }),
        item("Publish", () => task(publish)),
        item("Map settings", () => show("settings")),
        item("Map Check", () => show("check")),
        item("Files", () => show("files")),
        item("Controls", () => show("help")),
        item("Back to maps", () => {
          dismiss();
          e.onUI("exit");
        }),
      ];
    }
    if (busy) {
      title = "Working…";
      items = items.map((i) => ({ ...i, disabled: true }));
    }
    return {
      title,
      description,
      items,
      kind: "list",
      primaryPair: name === "map" || name === "issue",
      back: history.length > 0,
    };
  }
  function saveGroup(name) {
    const objects = selection();
    if (!objects.length) return;
    const ids = new Set(objects.map((o) => o.id));
    for (const l of e.doc.ladders) if (ids.has(l.parentId)) ids.add(l.id);
    const all = [...ids].map((id) => clone(e.doc.get(id))),
      center = e.groupCenter(objects);
    for (const o of all) {
      o.x -= center.x;
      o.z -= center.z;
    }
    e.prefabs.push({
      id: uid("prefab"),
      name: name.trim().slice(0, 48) || "Piece",
      objects: all,
      created: Date.now(),
    });
    e.persistPrefabs();
    e.toast("Group saved");
  }
  function action(id) {
    if (id.startsWith("value:")) {
      const split = id.lastIndexOf(":"),
        value = Number(id.slice(split + 1));
      const run = actions.get(id.slice(0, split));
      if (run && Number.isFinite(value) && !busy) {
        try {
          run(value);
        } catch (error) {
          show("error", { message: error.message });
        }
        e.syncUI();
      }
      return true;
    }
    if (id === "close") {
      if (keyboard) {
        keyboard = null;
        e.syncUI();
      } else close();
      return true;
    }
    if (keyboard && id.startsWith("text:")) {
      const key = id.slice(5);
      keyboard.error = "";
      if (key === "done") commitText();
      else if (key === "cancel") {
        keyboard = null;
      } else if (key === "back")
        keyboard.draft = Array.from(keyboard.draft).slice(0, -1).join("");
      else if (key === "digits") keyboard.digits = !keyboard.digits;
      else if (key === "clear") keyboard.draft = "";
      else if (key === "caps") keyboard.caps = !keyboard.caps;
      else if (keyboard.draft.length < 64)
        keyboard.draft += key === "space" ? " " : key;
      e.syncUI();
      return true;
    }
    const run = actions.get(id);
    if (!run) return false;
    if (!busy) {
      try {
        run();
      } catch (error) {
        show("error", { message: error.message });
      }
    }
    e.syncUI();
    return true;
  }
  function key(ev) {
    if (!keyboard) return false;
    if (ev.ctrlKey || ev.metaKey) return true;
    ev.preventDefault();
    if (ev.key === "Enter") commitText();
    else if (ev.key === "Escape") action("text:cancel");
    else if (ev.key === "Backspace") action("text:back");
    else if (ev.key.startsWith("Arrow")) return false;
    else if (
      ev.key.length === 1 &&
      (!keyboard.numeric || /[0-9.\-]/.test(ev.key))
    )
      action("text:" + ev.key);
    return true;
  }
  return {
    show,
    close,
    dismiss,
    reset,
    model,
    action,
    key,
    get active() {
      return !!screen;
    },
    get busy() {
      return busy;
    },
  };
}
