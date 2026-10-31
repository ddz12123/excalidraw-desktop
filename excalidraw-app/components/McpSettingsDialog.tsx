import { useEffect, useRef, useState } from "react";

import { useExcalidrawAPI } from "@excalidraw/excalidraw";
import { useApp } from "@excalidraw/excalidraw/components/App";
import { Dialog } from "@excalidraw/excalidraw/components/Dialog";
import { FilledButton } from "@excalidraw/excalidraw/components/FilledButton";
import { Switch } from "@excalidraw/excalidraw/components/Switch";
import { TextField } from "@excalidraw/excalidraw/components/TextField";
import { copyTextToSystemClipboard } from "@excalidraw/excalidraw/clipboard";
import { useI18n } from "@excalidraw/excalidraw/i18n";

import "./McpSettingsDialog.scss";

import type { McpServerStatus, McpSettingsResponse } from "../../src/types/mcp";

type CopiedTarget = "config" | "endpoint" | null;

const MIN_TOKEN_LENGTH = 16;

const mcpBridge = window.desktop?.mcp;
let cachedSettings: McpSettingsResponse | null = null;

if (mcpBridge) {
  void mcpBridge
    .getSettings()
    .then((result) => {
      cachedSettings = result;
    })
    .catch(() => undefined);
}

export const McpSettingsDialog = ({ onClose }: { onClose: () => void }) => {
  const app = useApp();
  const excalidrawAPI = useExcalidrawAPI();
  const { t } = useI18n();

  const [enabled, setEnabled] = useState(
    () => cachedSettings?.settings.enabled ?? false,
  );
  const [port, setPort] = useState(() =>
    cachedSettings ? String(cachedSettings.settings.port) : "8765",
  );
  const [token, setToken] = useState(
    () => cachedSettings?.settings.token ?? "",
  );
  const [status, setStatus] = useState<McpServerStatus | null>(
    () => cachedSettings?.status ?? null,
  );
  const [loading, setLoading] = useState(!cachedSettings);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<CopiedTarget>(null);
  const loadTokenRef = useRef(0);

  useEffect(() => {
    if (!mcpBridge) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const requestId = ++loadTokenRef.current;

    if (!cachedSettings) {
      setLoading(true);
    }
    setError(null);

    mcpBridge
      .getSettings()
      .then((result) => {
        if (cancelled || requestId !== loadTokenRef.current) {
          return;
        }
        cachedSettings = result;
        setEnabled(result.settings.enabled);
        setPort(String(result.settings.port));
        setToken(result.settings.token);
        setStatus(result.status);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error ? loadError.message : String(loadError),
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const generateToken = () => {
    const bytes = new Uint8Array(24);
    app.ownerWindow.crypto.getRandomValues(bytes);
    setToken(
      Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(""),
    );
  };

  const endpoint = `http://127.0.0.1:${port || "8765"}/mcp`;
  const endpointWithToken = `${endpoint}?token=${encodeURIComponent(token)}`;
  const clientConfig = JSON.stringify(
    {
      mcpServers: {
        "excalidraw-desktop": {
          command: "npx",
          args: ["-y", "mcp-remote", endpointWithToken],
        },
      },
    },
    null,
    2,
  );

  const copyText = async (
    target: Exclude<CopiedTarget, null>,
    text: string,
  ) => {
    try {
      await copyTextToSystemClipboard(text);
      setCopied(target);
      app.ownerWindow.setTimeout(() => {
        setCopied((current) => (current === target ? null : current));
      }, 1500);
    } catch (copyError) {
      setError(
        copyError instanceof Error ? copyError.message : String(copyError),
      );
    }
  };

  const save = async () => {
    if (!mcpBridge) {
      return;
    }

    const portNumber = Number(port);
    if (
      !Number.isInteger(portNumber) ||
      portNumber < 1024 ||
      portNumber > 65535
    ) {
      setError(t("mcpServer.invalidPort"));
      return;
    }

    const trimmedToken = token.trim();
    if (trimmedToken.length < MIN_TOKEN_LENGTH) {
      setError(t("mcpServer.invalidToken"));
      return;
    }

    loadTokenRef.current += 1;
    setSaving(true);
    setError(null);

    try {
      const result = await mcpBridge.saveSettings({
        enabled,
        port: portNumber,
        token: trimmedToken,
      });

      cachedSettings = result;
      setPort(String(result.settings.port));
      setToken(result.settings.token);
      setStatus(result.status);

      if (result.status.error) {
        setError(result.status.error);
      } else {
        excalidrawAPI?.setToast({ message: t("mcpServer.saved") });
      }
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : String(saveError),
      );
    } finally {
      setSaving(false);
    }
  };

  const statusClass = status?.running
    ? "mcp-settings__status--running"
    : status?.error
    ? "mcp-settings__status--error"
    : "mcp-settings__status--stopped";

  const statusText = loading
    ? t("mcpServer.loading")
    : status?.running
    ? `${t("mcpServer.statusRunning")} · ${status.endpoint}`
    : status?.error
    ? `${t("mcpServer.statusError")} · ${status.error}`
    : t("mcpServer.statusStopped");

  return (
    <Dialog
      className="mcp-settings-dialog"
      title={t("mcpServer.title")}
      onCloseRequest={onClose}
      size={720}
    >
      <div className="mcp-settings">
        <p className="mcp-settings__description">
          {t("mcpServer.description")}
        </p>

        {!mcpBridge ? (
          <p className="mcp-settings__error">{t("mcpServer.desktopOnly")}</p>
        ) : (
          <>
            <div className="mcp-settings__toggle">
              <div>
                <div className="mcp-settings__label">
                  {t("mcpServer.enabled")}
                </div>
                <p className="mcp-settings__hint">
                  {t("mcpServer.enabledHint")}
                </p>
              </div>
              {loading ? (
                <span
                  className="mcp-settings__switch-skeleton"
                  aria-hidden="true"
                />
              ) : (
                <Switch
                  name="mcp-server-enabled"
                  checked={enabled}
                  onChange={setEnabled}
                  disabled={saving}
                />
              )}
            </div>

            <div className={`mcp-settings__status ${statusClass}`}>
              <span className="mcp-settings__status-dot" />
              <span>{statusText}</span>
            </div>

            <div className="mcp-settings__row">
              <TextField
                label={t("mcpServer.port")}
                value={port}
                onChange={setPort}
                fullWidth
              />
            </div>

            <div className="mcp-settings__row">
              <TextField
                label={t("mcpServer.token")}
                value={token}
                onChange={setToken}
                fullWidth
              />
              <FilledButton
                variant="outlined"
                onClick={generateToken}
                disabled={loading || saving}
              >
                {t("mcpServer.regenerateToken")}
              </FilledButton>
            </div>

            <div className="mcp-settings__config">
              <div className="mcp-settings__section-title">
                {t("mcpServer.clientConfig")}
              </div>
              <p className="mcp-settings__hint">
                {t("mcpServer.clientConfigHint")}
              </p>
              <pre className="mcp-settings__pre">{clientConfig}</pre>
              <div className="mcp-settings__config-actions">
                <FilledButton
                  variant="outlined"
                  onClick={() => void copyText("config", clientConfig)}
                >
                  {copied === "config"
                    ? t("mcpServer.copied")
                    : t("mcpServer.copyConfig")}
                </FilledButton>
                <FilledButton
                  variant="outlined"
                  onClick={() => void copyText("endpoint", endpointWithToken)}
                >
                  {copied === "endpoint"
                    ? t("mcpServer.copied")
                    : t("mcpServer.copyEndpoint")}
                </FilledButton>
              </div>
            </div>

            <p className="mcp-settings__hint">{t("mcpServer.toolsHint")}</p>

            {error && <p className="mcp-settings__error">{error}</p>}

            <div className="mcp-settings__actions">
              <FilledButton
                onClick={save}
                status={saving ? "loading" : null}
                disabled={loading || saving}
              >
                {t("mcpServer.save")}
              </FilledButton>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
};
