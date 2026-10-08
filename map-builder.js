import { EditorSession } from "./editor-session.js?v=2.20.0";
import {
  MapDocument,
  Storage,
  Validator,
  templateToDoc,
} from "./builder-model.js?v=2.20.0";
import { createBuilderPanels } from "./builder-panels.js?v=2.20.0";
import { createBuilderHUD } from "./builder-hud.js?v=2.20.0";
import { createEditorInput } from "./editor-input.js?v=2.20.0";
import { installCanvasInteractionGuards } from "./canvas-input.js?v=2.20.0";
export function createIntegratedMapBuilder({
  host,
  apiBase,
  getIdentity,
  onExit,
  onSaved,
  gameRuntime,
  inputOwner,
} = {}) {
  // The editor owns one real canvas; no mirrored controls or DOM layout tree.
  const stage = document.createElement("canvas");
  stage.id = "builderHUD";
  stage.style.cssText = "position:fixed;inset:0;width:100%;height:100%;z-index:90;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;-webkit-user-drag:none;--builder-safe-left:env(safe-area-inset-left,0px);--builder-safe-right:env(safe-area-inset-right,0px);--builder-safe-top:env(safe-area-inset-top,0px);--builder-safe-bottom:env(safe-area-inset-bottom,0px)";
  stage.hidden = true;
  (host || document.body).appendChild(stage);
  let active = false,
    serverMapId = "",
    dirty = false,
    operation = null;
  const editor = new EditorSession({
    stage,
    gameRuntime,
    onMutation: () => {
      dirty = true;
    },
    onUI: route,
  });
  const panels = createBuilderPanels({
    editor,
    save: () => run(saveServerMap),
    publish: () => run(publishServerMap),
    exit: completeExit,
    restore,
  });
  editor.clearPanel = () => panels.reset();
  editor.onUIAction = (id) => panels.action(id);
  editor.loadTemplate = (k) => editor.setDoc(templateToDoc(k));
  editor.loadCollisionLab = async () => {
    const response = await fetch(
      new URL("./maps/collision-lab.breachmap.json", import.meta.url),
    );
    if (!response.ok) throw new Error("Collision test map could not load");
    editor.importData(await response.json());
  };
  editor.hud = createBuilderHUD({
    stage,
    active: () => active,
    model: () => editor.hudModel(),
    action: (id) => editor.action(id),
    lift: (value) => {
      editor.state.lift = editor.state.phase === "edit" ? value : 0;
    },
    pause: () => {editor.input?.cancel();gameRuntime.pauseInput();},
  });
  editor.input = createEditorInput(editor, () => active, panels);
  // Unconsumed contacts in Test keep using the game's movement/look handlers.
  // Builder chrome stops them in capture phase, so a tap has exactly one owner.
  const testPointers = new Set();
  const playPointer = event => {
    if (event.type === "pointerdown") {
      if (!active || editor.state.phase !== "test" || editor.panel || editor.hud.focusActive) return;
      testPointers.add(event.pointerId);
    } else if (!testPointers.has(event.pointerId)) return;
    gameRuntime.pointer?.(event.type, event);
    if (["pointerup", "pointercancel", "lostpointercapture"].includes(event.type)) testPointers.delete(event.pointerId);
  };
  const playPointerTypes = ["pointerdown", "pointermove", "pointerup", "pointercancel", "lostpointercapture"];
  for (const type of playPointerTypes) stage.addEventListener(type, playPointer);
  // Game capture changes the event target. Its original handler owns release;
  // only forget our contact here rather than dispatching it a second time.
  const capturedPlayEnd = event => { if (event.target !== stage) testPointers.delete(event.pointerId); };
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) document.addEventListener(type, capturedPlayEnd, true);
  const cancelInput = () => { testPointers.clear(); editor.input.cancel(); editor.hud.reset(); };
  const releaseInputSubscription = inputOwner?.subscribe(cancelInput);
  const interactionGuards = installCanvasInteractionGuards({ canvases: [stage], ownerDocument: document, eventTarget: window, inputOwner, onCancel: cancelInput });
  async function api(path, payload = {}) {
    const identity = getIdentity?.();
    if (!identity?.client || !identity?.auth)
      throw new Error("Return to the lobby to reconnect, then try again.");
    const response = await fetch(`${apiBase}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client: identity.client,
        auth: identity.auth,
        ...payload,
      }),
      cache: "no-store",
    });
    let data = {};
    try {
      data = await response.json();
    } catch {}
    if (!response.ok)
      throw new Error(
        data.error || "The server could not complete this action.",
      );
    return data;
  }
  async function saveServerMap() {
    const epoch = editor.epoch,
      rev = editor.sceneRev,
      out = editor.exportData();
    const data = await api("/maps/save", {
      mapId: serverMapId || undefined,
      name: out.meta?.name,
      map: out,
    });
    if (epoch !== editor.epoch) return data;
    serverMapId = data.mapId || data.map?.id || serverMapId;
    if (rev === editor.sceneRev) {
      dirty = false;
      editor.setSaveState("saved");
    }
    editor.toast("Draft saved");
    onSaved?.({ mapId: serverMapId, published: false, map: data.map || null });
    return data;
  }
  async function publishServerMap() {
    const issues = await editor.validate();
    if (!Validator.statusFrom(issues).exportable) {
      panels.show("check", {}, false);
      return;
    }
    await saveServerMap();
    const data = await api("/maps/publish", { mapId: serverMapId });
    editor.toast(`Published revision ${data.revision}`);
    onSaved?.({
      mapId: serverMapId,
      published: true,
      revision: data.revision,
      map: data.map || null,
    });
  }
  function run(task) {
    if (operation) {const epoch=editor.epoch;return operation.then(()=>{if(editor.epoch!==epoch)throw new Error("Map changed before the operation could start");return run(task);});}
    if (editor.transaction || editor.roadPoints.length) {
      editor.toast("Finish or Cancel before saving");
      return Promise.resolve();
    }
    gameRuntime.pauseInput();
    operation = Promise.resolve()
      .then(task)
      .catch((error) => {
        panels.show("error", { message: error.message }, false);
        throw error;
      })
      .finally(() => {
        operation = null;
        editor.syncUI();
      });
    return operation;
  }
  function route(name, data = {}) {
    if (name === "exit") return requestExit();
    if (name === "save" || name === "publish") {
      panels.show("working", {}, false);
      run(name === "save" ? saveServerMap : publishServerMap)
        .then(() => {
          if (editor.panel?.model().title === "Working…") panels.dismiss();
        })
        .catch(() => {});
      return;
    }
    panels.show(
      {
        rename: "settings",
        build: "library",
        props: "library",
        gameplay: "setup",
        environment: "paint",
      }[name] || name,
      data,
    );
  }
  async function restore() {
    const data = await Storage.load();
    if (!data) throw new Error("No local autosave is available.");
    editor.setDoc(data);
  }
  function completeExit() {
    panels.dismiss();
    cancelInput();
    editor.stopPlay();
    gameRuntime.close();
    active = false;
    stage.hidden = true;
    editor.syncUI();
    onExit?.({ mapId: serverMapId });
  }
  function requestExit() {
    if (operation) return;
    if (editor.transaction) {
      editor.toast("Apply or Cancel before leaving");
      return;
    }
    if (dirty) panels.show("exit");
    else completeExit();
  }
  async function open({ mapId = "" } = {}) {
    if (operation) await operation;
    let doc;
    if (mapId) {
      const data = await api("/maps/get", { mapId });
      doc = new MapDocument(data.definition);
      for (const o of doc.all())
        if (data.definition.editor?.groups?.[o.id])
          o.groupId = data.definition.editor.groups[o.id];
    } else doc = templateToDoc("blank");
    editor.input.cancel();
    panels.reset();
    gameRuntime.close();
    serverMapId = String(mapId || "");
    active = true;
    stage.hidden = false;
    try {
      editor.openDocument(doc);
      dirty = !mapId;
    } catch (error) {
      active = false;
      stage.hidden = true;
      gameRuntime.close();
      throw error;
    }
    editor.syncUI();
    return true;
  }
  window.__BreachBuilder = {
    getEditor: () => editor,
    getDoc: () => editor.doc?.serializeInternal(),
    action: (a) => editor.action(a),
    choose: (i) => editor.choose(i),
    exportData: () => editor.exportData(),
    runtimeParity: () => editor.runtimeParity(),
    validateDeep: () => Validator.validate(editor.doc, true),
    undo: () => editor.commands.undo(),
    redo: () => editor.commands.redo(),
  };
  return Object.freeze({
    open,
    close({ force = false } = {}) {
      if (!active) return true;
      if (!force && (dirty || editor.transaction)) {
        requestExit();
        return false;
      }
      completeExit();
      return true;
    },
    suspend() {
      active = false;
      stage.hidden = true;
      panels.dismiss();
      cancelInput();
      editor.stopPlay();
      gameRuntime.close();
      editor.syncUI();
    },
    requestExit,
    cancelInput,
    destroy() { completeExit(); releaseInputSubscription?.(); for (const type of playPointerTypes) stage.removeEventListener(type, playPointer); for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) document.removeEventListener(type, capturedPlayEnd, true); interactionGuards.destroy(); editor.input.destroy(); editor.hud.destroy(); },
    handleControllerFrame: (f, dt) => editor.input.controller(f, dt),
    get active() {
      return active;
    },
    get mapId() {
      return serverMapId;
    },
    get saveState() {
      return editor.saveState;
    },
    exportData: () => (editor.doc ? editor.exportData() : null),
  });
}
