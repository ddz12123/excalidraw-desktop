import { arrayToMap } from "@excalidraw/common";
import { syncMovedIndices } from "@excalidraw/element";
import { pointFrom } from "@excalidraw/math";
import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  exportScene,
  newElementWith,
} from "@excalidraw/excalidraw";
import { cleanAppStateForExport } from "@excalidraw/excalidraw/appState";

import type { ExcalidrawElementSkeleton } from "@excalidraw/element";
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
  const skeletons = normalizeSkeletons(
    asArray(data.elements, "elements") as ExcalidrawElementSkeleton[],
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

  const elements = existing.map((element) =>
    toDelete.has(element.id)
      ? newElementWith(element, { isDeleted: true })
      : element,
  );

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
