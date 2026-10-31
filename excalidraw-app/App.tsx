import {
  Excalidraw,
  MainMenu,
  CaptureUpdateAction,
  ExcalidrawAPIProvider,
  useExcalidrawAPI,
} from "@excalidraw/excalidraw";
import {
  CommandPalette,
  DEFAULT_CATEGORIES,
} from "@excalidraw/excalidraw/components/CommandPalette/CommandPalette";
import {
  GithubIcon,
  mermaidLogoIcon,
  settingsIcon,
} from "@excalidraw/excalidraw/components/icons";
import { OverwriteConfirmDialog } from "@excalidraw/excalidraw/components/OverwriteConfirm/OverwriteConfirm";
import {
  EVENT,
  debounce,
  isTestEnv,
  preventUnload,
  resolvablePromise,
} from "@excalidraw/common";
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "@excalidraw/excalidraw/i18n";
import { isElementLink } from "@excalidraw/element";
import {
  restoreAppState,
  restoreElements,
} from "@excalidraw/excalidraw/data/restore";
import { newElementWith } from "@excalidraw/element";
import { isInitializedImageElement } from "@excalidraw/element";

import { useHandleLibrary } from "@excalidraw/excalidraw/data/library";

import type {
  NonDeletedExcalidrawElement,
  OrderedExcalidrawElement,
  FileId,
} from "@excalidraw/element/types";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawInitialDataState,
  UIAppState,
  ExcalidrawProps,
} from "@excalidraw/excalidraw/types";
import type { ResolvablePromise } from "@excalidraw/common/utils";

import {
  LibraryIndexedDBAdapter,
  LibraryLocalStorageMigrationAdapter,
  LocalData,
  localStorageQuotaExceededAtom,
} from "./data/LocalData";

import CustomStats from "./CustomStats";
import { Provider, useAtomValue, appJotaiStore } from "./app-jotai";
import { STORAGE_KEYS, SYNC_BROWSER_TABS_TIMEOUT } from "./app_constants";
import { AppTopBar } from "./components/AppTopBar";
import { McpSettingsDialog } from "./components/McpSettingsDialog";
import { handleMcpCommand } from "./mcp/commands";
import { AppWelcomeScreen } from "./components/AppWelcomeScreen";
import { TopErrorBoundary } from "./components/TopErrorBoundary";

import { updateStaleImageStatuses } from "./data/FileManager";
import { FileStatusStore } from "./data/fileStatusStore";
import { importFromLocalStorage } from "./data/localStorage";

import { isBrowserStorageStateNewer } from "./data/tabSync";
import { useHandleAppTheme } from "./useHandleAppTheme";
import { getPreferredLanguage } from "./app-language/language-detector";
import { useAppLangCode } from "./app-language/language-state";

import "./index.scss";

const GITHUB_REPO_URL = "https://github.com/ddz12123/excalidraw-desktop";

const initializeScene = (): ExcalidrawInitialDataState => {
  const localDataState = importFromLocalStorage();

  return {
    elements: restoreElements(localDataState?.elements, null, {
      repairBindings: true,
      deleteInvisibleElements: true,
    }),
    appState: restoreAppState(localDataState?.appState, null),
  };
};

const ExcalidrawWrapper = () => {
  const excalidrawAPI = useExcalidrawAPI();

  const { editorTheme, appTheme, setAppTheme } = useHandleAppTheme();

  const [langCode, setLangCode] = useAppLangCode();

  const [isMcpSettingsOpen, setIsMcpSettingsOpen] = useState(false);

  const initialStatePromiseRef = useRef<{
    promise: ResolvablePromise<ExcalidrawInitialDataState | null>;
  }>({ promise: null! });
  if (!initialStatePromiseRef.current.promise) {
    initialStatePromiseRef.current.promise =
      resolvablePromise<ExcalidrawInitialDataState | null>();
  }

  useHandleLibrary({
    excalidrawAPI,
    adapter: LibraryIndexedDBAdapter,
    migrationAdapter: LibraryLocalStorageMigrationAdapter,
  });

  useEffect(() => {
    if (!excalidrawAPI) {
      return;
    }

    return window.desktop?.mcp?.onCommand((request) =>
      handleMcpCommand(excalidrawAPI, request.command, request.params),
    );
  }, [excalidrawAPI]);

  // ---------------------------------------------------------------------------
  // initial scene + local file loading
  // ---------------------------------------------------------------------------
  const loadFiles = useCallback(
    (scene: ExcalidrawInitialDataState, isInitialLoad = false) => {
      if (!excalidrawAPI) {
        return;
      }

      const fileIds =
        scene.elements?.reduce((acc, element) => {
          if (isInitializedImageElement(element)) {
            return acc.concat(element.fileId);
          }
          return acc;
        }, [] as FileId[]) || [];

      if (isInitialLoad) {
        LocalData.fileStorage
          .getFiles(fileIds)
          .then(({ loadedFiles, erroredFiles }) => {
            if (loadedFiles.length) {
              excalidrawAPI.addFiles(loadedFiles);
            }
            updateStaleImageStatuses({
              excalidrawAPI,
              erroredFiles,
              elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
            });
          });
        // on fresh load, clear unused files from IDB (from previous session)
        LocalData.fileStorage.clearObsoleteFiles({
          currentFileIds: fileIds,
        });
      }
    },
    [excalidrawAPI],
  );

  useEffect(() => {
    if (!excalidrawAPI) {
      return;
    }

    const scene = initializeScene();
    initialStatePromiseRef.current.promise.resolve(scene);
    loadFiles(scene, /* isInitialLoad */ true);

    const syncData = debounce(() => {
      if (isTestEnv()) {
        return;
      }
      if (!document.hidden) {
        // don't sync if local state is newer or identical to browser state
        if (isBrowserStorageStateNewer(STORAGE_KEYS.VERSION_DATA_STATE)) {
          const localDataState = importFromLocalStorage();
          setLangCode(getPreferredLanguage());
          excalidrawAPI.updateScene({
            ...localDataState,
            captureUpdate: CaptureUpdateAction.NEVER,
          });
          LibraryIndexedDBAdapter.load().then((data) => {
            if (data) {
              excalidrawAPI.updateLibrary({
                libraryItems: data.libraryItems,
              });
            }
          });
        }

        if (isBrowserStorageStateNewer(STORAGE_KEYS.VERSION_FILES)) {
          const elements = excalidrawAPI.getSceneElementsIncludingDeleted();
          const currFiles = excalidrawAPI.getFiles();
          const fileIds =
            elements?.reduce((acc, element) => {
              if (
                isInitializedImageElement(element) &&
                // only load and update images that aren't already loaded
                !currFiles[element.fileId]
              ) {
                return acc.concat(element.fileId);
              }
              return acc;
            }, [] as FileId[]) || [];
          if (fileIds.length) {
            LocalData.fileStorage
              .getFiles(fileIds)
              .then(({ loadedFiles, erroredFiles }) => {
                if (loadedFiles.length) {
                  excalidrawAPI.addFiles(loadedFiles);
                }
                updateStaleImageStatuses({
                  excalidrawAPI,
                  erroredFiles,
                  elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
                });
              });
          }
        }
      }
    }, SYNC_BROWSER_TABS_TIMEOUT);

    const onUnload = () => {
      LocalData.flushSave();
    };

    const visibilityChange = (event: FocusEvent | Event) => {
      if (event.type === EVENT.BLUR || document.hidden) {
        LocalData.flushSave();
      }
      if (
        event.type === EVENT.VISIBILITY_CHANGE ||
        event.type === EVENT.FOCUS
      ) {
        syncData();
      }
    };

    window.addEventListener(EVENT.UNLOAD, onUnload, false);
    window.addEventListener(EVENT.BLUR, visibilityChange, false);
    document.addEventListener(EVENT.VISIBILITY_CHANGE, visibilityChange, false);
    window.addEventListener(EVENT.FOCUS, visibilityChange, false);
    return () => {
      window.removeEventListener(EVENT.UNLOAD, onUnload, false);
      window.removeEventListener(EVENT.BLUR, visibilityChange, false);
      window.removeEventListener(EVENT.FOCUS, visibilityChange, false);
      document.removeEventListener(
        EVENT.VISIBILITY_CHANGE,
        visibilityChange,
        false,
      );
    };
  }, [excalidrawAPI, setLangCode, loadFiles]);

  useEffect(() => {
    const unloadHandler = (event: BeforeUnloadEvent) => {
      LocalData.flushSave();

      if (
        excalidrawAPI &&
        LocalData.fileStorage.shouldPreventUnload(
          excalidrawAPI.getSceneElements(),
        )
      ) {
        if (import.meta.env.VITE_APP_DISABLE_PREVENT_UNLOAD !== "true") {
          preventUnload(event);
        } else {
          console.warn(
            "preventing unload disabled (VITE_APP_DISABLE_PREVENT_UNLOAD)",
          );
        }
      }
    };
    window.addEventListener(EVENT.BEFORE_UNLOAD, unloadHandler);
    return () => {
      window.removeEventListener(EVENT.BEFORE_UNLOAD, unloadHandler);
    };
  }, [excalidrawAPI]);

  const onChange = (
    elements: readonly OrderedExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
  ) => {
    // this check is redundant, but since this is a hot path, it's best
    // not to evaluate the nested expression every time
    if (!LocalData.isSavePaused()) {
      LocalData.save(elements, appState, files, () => {
        if (excalidrawAPI) {
          let didChange = false;

          const elements = excalidrawAPI
            .getSceneElementsIncludingDeleted()
            .map((element) => {
              if (
                LocalData.fileStorage.shouldUpdateImageElementStatus(element)
              ) {
                const newElement = newElementWith(element, { status: "saved" });
                if (newElement !== element) {
                  didChange = true;
                }
                return newElement;
              }
              return element;
            });

          if (didChange) {
            excalidrawAPI.updateScene({
              elements,
              captureUpdate: CaptureUpdateAction.NEVER,
            });
          }
        }
      });
    }
  };

  const renderCustomStats = (
    elements: readonly NonDeletedExcalidrawElement[],
    appState: UIAppState,
  ) => {
    return (
      <CustomStats
        setToast={(message) => excalidrawAPI!.setToast({ message })}
        appState={appState}
        elements={elements}
      />
    );
  };

  const localStorageQuotaExceeded = useAtomValue(localStorageQuotaExceededAtom);

  const onExport: Required<ExcalidrawProps>["onExport"] = useCallback(
    async function* () {
      let snapshot = FileStatusStore.getSnapshot();
      const { pending, total } = FileStatusStore.getPendingCount(
        snapshot.value,
      );
      if (pending === 0) {
        return;
      }

      yield {
        type: "progress",
        progress: (total - pending) / total,
        message: `Loading images (${total - pending}/${total})...`,
      };

      while (true) {
        snapshot = await FileStatusStore.pull(snapshot.version);
        const { pending: nowPending, total: nowTotal } =
          FileStatusStore.getPendingCount(snapshot.value);

        yield {
          type: "progress",
          progress: (nowTotal - nowPending) / nowTotal,
          message: `Loading images (${nowTotal - nowPending}/${nowTotal})...`,
        };

        if (nowPending === 0) {
          await new Promise((r) => setTimeout(r, 500));
          yield {
            type: "progress",
            message: `Preparing export...`,
          };
          return;
        }
      }
    },
    [],
  );

  const onOpenMermaid = useCallback(() => {
    excalidrawAPI?.updateScene({
      appState: { openDialog: { name: "ttd", tab: "mermaid" } },
    });
  }, [excalidrawAPI]);

  return (
    <div className="excalidraw-app">
      <div id="app-top-bar-root" className="app-top-bar-root" />
      <div className="app-top-bar-editor">
        <Excalidraw
          onChange={onChange}
          onExport={onExport}
          initialData={initialStatePromiseRef.current.promise}
          UIOptions={{
            canvasActions: {
              toggleTheme: true,
            },
          }}
          langCode={langCode}
          renderCustomStats={renderCustomStats}
          detectScroll={false}
          handleKeyboardGlobally={true}
          autoFocus={true}
          theme={editorTheme}
          onThemeChange={setAppTheme}
          onLinkOpen={(element, event) => {
            if (element.link && isElementLink(element.link)) {
              event.preventDefault();
              excalidrawAPI?.setViewport({
                target: element.link,
                fit: "scale-down",
                animation: true,
              });
            }
          }}
        >
          <MainMenu />
          <AppTopBar
            editorTheme={editorTheme}
            appTheme={appTheme}
            onThemeChange={setAppTheme}
            onOpenMermaid={onOpenMermaid}
            onOpenMcpSettings={() => setIsMcpSettingsOpen(true)}
          />
          <AppWelcomeScreen />
          <OverwriteConfirmDialog>
            <OverwriteConfirmDialog.Actions.ExportToImage />
            <OverwriteConfirmDialog.Actions.SaveToDisk />
          </OverwriteConfirmDialog>

          {isMcpSettingsOpen && (
            <McpSettingsDialog onClose={() => setIsMcpSettingsOpen(false)} />
          )}

          {localStorageQuotaExceeded && (
            <div className="alert alert--danger">
              {t("alerts.localStorageQuotaExceeded")}
            </div>
          )}

          <CommandPalette
            customCommandPaletteItems={[
              {
                label: t("toolBar.mermaidToExcalidraw"),
                category: DEFAULT_CATEGORIES.tools,
                predicate: true,
                icon: mermaidLogoIcon,
                keywords: ["mermaid", "diagram", "chart"],
                perform: onOpenMermaid,
              },
              {
                label: "GitHub",
                icon: GithubIcon,
                category: DEFAULT_CATEGORIES.links,
                predicate: true,
                keywords: ["issues", "bugs", "requests", "report", "source"],
                perform: () => {
                  window.open(GITHUB_REPO_URL, "_blank", "noopener noreferrer");
                },
              },
              {
                label: t("labels.mcpServer"),
                icon: settingsIcon,
                category: DEFAULT_CATEGORIES.tools,
                predicate: !!window.desktop?.mcp,
                keywords: ["mcp", "claude", "cursor", "server", "ai"],
                perform: () => setIsMcpSettingsOpen(true),
              },
            ]}
          />
        </Excalidraw>
      </div>
    </div>
  );
};

const ExcalidrawApp = () => {
  return (
    <TopErrorBoundary>
      <Provider store={appJotaiStore}>
        <ExcalidrawAPIProvider>
          <ExcalidrawWrapper />
        </ExcalidrawAPIProvider>
      </Provider>
    </TopErrorBoundary>
  );
};

export default ExcalidrawApp;
