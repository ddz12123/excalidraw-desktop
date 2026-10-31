import { arrayToMap } from "@excalidraw/common";
import {
  redrawTextBoundingBox,
  syncMovedIndices,
  Scene,
} from "@excalidraw/element";
import { pointFrom } from "@excalidraw/math";
import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  exportScene,
  newElementWith,
} from "@excalidraw/excalidraw";
import { cleanAppStateForExport } from "@excalidraw/excalidraw/appState";

import type { ExcalidrawElementSkeleton } from "@excalidraw/element";
import type {
  ExcalidrawElement,
  ExcalidrawTextElement,
} from "@excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { LocalData } from "../data/LocalData";

const UPDATE_PROPS = new Set([
  "x",
  "y",
  "width",
  "height",
  "angle",
  "strokeColor",
  "backgroundColor",
  "fillStyle",
  "strokeWidth",
  "strokeStyle",
  "roughness",
  "opacity",
  "roundness",
  "locked",
]);

const NUMERIC_PROPS = new Set([
  "x",
  "y",
  "width",
  "height",
  "angle",
  "strokeWidth",
  "roughness",
  "opacity",
]);

const asRecord = (value: unknown, name: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
};

const asArray = (value: unknown, name: string): unknown[] => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${name} must be a non-empty array`);
  }
  return value;
};

const normalizeSkeletons = (
  skeletons: ExcalidrawElementSkeleton[],
): ExcalidrawElementSkeleton[] =>
  skeletons.map((skeleton) => {
    if (skeleton.type !== "arrow" && skeleton.type !== "line") {
      return skeleton;
    }

    const points = (skeleton as { points?: unknown }).points;

    if (Array.isArray(points) && points.length > 1) {
      return skeleton;
    }

    // 0 is a valid width/height (vertical/horizontal lines), but the
    // converter treats it as missing and falls back to 100x0
    const width = typeof skeleton.width === "number" ? skeleton.width : 100;
    const height = typeof skeleton.height === "number" ? skeleton.height : 0;

    return {
      ...skeleton,
      width,
      height,
      points: [pointFrom(0, 0), pointFrom(width, height)],
    } as ExcalidrawElementSkeleton;
  });

// the converter defaults x/y only for these two types; everything else
// would create elements with undefined coordinates
const SKELETON_TYPES_WITH_POSITION_DEFAULTS = new Set(["frame", "magicframe"]);

const SKELETON_TYPES = new Set([
  "rectangle",
  "ellipse",
  "diamond",
  "line",
  "arrow",
  "text",
  "image",
  "frame",
  "magicframe",
  "freedraw",
  "iframe",
  "stickynote",
  "embeddable",
]);

// optional props the converter passes through unchecked; a wrong type here
// would create a corrupt element (e.g. width: "100" bypasses the default)
const NUMERIC_SKELETON_PROPS = [
  "width",
  "height",
  "angle",
  "fontSize",
  "strokeWidth",
  "roughness",
  "opacity",
] as const;

const STRING_SKELETON_PROPS = [
  "strokeColor",
  "backgroundColor",
  "fillStyle",
  "strokeStyle",
] as const;

const validateSkeleton = (
  skeleton: unknown,
  position: number,
  files: Record<string, unknown>,
) => {
  if (!skeleton || typeof skeleton !== "object" || Array.isArray(skeleton)) {
    throw new Error(`Element at index ${position} must be an object`);
  }

  const record = skeleton as Record<string, unknown>;

  const type = record.type;
  if (typeof type !== "string" || !SKELETON_TYPES.has(type)) {
    throw new Error(
      `Element at index ${position} has unsupported type "${String(
        type,
      )}" (supported: ${[...SKELETON_TYPES].join(", ")})`,
    );
  }

  const invalid = (reason: string) =>
    new Error(`Element at index ${position} (${type}) ${reason}`);

  const { x, y } = record;
  const hasPosition =
    typeof x === "number" &&
    Number.isFinite(x) &&
    typeof y === "number" &&
    Number.isFinite(y);

  if (!hasPosition && !SKELETON_TYPES_WITH_POSITION_DEFAULTS.has(type)) {
    throw invalid("needs finite numeric x and y");
  }

  for (const prop of NUMERIC_SKELETON_PROPS) {
    const value = record[prop];
    if (
      value !== undefined &&
      (typeof value !== "number" || !Number.isFinite(value))
    ) {
      throw invalid(`needs a finite numeric ${prop}`);
    }
  }

  for (const prop of STRING_SKELETON_PROPS) {
    const value = record[prop];
    if (value !== undefined && typeof value !== "string") {
      throw invalid(`needs a string ${prop}`);
    }
  }

  if (type === "text") {
    const { text } = record;
    if (typeof text !== "string" || text.trim().length === 0) {
      throw invalid("is a text element and needs a non-empty text");
    }
  }

  if (type === "image") {
    const { fileId } = record;
    if (typeof fileId !== "string" || fileId.length === 0) {
      throw invalid(
        "is an image element and needs a fileId of an existing file",
      );
    }
    if (!files[fileId]) {
      throw invalid("references a fileId that does not exist on this canvas");
    }
  }

  // a malformed binding would be silently dropped by the converter and the
  // arrow would end up unbound while the tool reports success
  if (type === "arrow" || type === "line") {
    for (const prop of ["start", "end"] as const) {
      const binding = record[prop];
      if (binding === undefined) {
        continue;
      }
      const bindingId =
        binding && typeof binding === "object" && !Array.isArray(binding)
          ? (binding as { id?: unknown }).id
          : undefined;
      if (typeof bindingId !== "string" || bindingId.length === 0) {
        throw invalid(`has a malformed ${prop} binding (needs { id })`);
      }
    }

    const { points } = record;
    if (
      points !== undefined &&
      (typeof points !== "object" ||
        points === null ||
        !(points as unknown[]).every(
          (point) =>
            Array.isArray(point) &&
            point.length === 2 &&
            typeof point[0] === "number" &&
            Number.isFinite(point[0]) &&
            typeof point[1] === "number" &&
            Number.isFinite(point[1]),
        ))
    ) {
      throw invalid("needs points as [[x, y], ...] pairs of finite numbers");
    }
  }

  const { label } = record;
  if (label !== undefined) {
    const labelText =
      label && typeof label === "object" && !Array.isArray(label)
        ? (label as { text?: unknown }).text
        : undefined;
    if (typeof labelText !== "string" || labelText.trim().length === 0) {
      throw invalid("has a malformed label (needs { text })");
    }
  }
};

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      resolve(dataUrl.slice(dataUrl.indexOf(",") + 1));
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error("Failed to read blob"));
    reader.readAsDataURL(blob);
  });
};

const persistScene = (api: ExcalidrawImperativeAPI) => {
  LocalData.forceSave(
    api.getSceneElementsIncludingDeleted(),
    api.getAppState(),
    api.getFiles(),
    () => {},
  );
};

const getScene = (api: ExcalidrawImperativeAPI) => {
  const appState = api.getAppState();

  return {
    elements: api.getSceneElements(),
    appState: {
      viewBackgroundColor: appState.viewBackgroundColor,
      theme: appState.theme,
      gridModeEnabled: appState.gridModeEnabled,
      gridSize: appState.gridSize,
      zoom: appState.zoom.value,
      scrollX: appState.scrollX,
      scrollY: appState.scrollY,
      width: appState.width,
      height: appState.height,
      selectedElementIds: Object.keys(appState.selectedElementIds).filter(
        (id) => appState.selectedElementIds[id],
      ),
    },
  };
};

const addElements = (api: ExcalidrawImperativeAPI, params: unknown) => {
  const data = asRecord(params, "params");
  const rawSkeletons = asArray(data.elements, "elements");
  const files = api.getFiles();

  rawSkeletons.forEach((skeleton, index) =>
    validateSkeleton(skeleton, index, files),
  );

  const skeletons = normalizeSkeletons(
    rawSkeletons as ExcalidrawElementSkeleton[],
  );

  const created = convertToExcalidrawElements(skeletons, {
    regenerateIds: true,
  });

  if (!created.length) {
    throw new Error("No elements were created");
  }

  const elements = syncMovedIndices(
    [...api.getSceneElementsIncludingDeleted(), ...created],
    arrayToMap(created),
  );

  const selectable = created.filter(
    (element) => !(element.type === "text" && element.containerId),
  );

  api.updateScene({
    elements,
    appState:
      data.select === true
        ? {
            selectedElementIds: Object.fromEntries(
              selectable.map((element) => [element.id, true]),
            ),
          }
        : undefined,
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });

  persistScene(api);

  return {
    added: created.map((element) => ({
      id: element.id,
      type: element.type,
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
    })),
  };
};

const GEOMETRY_KEYS = new Set(["x", "y", "width", "height", "angle"]);

// updating a container's geometry must not leave its bound label behind:
// relayout affected labels so they follow moves and re-wrap on resizes
const syncBoundTextLayout = (
  elements: ExcalidrawElement[],
  updates: Map<string, Record<string, unknown>>,
) => {
  const geometryIds = new Set(
    [...updates.entries()]
      .filter(([, props]) =>
        Object.keys(props).some((key) => GEOMETRY_KEYS.has(key)),
      )
      .map(([id]) => id),
  );

  const boundTexts = elements.filter(
    (element): element is ExcalidrawTextElement =>
      !element.isDeleted &&
      element.type === "text" &&
      element.containerId !== null &&
      (geometryIds.has(element.containerId) || geometryIds.has(element.id)),
  );

  if (!boundTexts.length) {
    return;
  }

  // redrawTextBoundingBox mutates its inputs: clone the affected texts and
  // their containers first, so the live scene objects are never mutated
  // behind the real scene's back (force: an empty update returns the same
  // object otherwise)
  const cloneById = (id: string) => {
    const index = elements.findIndex((element) => element.id === id);
    if (index >= 0) {
      elements[index] = newElementWith(elements[index], {}, true);
    }
  };

  for (const text of boundTexts) {
    if (!text.containerId) {
      continue;
    }
    cloneById(text.id);
    cloneById(text.containerId);
  }

  // no real scene here, so a temp scene lets redrawTextBoundingBox query and
  // mutate this snapshot (same approach as convertToExcalidrawElements)
  const scene = new Scene(elements);

  for (const text of boundTexts) {
    if (!text.containerId) {
      continue;
    }
    const clonedText = scene.getElement<ExcalidrawTextElement>(text.id);
    if (clonedText) {
      redrawTextBoundingBox(
        clonedText,
        scene.getElement(text.containerId),
        scene,
      );
    }
  }
};

const updateElements = (api: ExcalidrawImperativeAPI, params: unknown) => {
  const data = asRecord(params, "params");
  const rawUpdates = asArray(data.updates, "updates");

  const updates = new Map<string, Record<string, unknown>>();

  for (const rawUpdate of rawUpdates) {
    const update = asRecord(rawUpdate, "update");
    const { id } = update;

    if (typeof id !== "string" || !id) {
      throw new Error("Each update needs a string id");
    }

    const props: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(update)) {
      if (key === "id" || !UPDATE_PROPS.has(key) || value === undefined) {
        continue;
      }
      if (
        NUMERIC_PROPS.has(key) &&
        (typeof value !== "number" || !Number.isFinite(value))
      ) {
        throw new Error(`${key} must be a finite number`);
      }
      if ((key === "width" || key === "height") && (value as number) <= 0) {
        throw new Error(`${key} must be greater than 0`);
      }
      if (
        key === "opacity" &&
        ((value as number) < 0 || (value as number) > 100)
      ) {
        throw new Error("opacity must be between 0 and 100");
      }
      if (key === "locked" && typeof value !== "boolean") {
        throw new Error("locked must be a boolean");
      }
      if (
        (key === "strokeColor" ||
          key === "backgroundColor" ||
          key === "fillStyle" ||
          key === "strokeStyle") &&
        typeof value !== "string"
      ) {
        throw new Error(`${key} must be a string`);
      }
      if (
        key === "roundness" &&
        value !== null &&
        (typeof value !== "object" || Array.isArray(value))
      ) {
        throw new Error("roundness must be an object or null");
      }
      props[key] = value;
    }

    if (Object.keys(props).length === 0) {
      throw new Error(`Update for "${id}" has no supported props`);
    }

    updates.set(id, props);
  }

  const existing = api.getSceneElementsIncludingDeleted();
  const existingIds = new Set(existing.map((element) => element.id));
  const notFound = [...updates.keys()].filter((id) => !existingIds.has(id));

  const elements = existing.map((element) => {
    const props = updates.get(element.id);
    return props ? newElementWith(element, props as any) : element;
  });

  syncBoundTextLayout(elements, updates);

  api.updateScene({
    elements,
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });

  persistScene(api);

  return {
    updated: updates.size - notFound.length,
    notFound,
  };
};

const deleteElements = (api: ExcalidrawImperativeAPI, params: unknown) => {
  const data = asRecord(params, "params");
  const ids = new Set(
    asArray(data.ids, "ids").map((id) => {
      if (typeof id !== "string" || !id) {
        throw new Error("ids must contain non-empty strings");
      }
      return id;
    }),
  );

  const existing = api.getSceneElementsIncludingDeleted();
  const existingIds = new Set(existing.map((element) => element.id));
  const toDelete = new Set(
    existing
      .filter((element) => ids.has(element.id) && !element.isDeleted)
      .map((element) => element.id),
  );

  // deleting a container must not leave its bound label behind
  for (const element of existing) {
    if (
      element.type === "text" &&
      element.containerId &&
      toDelete.has(element.containerId) &&
      !element.isDeleted
    ) {
      toDelete.add(element.id);
    }
  }

  if (!toDelete.size) {
    return {
      deleted: 0,
      notFound: [...ids].filter((id) => !existingIds.has(id)),
    };
  }

  const elements = existing.map((element) => {
    if (toDelete.has(element.id)) {
      return newElementWith(element, { isDeleted: true });
    }

    let next = element;

    // a deleted frame releases its children instead of leaving them with a
    // dangling frameId
    if (next.frameId && toDelete.has(next.frameId)) {
      next = newElementWith(next, { frameId: null });
    }

    // arrows bound to deleted elements must not keep dangling bindings
    if (next.type === "arrow") {
      if (next.startBinding && toDelete.has(next.startBinding.elementId)) {
        next = newElementWith(next, { startBinding: null });
      }
      if (next.endBinding && toDelete.has(next.endBinding.elementId)) {
        next = newElementWith(next, { endBinding: null });
      }
    }

    // drop stale references from surviving boundElements lists
    if (next.boundElements?.some((bound) => toDelete.has(bound.id))) {
      const remaining = next.boundElements.filter(
        (bound) => !toDelete.has(bound.id),
      );
      next = newElementWith(next, {
        boundElements: remaining.length > 0 ? remaining : null,
      });
    }

    return next;
  });

  api.updateScene({
    elements,
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });

  persistScene(api);

  return {
    deleted: toDelete.size,
    notFound: [...ids].filter((id) => !existingIds.has(id)),
  };
};

const exportImage = async (api: ExcalidrawImperativeAPI) => {
  const elements = api.getSceneElements();

  if (!elements.length) {
    throw new Error("The canvas is empty");
  }

  const appState = api.getAppState();
  const blob = await exportScene({
    data: {
      elements,
      appState: cleanAppStateForExport(appState),
      files: api.getFiles(),
    },
    type: "png",
    config: {
      scale: 1,
      maxWidthOrHeight: 1600,
      theme: appState.theme,
      canvasBackgroundColor: appState.exportBackground
        ? appState.viewBackgroundColor
        : false,
    },
  });

  return {
    mimeType: blob.type || "image/png",
    data: await blobToBase64(blob),
    bytes: blob.size,
  };
};

export const handleMcpCommand = async (
  api: ExcalidrawImperativeAPI,
  command: string,
  params?: unknown,
) => {
  switch (command) {
    case "get_scene":
      return getScene(api);
    case "add_elements":
      return addElements(api, params);
    case "update_elements":
      return updateElements(api, params);
    case "delete_elements":
      return deleteElements(api, params);
    case "export_image":
      return exportImage(api);
    default:
      throw new Error(`Unknown MCP command: ${command}`);
  }
};
