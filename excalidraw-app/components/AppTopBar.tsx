import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import clsx from "clsx";

import { useExcalidrawAPI } from "@excalidraw/excalidraw";
import { useApp } from "@excalidraw/excalidraw/components/App";
import {
  downloadIcon,
  GithubIcon,
  mermaidLogoIcon,
} from "@excalidraw/excalidraw/components/icons";
import DropdownMenu from "@excalidraw/excalidraw/components/dropdownMenu/DropdownMenu";
import { MainMenu } from "@excalidraw/excalidraw/index";
import { useI18n } from "@excalidraw/excalidraw/i18n";

import type { Theme } from "@excalidraw/element/types";

import { LanguageList } from "../app-language/LanguageList";

import { AppLogo } from "./AppLogo";

import "./AppTopBar.scss";

const GITHUB_REPO_URL = "https://github.com/ddz12123/excalidraw-desktop";

const MinimizeIcon = () => (
  <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
    <path d="M1 5h8" stroke="currentColor" strokeWidth="1" />
  </svg>
);

const MaximizeIcon = () => (
  <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
    <rect
      x="1.5"
      y="1.5"
      width="7"
      height="7"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
    />
  </svg>
);

const RestoreIcon = () => (
  <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
    <rect
      x="1"
      y="3"
      width="6"
      height="6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
    />
    <path d="M3 3V1h6v6H7" fill="none" stroke="currentColor" strokeWidth="1" />
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
    <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1" />
  </svg>
);

const McpIcon = () => (
  <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
    <rect
      x="3"
      y="3.5"
      width="14"
      height="5"
      rx="1.5"
      fill="none"
      stroke="currentColor"
    />
    <rect
      x="3"
      y="11.5"
      width="14"
      height="5"
      rx="1.5"
      fill="none"
      stroke="currentColor"
    />
    <circle cx="6.5" cy="6" r="0.9" fill="currentColor" />
    <circle cx="6.5" cy="14" r="0.9" fill="currentColor" />
  </svg>
);

const TopBarMenu = ({
  id,
  label,
  openMenu,
  onOpenMenuChange,
  dark,
  children,
}: {
  id: string;
  label: string;
  openMenu: string | null;
  onOpenMenuChange: (menu: string | null) => void;
  dark: boolean;
  children: React.ReactNode;
}) => {
  const open = openMenu === id;

  return (
    <div
      className={clsx("excalidraw", "app-top-bar__menu-scope", {
        "theme--dark": dark,
      })}
    >
      <DropdownMenu open={open}>
        <DropdownMenu.Trigger
          className="app-top-bar__menu-trigger"
          onToggle={() => onOpenMenuChange(open ? null : id)}
        >
          {label}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content
          className="app-top-bar__menu-content"
          align="start"
          onClickOutside={() => onOpenMenuChange(null)}
          onSelect={() => onOpenMenuChange(null)}
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu>
    </div>
  );
};

export const AppTopBar = ({
  editorTheme,
  appTheme,
  onThemeChange,
  onOpenMermaid,
  onOpenMcpSettings,
}: {
  editorTheme: Theme;
  appTheme: Theme | "system";
  onThemeChange: (theme: Theme | "system") => void;
  onOpenMermaid: () => void;
  onOpenMcpSettings: () => void;
}) => {
  const app = useApp();
  const excalidrawAPI = useExcalidrawAPI();
  const { t } = useI18n();
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);

  const controls = window.desktop?.windowControls;
  const canCheckUpdates = !!window.desktop?.checkForUpdates;
  const canUseMcp = !!window.desktop?.mcp;

  useEffect(() => {
    setContainer(app.ownerDocument.getElementById("app-top-bar-root"));
  }, [app]);

  useEffect(() => {
    if (!controls) {
      return;
    }

    let cancelled = false;
    void controls.isMaximized().then((maximized) => {
      if (!cancelled) {
        setIsMaximized(maximized);
      }
    });
    const unsubscribe = controls.onMaximizedChange(setIsMaximized);

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [controls]);

  const checkForUpdates = useCallback(async () => {
    if (!window.desktop?.checkForUpdates) {
      return;
    }

    const result = await window.desktop.checkForUpdates();
    if (!result.supported) {
      excalidrawAPI?.setToast({
        message: t("labels.updatesUnavailable"),
      });
    } else if (result.checking) {
      excalidrawAPI?.setToast({ message: t("labels.checkingForUpdates") });
    }
  }, [excalidrawAPI, t]);

  if (!container) {
    return null;
  }

  return createPortal(
    <div
      className={clsx("app-top-bar", {
        "app-top-bar--dark": editorTheme === "dark",
      })}
    >
      <div className="app-top-bar__brand">
        <span className="app-top-bar__logo">
          <AppLogo />
        </span>
        <span className="app-top-bar__title">Excalidraw</span>
      </div>

      <nav className="app-top-bar__menus">
        <TopBarMenu
          id="file"
          label={t("labels.file")}
          openMenu={openMenu}
          onOpenMenuChange={setOpenMenu}
          dark={editorTheme === "dark"}
        >
          <MainMenu.DefaultItems.LoadScene />
          <MainMenu.DefaultItems.SaveToActiveFile />
          <MainMenu.DefaultItems.Export />
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.Separator />
          <MainMenu.DefaultItems.ClearCanvas />
        </TopBarMenu>

        <TopBarMenu
          id="edit"
          label={t("labels.edit")}
          openMenu={openMenu}
          onOpenMenuChange={setOpenMenu}
          dark={editorTheme === "dark"}
        >
          <MainMenu.DefaultItems.CommandPalette />
          <MainMenu.DefaultItems.SearchMenu />
          <MainMenu.Separator />
          <MainMenu.DefaultItems.Preferences />
          {canUseMcp && (
            <>
              <MainMenu.Separator />
              <MainMenu.Item icon={<McpIcon />} onSelect={onOpenMcpSettings}>
                {t("labels.mcpServer")}
              </MainMenu.Item>
            </>
          )}
        </TopBarMenu>

        <TopBarMenu
          id="view"
          label={t("labels.view")}
          openMenu={openMenu}
          onOpenMenuChange={setOpenMenu}
          dark={editorTheme === "dark"}
        >
          <MainMenu.DefaultItems.ToggleTheme
            allowSystemTheme
            theme={appTheme}
          />
          <MainMenu.ItemCustom>
            <LanguageList style={{ width: "100%" }} />
          </MainMenu.ItemCustom>
          <MainMenu.DefaultItems.ChangeCanvasBackground />
        </TopBarMenu>

        <TopBarMenu
          id="insert"
          label={t("labels.insert")}
          openMenu={openMenu}
          onOpenMenuChange={setOpenMenu}
          dark={editorTheme === "dark"}
        >
          <MainMenu.Item icon={mermaidLogoIcon} onSelect={onOpenMermaid}>
            {t("toolBar.mermaidToExcalidraw")}
          </MainMenu.Item>
        </TopBarMenu>

        <TopBarMenu
          id="help"
          label={t("helpDialog.title")}
          openMenu={openMenu}
          onOpenMenuChange={setOpenMenu}
          dark={editorTheme === "dark"}
        >
          <MainMenu.DefaultItems.Help />
          {canCheckUpdates && (
            <MainMenu.Item
              icon={downloadIcon}
              onSelect={() => void checkForUpdates()}
            >
              {t("labels.checkForUpdates")}
            </MainMenu.Item>
          )}
          <MainMenu.Separator />
          <MainMenu.ItemLink icon={GithubIcon} href={GITHUB_REPO_URL}>
            GitHub
          </MainMenu.ItemLink>
        </TopBarMenu>
      </nav>

      <div className="app-top-bar__spacer" />

      {controls && (
        <div className="app-top-bar__window-controls">
          <button
            type="button"
            className="app-top-bar__window-button"
            title="Minimize"
            aria-label="Minimize"
            onClick={() => controls.minimize()}
          >
            <MinimizeIcon />
          </button>
          <button
            type="button"
            className="app-top-bar__window-button"
            title={isMaximized ? "Restore" : "Maximize"}
            aria-label={isMaximized ? "Restore" : "Maximize"}
            onClick={() => controls.toggleMaximize()}
          >
            {isMaximized ? <RestoreIcon /> : <MaximizeIcon />}
          </button>
          <button
            type="button"
            className="app-top-bar__window-button app-top-bar__window-button--close"
            title={t("buttons.close")}
            aria-label={t("buttons.close")}
            onClick={() => controls.close()}
          >
            <CloseIcon />
          </button>
        </div>
      )}
    </div>,
    container,
  );
};
