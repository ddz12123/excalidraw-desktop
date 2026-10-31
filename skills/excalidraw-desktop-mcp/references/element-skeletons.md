# Excalidraw element skeletons

`add_elements` takes `{ "elements": [...] }`. Each item is an Excalidraw element skeleton converted by `convertToExcalidrawElements`: ids are regenerated, labels are created and measured, and arrow bindings are resolved.

## Coordinates

- Scene units, origin at the top-left of the scene, +x right and +y down.
- `x`/`y` are the element's top-left (before `angle` is applied).
- `width`/`height` must be positive.
- Use `get_scene` to find the occupied area before placing new content.

## Shapes

```json
{
  "type": "rectangle",
  "id": "start",
  "x": 0,
  "y": 0,
  "width": 180,
  "height": 80,
  "label": { "text": "Start", "fontSize": 20 },
  "strokeColor": "#1e1e1e",
  "backgroundColor": "#b2f2bb",
  "fillStyle": "solid",
  "strokeStyle": "solid",
  "strokeWidth": 2,
  "roughness": 1,
  "roundness": { "type": 3 },
  "opacity": 100
}
```

- Types: `rectangle`, `ellipse`, `diamond`.
- `id` is temporary and only used to bind arrows in the same payload; the response returns real ids.
- `label` creates a bound text element centered in the shape. Do not add a separate text element for the same label.
- Omitting `width`/`height` for a labeled shape auto-fits the shape to the label; prefer explicit sizes for predictable layouts.

## Arrows and lines

```json
{
  "type": "arrow",
  "x": 180,
  "y": 40,
  "width": 120,
  "height": 0,
  "start": { "id": "start" },
  "end": { "id": "check" },
  "strokeWidth": 2,
  "endArrowhead": "arrow"
}
```

- `start`/`end` accept `{ "id": "<temp-id>" }` referencing shapes created in the same payload. The converter snaps the arrow to the shape outlines. Existing canvas elements cannot be referenced by id.
- Without bindings, a straight segment is created from `(x, y)` to `(x + width, y + height)`. For vertical/horizontal arrows, pass explicit `points` (e.g. `[[0, 0], [0, 70]]`); `width: 0` / `height: 0` are valid, but omitting `points` can misplace the arrow in older builds.
- For multi-segment paths, pass `points`: `"points": [[0, 0], [80, 0], [80, 60]]`; width/height are derived.
- Optional arrow label: `"label": { "text": "yes", "labelPosition": 0.5 }` (`labelPosition` is 0–1 along the path).
- `startArrowhead`/`endArrowhead`: `null` for none, `"arrow"`, `"bar"`, `"dot"`, `"triangle"` (arrow is the default end).

## Text

```json
{
  "type": "text",
  "x": 0,
  "y": 140,
  "text": "Deploy service",
  "fontSize": 20,
  "strokeColor": "#1e1e1e"
}
```

- Required: `text`, `x`, `y`. Width and height are measured for the current font.
- Optional: `fontSize`, `fontFamily`, `textAlign`, `verticalAlign`, `opacity`, `angle`.
- To label a shape, use the shape's `label` instead of a separate text element.

## Frames and sticky notes

- Frame: `{ "type": "frame", "x": 0, "y": 0, "width": 400, "height": 300, "name": "Group", "children": ["temp-id-1", "temp-id-2"] }`. Children must be created in the same `add_elements` payload and are placed inside the frame.
- Sticky note: `{ "type": "stickynote", "x": 0, "y": 0, "width": 240, "height": 240, "label": { "text": "Idea" } }`.

## Style palette

| Property | Values |
| --- | --- |
| `backgroundColor` | `#a5d8ff` blue, `#b2f2bb` green, `#ffec99` yellow, `#ffc9c9` red, `#d0bfff` purple, `#e9ecef` gray, `transparent` |
| `fillStyle` | `solid`, `hachure`, `cross-hatch`, `dots` |
| `strokeColor` | `#1e1e1e`, `#343a40`, `#1971c2`, `#2f9e44`, `#e03131` |
| `strokeStyle` | `solid`, `dashed`, `dotted` |
| `roughness` | `0` architect, `1` artist, `2` cartoonist |
| `roundness` | `{ "type": 3 }` rounded corners, omit for sharp |
| `opacity` | `0`–`100` |

## Complete flowchart payload

```json
{
  "elements": [
    {
      "type": "rectangle",
      "id": "start",
      "x": 0,
      "y": 0,
      "width": 180,
      "height": 80,
      "label": { "text": "Start" },
      "backgroundColor": "#b2f2bb",
      "fillStyle": "solid",
      "roundness": { "type": 3 }
    },
    {
      "type": "diamond",
      "id": "check",
      "x": 260,
      "y": -10,
      "width": 160,
      "height": 100,
      "label": { "text": "Valid?" },
      "backgroundColor": "#ffec99",
      "fillStyle": "solid"
    },
    {
      "type": "rectangle",
      "id": "save",
      "x": 500,
      "y": 0,
      "width": 180,
      "height": 80,
      "label": { "text": "Save" },
      "backgroundColor": "#a5d8ff",
      "fillStyle": "solid",
      "roundness": { "type": 3 }
    },
    {
      "type": "arrow",
      "x": 180,
      "y": 40,
      "width": 80,
      "height": 0,
      "start": { "id": "start" },
      "end": { "id": "check" },
      "strokeWidth": 2
    },
    {
      "type": "arrow",
      "x": 420,
      "y": 40,
      "width": 80,
      "height": 0,
      "start": { "id": "check" },
      "end": { "id": "save" },
      "strokeWidth": 2
    }
  ]
}
```

## Update and delete payloads

```json
{ "updates": [{ "id": "<real-id>", "x": 40, "backgroundColor": "#ffec99" }] }
```

```json
{ "ids": ["<real-id-1>", "<real-id-2>"] }
```

`update_elements` only accepts geometry/style props (see the skill's tool reference). Text content, labels and element types cannot be changed; delete and re-create instead.

## get_scene response (trimmed)

```json
{
  "elements": [
    {
      "id": "Vj3k...",
      "type": "rectangle",
      "x": 0,
      "y": 0,
      "width": 180,
      "height": 80,
      "angle": 0,
      "strokeColor": "#1e1e1e",
      "backgroundColor": "#b2f2bb",
      "boundElements": [{ "type": "text", "id": "Hq9..." }]
    },
    {
      "id": "Hq9...",
      "type": "text",
      "x": 40,
      "y": 24,
      "text": "Start",
      "containerId": "Vj3k..."
    }
  ],
  "appState": {
    "viewBackgroundColor": "#ffffff",
    "theme": "light",
    "gridModeEnabled": false,
    "zoom": 1,
    "scrollX": 0,
    "scrollY": 0,
    "width": 1200,
    "height": 800,
    "selectedElementIds": []
  }
}
```
