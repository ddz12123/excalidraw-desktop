---
name: excalidraw-desktop-mcp
description: Drive the Excalidraw Desktop app's live canvas through its built-in MCP server (get_scene, add_elements, update_elements, delete_elements, export_image). Use when the user asks to draw, inspect, edit or export a diagram in Excalidraw Desktop, or when these MCP tools are available. Triggers on "用 Excalidraw 画图/改图/导出", "Excalidraw 桌面端", "draw a flowchart in Excalidraw".
---

# Excalidraw Desktop MCP

Operate the canvas currently open in the **Excalidraw Desktop** app (Electron). This is not excalidraw.com and not a `.excalidraw` file; every tool call acts on the live canvas and the user can undo it.

## Check availability

You need these MCP tools: `get_scene`, `add_elements`, `update_elements`, `delete_elements`, `export_image`.

If they are missing, tell the user to:

1. Open Excalidraw Desktop.
2. Go to `Edit → MCP Server…`.
3. Enable the server and click **Save and apply**.
4. Copy the generated client config into this agent's MCP configuration, then restart/reconnect.

Do not edit local `.excalidraw` files as a workaround unless the user asks for that.

The generated config uses `npx -y mcp-remote <endpoint?token=…>`, so the first connection needs network access to fetch `mcp-remote`. Clients with native Streamable HTTP support can use the endpoint URL directly, with `Authorization: Bearer <token>` or the `?token=` query parameter.

## Tool reference

| Tool | Purpose | Arguments | Returns |
| --- | --- | --- | --- |
| `get_scene` | Read the canvas before editing | none | `{ elements, appState }` |
| `add_elements` | Add new elements | `{ elements: Skeleton[], select?: boolean }` | `{ added: { id, type, x, y, width, height }[] }` |
| `update_elements` | Change existing elements by id | `{ updates: { id, ...props }[] }` | `{ updated, notFound }` |
| `delete_elements` | Delete by id (bound labels are removed with their container) | `{ ids: string[] }` | `{ deleted, notFound }` |
| `export_image` | Render the whole scene to PNG for visual verification | none | image + byte-size text |

`update_elements` accepts only: `x`, `y`, `width`, `height`, `angle`, `strokeColor`, `backgroundColor`, `fillStyle`, `strokeWidth`, `strokeStyle`, `roughness`, `opacity`, `roundness`, `locked`. Width/height must be > 0; opacity 0–100.

## Workflow

1. **Read first.** Call `get_scene`. Note existing ids and occupied bounds (`x + width`, `y + height`).
2. **Plan coordinates** in scene units (origin top-left, +x right, +y down). Place new diagrams below or to the right of existing content with 60–100 units of breathing room; align rows/columns and use consistent gaps.
3. **Add** with `add_elements`. Prefer labels on containers (`label: { text }`) over separate text elements. Give shapes temporary ids when arrows need to bind to them, then use `start: { id }` / `end: { id }` on those arrows. The response contains the real ids.
4. **Refine** with `update_elements` / `delete_elements`, always using ids from `get_scene` or `add_elements`.
5. **Verify visually** with `export_image` after meaningful changes. Inspect overlaps, clipped text, arrow direction and spacing; fix and repeat.
6. Report the result and, when useful, which elements were added or updated.

## Skeleton essentials

`add_elements` converts Excalidraw element skeletons (`convertToExcalidrawElements`). Minimal items:

- Shape: `{ "type": "rectangle", "x": 0, "y": 0, "width": 180, "height": 80, "label": { "text": "Start" } }`
- Text: `{ "type": "text", "x": 0, "y": 120, "text": "Note", "fontSize": 20 }`
- Arrow: `{ "type": "arrow", "x": 180, "y": 40, "width": 100, "height": 0, "start": { "id": "a" }, "end": { "id": "b" } }`
- Styles: `strokeColor`, `backgroundColor`, `fillStyle` (`solid`/`hachure`/`cross-hatch`/`dots`), `strokeStyle` (`solid`/`dashed`/`dotted`), `strokeWidth`, `roughness` (0–2), `opacity`, `roundness: { "type": 3 }`, `angle`.

Supported skeleton types: rectangle, ellipse, diamond, arrow, line, text, frame, stickynote. Images require an existing `fileId`, so do not use them for new content.

See `references/element-skeletons.md` for the full field list, style palette and a complete flowchart payload.

## Rules and pitfalls

- **Text cannot be edited in place.** `update_elements` rejects text changes; delete the text/label element and re-create it.
- **Temp ids vs real ids.** Skeleton `id`s exist only inside one `add_elements` call for bindings. Afterwards use the returned ids.
- **Bindings only work within one `add_elements` payload.** Arrow `start`/`end` ids cannot reference elements already on the canvas; include the shapes in the same call, or draw an unbound arrow with explicit `points`.
- **Vertical/horizontal arrows need explicit `points`.** Use `"points": [[0, 0], [0, 70]]` for a vertical arrow (or `[[0, 0], [80, 0]]` for a horizontal one). Width/height `0` are valid, but older builds can misplace the arrow when `points` are omitted.
- **Binding gaps are normal.** Excalidraw keeps a small gap between an arrowhead and the bound shape; this is not a misplaced arrow.
- **Labels are elements.** A container label is a bound text element with `containerId`. Deleting the container deletes its label; deleting only the label leaves the container.
- **Coordinates are scene coordinates**, not screen pixels; `appState.zoom/scrollX/scrollY` only affect the view.
- **Avoid overlapping existing content**; `get_scene` returns everything, including off-screen elements.
- **No file uploads or image creation** through this MCP server.

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| HTTP 401 / Unauthorized | Token mismatch. Re-copy the config from `Edit → MCP Server…`. |
| Connection refused | Server disabled, app not running, or wrong port. Minimizing to the tray keeps the server running while the window is hidden. |
| `MCP bridge is not ready` / `Renderer command timed out` | The app is still loading or reloading. Wait and retry once. |
| `The canvas is empty` on export | Add elements first. |
| Text did not change | Text edits are unsupported; delete and re-add. |
| Diagram appears off-screen | New elements were placed over existing or negative bounds; re-place with `update_elements` or add below existing content. |
