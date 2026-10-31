import { createHash, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { app } from "electron";
import { z } from "zod";

import { invokeRenderer } from "./bridge";

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Server as HttpServer } from "node:http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { McpServerSettings, McpServerStatus } from "../../types/mcp";

const endpointFor = (port: number) => `http://127.0.0.1:${port}/mcp`;

let httpServer: HttpServer | null = null;
let lastStatus: McpServerStatus = {
  running: false,
  port: 0,
  endpoint: "",
  error: null,
};

const textResult = (value: unknown): CallToolResult => ({
  content: [
    {
      type: "text",
      text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
    },
  ],
});

const errorResult = (error: unknown): CallToolResult => ({
  isError: true,
  content: [
    {
      type: "text",
      text: error instanceof Error ? error.message : String(error),
    },
  ],
});

const runTool = async (
  handler: () => Promise<CallToolResult>,
): Promise<CallToolResult> => {
  try {
    return await handler();
  } catch (error) {
    console.error("[mcp] tool call failed", error);
    return errorResult(error);
  }
};

const createMcpServer = () => {
  const server = new McpServer({
    name: "excalidraw-desktop",
    version: app.getVersion(),
  });

  server.registerTool(
    "get_scene",
    {
      title: "Get canvas scene",
      description:
        "Returns the current Excalidraw canvas as JSON: non-deleted elements plus background, grid, zoom and selection info. Call this before editing to get element ids, positions and sizes.",
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    () => runTool(async () => textResult(await invokeRenderer("get_scene"))),
  );

  server.registerTool(
    "add_elements",
    {
      title: "Add elements",
      description: [
        "Add elements to the canvas from Excalidraw skeleton objects and return the created element ids.",
        "Shapes (rectangle, ellipse, diamond) need { type, x, y, width, height }. Text needs { type: 'text', text, x, y }. Arrows and lines accept width/height (default 100x0) and optional points; width 0 or height 0 is valid for vertical/horizontal arrows, but prefer passing explicit points for them. Arrow start/end ids can only reference elements created in the same call. Frames need child element ids.",
        "Skeletons support labels (label: { text, fontSize? }), temporary ids (id, needed when other elements reference them), and arrow bindings (start: { id } / end: { id }).",
        "Validation: unsupported types are rejected; every element needs numeric x/y; text needs a non-empty text; image needs a fileId of an existing file (this server cannot create images).",
        "Style properties: strokeColor, backgroundColor, fillStyle, strokeStyle, strokeWidth, roughness, opacity, roundness, angle.",
        "Coordinates are scene coordinates; lay elements out left-to-right / top-to-bottom with spacing to avoid overlaps.",
      ].join(" "),
      inputSchema: {
        elements: z
          .array(z.record(z.string(), z.unknown()))
          .min(1)
          .describe("Excalidraw skeleton elements to add"),
        select: z
          .boolean()
          .optional()
          .describe("Select the newly created elements (default false)"),
      },
    },
    ({ elements, select }) =>
      runTool(async () =>
        textResult(
          await invokeRenderer("add_elements", { elements, select }, 30_000),
        ),
      ),
  );

  server.registerTool(
    "update_elements",
    {
      title: "Update elements",
      description: [
        "Update existing elements by id. Each update is an object with an id plus any of these props:",
        "x, y, width, height, angle, strokeColor, backgroundColor, fillStyle, strokeWidth, strokeStyle, roughness, opacity, roundness, locked.",
        "Text content and labels cannot be changed in place; delete the text element and add a new one instead.",
        "Moving or resizing a shape keeps its bound label attached and re-wrapped.",
      ].join(" "),
      inputSchema: {
        updates: z
          .array(z.record(z.string(), z.unknown()))
          .min(1)
          .describe("Array of { id, ...props } update objects"),
      },
    },
    ({ updates }) =>
      runTool(async () =>
        textResult(await invokeRenderer("update_elements", { updates })),
      ),
  );

  server.registerTool(
    "delete_elements",
    {
      title: "Delete elements",
      description:
        "Delete elements from the canvas by id. Deleting a shape also deletes its bound label, unbinds arrows pointing at it and releases the children of a deleted frame.",
      inputSchema: {
        ids: z
          .array(z.string())
          .min(1)
          .describe("Element ids to delete (get them from get_scene)"),
      },
    },
    ({ ids }) =>
      runTool(async () =>
        textResult(await invokeRenderer("delete_elements", { ids })),
      ),
  );

  server.registerTool(
    "export_image",
    {
      title: "Export canvas image",
      description:
        "Render the current canvas to a PNG and return it as an image, so you can visually verify the result. Call get_scene first to inspect the elements.",
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    () =>
      runTool(async () => {
        const image = await invokeRenderer<{
          mimeType: string;
          data: string;
          bytes: number;
        }>("export_image", undefined, 60_000);

        return {
          content: [
            {
              type: "image",
              data: image.data,
              mimeType: image.mimeType,
            },
            {
              type: "text",
              text: `Exported the current canvas as a PNG (${Math.max(
                1,
                Math.round(image.bytes / 1024),
              )} KB).`,
            },
          ],
        };
      }),
  );

  return server;
};

const isAuthorized = (
  settings: McpServerSettings,
  request: IncomingMessage,
  url: URL,
) => {
  const header = request.headers.authorization ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";
  const token = bearer || url.searchParams.get("token") || "";

  if (token.length === 0 || settings.token.length === 0) {
    return false;
  }

  // compare fixed-length digests so the comparison is constant-time and
  // the token length never leaks
  const provided = createHash("sha256").update(token).digest();
  const expected = createHash("sha256").update(settings.token).digest();

  return timingSafeEqual(provided, expected);
};

const handleRequest = async (
  settings: McpServerSettings,
  request: IncomingMessage,
  response: ServerResponse,
) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  if (url.pathname !== "/mcp") {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  if (request.method === "OPTIONS") {
    response.writeHead(204, { Allow: "POST, OPTIONS" });
    response.end();
    return;
  }

  if (!isAuthorized(settings, request, url)) {
    response.writeHead(401, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  if (request.method !== "POST") {
    response.writeHead(405, {
      "content-type": "application/json",
      Allow: "POST",
    });
    response.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    // rejects requests whose Host header was not produced for this endpoint,
    // so a malicious page cannot reach the local server via DNS rebinding
    enableDnsRebindingProtection: true,
    allowedHosts: [
      `127.0.0.1:${settings.port}`,
      `localhost:${settings.port}`,
      `[::1]:${settings.port}`,
    ],
  });

  response.on("close", () => {
    void transport.close().catch(() => undefined);
    void server.close().catch(() => undefined);
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(request, response);
  } catch (error) {
    console.error("[mcp] request failed", error);
    if (!response.headersSent) {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "Internal server error" }));
    }
  }
};

let lifecycle: Promise<unknown> = Promise.resolve();

const enqueueLifecycle = <T>(task: () => Promise<T>): Promise<T> => {
  const run = lifecycle.then(task);
  lifecycle = run.catch(() => undefined);
  return run;
};

const stopInternal = async (): Promise<void> => {
  const server = httpServer;
  httpServer = null;

  if (!server) {
    return;
  }

  await new Promise<void>((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections();
  });

  lastStatus = { ...lastStatus, running: false };
};

const startInternal = async (
  settings: McpServerSettings,
): Promise<McpServerStatus> => {
  await stopInternal();

  if (!settings.enabled) {
    lastStatus = {
      running: false,
      port: settings.port,
      endpoint: endpointFor(settings.port),
      error: null,
    };
    return lastStatus;
  }

  const server = createServer((request, response) => {
    void handleRequest(settings, request, response).catch((error) => {
      console.error("[mcp] unhandled request error", error);
      if (!response.headersSent) {
        response.writeHead(500, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "Internal server error" }));
      }
    });
  });

  try {
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => reject(error);
      server.once("error", onError);
      server.listen(settings.port, "127.0.0.1", () => {
        server.off("error", onError);
        resolve();
      });
    });
  } catch (error) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    lastStatus = {
      running: false,
      port: settings.port,
      endpoint: endpointFor(settings.port),
      error: error instanceof Error ? error.message : String(error),
    };
    return lastStatus;
  }

  httpServer = server;
  lastStatus = {
    running: true,
    port: settings.port,
    endpoint: endpointFor(settings.port),
    error: null,
  };
  console.info(`[mcp] listening on ${lastStatus.endpoint}`);
  return lastStatus;
};

export const startMcpServer = (
  settings: McpServerSettings,
): Promise<McpServerStatus> => enqueueLifecycle(() => startInternal(settings));

export const stopMcpServer = (): Promise<void> =>
  enqueueLifecycle(() => stopInternal());

export const getMcpStatus = () => lastStatus;

/** resolves after any queued start/stop completes */
export const whenMcpSettled = (): Promise<void> =>
  lifecycle.then(() => undefined);
