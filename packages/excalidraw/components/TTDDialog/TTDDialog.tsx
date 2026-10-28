import { useCallback, useEffect, useState } from "react";

import { addEventListener } from "@excalidraw/common";

import { useUIAppState } from "../../context/ui-appState";
import { t } from "../../i18n";
import { useApp } from "../App";
import { Dialog } from "../Dialog";

import MermaidToExcalidraw from "./MermaidToExcalidraw";
import { isModuleLoadError } from "./utils/mermaidError";

import "./TTDDialog.scss";

import type { MermaidToExcalidrawLibProps } from "./types";

const loadMermaidToExcalidrawLib = (
  onChunkLoadError: (api: MermaidToExcalidrawLibProps["api"]) => void,
): MermaidToExcalidrawLibProps["api"] => {
  const api: MermaidToExcalidrawLibProps["api"] = import(
    "@excalidraw/mermaid-to-excalidraw"
  ).then((lib) => ({
    // mermaid lazy-loads a chunk per diagram type, which can fail to load
    // (e.g. offline) even though the lib itself loaded fine
    parseMermaidToExcalidraw: async (definition, config) => {
      try {
        return await lib.parseMermaidToExcalidraw(definition, config);
      } catch (error) {
        if (isModuleLoadError(error)) {
          onChunkLoadError(api);
        }
        throw error;
      }
    },
  }));
  // called from state initializers/updaters, which React may invoke more than
  // once and discard the result -> don't let a discarded promise's rejection
  // go unhandled (consumers awaiting `api` still get the rejection)
  api.catch(() => {});
  return api;
};

const TTDDialogBase = () => {
  const app = useApp();

  const [mermaidToExcalidrawLib, setMermaidToExcalidrawLib] =
    useState<MermaidToExcalidrawLibProps>(() => ({
      status: "loading",
      api: loadMermaidToExcalidrawLib((api) => setLoadError(api)),
    }));

  // `api` (or one of the chunks it lazy-loads) failed to load
  const setLoadError = useCallback(
    (api: MermaidToExcalidrawLibProps["api"]) => {
      const reloadRequired = navigator.onLine;
      setMermaidToExcalidrawLib((prev) =>
        prev.api === api
          ? {
              ...prev,
              status: "error",
              reloadRequired: prev.reloadRequired || reloadRequired,
            }
          : prev,
      );
    },
    [],
  );

  const retryLoadingMermaidToExcalidrawLib = useCallback(() => {
    setMermaidToExcalidrawLib((prev) =>
      prev.status === "error"
        ? {
            ...prev,
            status: "loading",
            api: loadMermaidToExcalidrawLib(setLoadError),
          }
        : prev,
    );
  }, [setLoadError]);

  const { api: mermaidToExcalidrawLibApi } = mermaidToExcalidrawLib;
  useEffect(() => {
    const api = mermaidToExcalidrawLibApi;
    api.then(
      () => {
        setMermaidToExcalidrawLib((prev) =>
          prev.api === api
            ? { ...prev, status: "loaded", reloadRequired: false }
            : prev,
        );
      },
      (error: any) => {
        console.error("Failed to load mermaid-to-excalidraw", error);
        setLoadError(api);
      },
    );
  }, [mermaidToExcalidrawLibApi, setLoadError]);

  useEffect(() => {
    if (mermaidToExcalidrawLib.status !== "error") {
      return;
    }
    return addEventListener(
      app.ownerWindow,
      "online",
      retryLoadingMermaidToExcalidrawLib,
    );
  }, [app, mermaidToExcalidrawLib.status, retryLoadingMermaidToExcalidrawLib]);

  return (
    <Dialog
      className="ttd-dialog"
      onCloseRequest={() => {
        app.setOpenDialog(null);
      }}
      size={1520}
      title={false}
      autofocus={false}
    >
      <p className="dialog-mermaid-title">{t("mermaid.title")}</p>
      <MermaidToExcalidraw
        mermaidToExcalidrawLib={mermaidToExcalidrawLib}
        onRetryLoad={retryLoadingMermaidToExcalidrawLib}
        isActive
      />
    </Dialog>
  );
};

/**
 * Mermaid to Excalidraw dialog
 */
export const TTDDialog = () => {
  const appState = useUIAppState();

  if (appState.openDialog?.name !== "ttd") {
    return null;
  }

  return <TTDDialogBase />;
};
