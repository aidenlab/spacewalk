# The `spacewalk` session block

> **STATUS: Current (2026-10-29, #128, #129).** The shape of the `spacewalk` block of a Spacewalk
> session, and of the snapshot URL that carries it to the viewer page. The full app writes the
> block (`SessionService.spacewalkToJSON`); the full app reads it
> (`SessionService.loadSpacewalkSession`, which adds panel visibility) and the viewer page reads it,
> both through `restoreSpacewalkSession`; the `spacewalk-mcp` Worker reads and writes the same
> block when it exports its viewer state as a session string for `get_shareable_url` and imports
> one for `load_session`. Vocabulary: `CONTEXT.md` and `spacewalk-mcp/GLOSSARY.md`.

## Where it travels

A session is JSON `{ spacewalk, igv?, juicebox? }`. In a launch URL the `spacewalk` block alone is
the payload of the `spacewalkSessionURL` session parameter, as `blob:<BGZip of JSON>` (see
**Session string** in `CONTEXT.md`). Saved session files carry the whole object.

### The snapshot URL

The viewer page (`viewer.html`) opens a **snapshot URL**: one frozen view, no Room. It is what
`get_shareable_url` returns.

```
viewer.html?spacewalkSessionURL=blob:<BGZip of the spacewalk block>&viewerSettings=blob:<BGZip of the viewer settings>
```

- `spacewalkSessionURL` is read as the full app reads it, through `uncompressSessionURL`; a session
  URL meant to be fetched is refused.
- `viewerSettings` is optional, and spelled as a session string too. Its JSON is the viewer-settings
  record (`viewerSettings.js`):
  `{ background: {r,g,b}, gnomon: {visible,r,g,b}, groundPlane: {visible,r,g,b}, referenceRuler: {visible,r,g,b} }`,
  colors as three.js components in [0, 1], in **linear** color space, not sRGB: the renderer
  converts to sRGB on output, so `0.1` shows as about `#595959`. A writer starting from a hex value
  or Apple crayon name converts sRGB → linear first, as `appleCrayonColorThreeJS` does
  (`THREE.Color` from hex); otherwise every color shows lighter than asked. A section missing or malformed falls back to its default;
  a value that cannot be decoded is ignored with a console warning. Absent, the page keeps its defaults.
- `sessionURL` (igv) and `session` (juicebox), if present, are ignored: the viewer page has neither.
- `?file=` wins over all of these, as in the full app.

Code: `src/launchIntent.js` (parameters), `src/snapshot.js` (decoding), `src/viewerMain.js` (restore).

## The block

```json
{
  "url": "https://…/ensemble.sw",
  "locus": { "chr": "chr21", "genomicStart": 28000071, "genomicEnd": 29949939 },
  "traceKey": "0",
  "ensembleGroupKey": "…",
  "igvPanelState": "none",
  "renderStyle": "render-style-ball-stick",
  "panelVisibility": { "…": "…" },
  "structureAppearance": {
    "ballRadiusIndex": 5,
    "stickRadiusIndex": 5,
    "sticksVisible": true,
    "pointSizeRadiusFraction": null,
    "pointOpacity": 0.375,
    "colorRamp": "peter_kovesi_rainbow_bgyr_35_85_c72_n256",
    "isCircular": false
  },
  "cameraLightingRig": { "…": "three.js PerspectiveCamera.toJSON(), plus position and target" }
}
```

| Field | Meaning |
|---|---|
| `url` | The `.sw` file. Required; the spine of the restore. |
| `locus` | The ensemble's genomic span; applied to IGV and Juicebox after load. |
| `traceKey` | The current trace's index, as a string. |
| `ensembleGroupKey` | The current ensemble group. |
| `renderStyle` | `render-style-ball-stick` or `render-style-ribbon`. A point-cloud ensemble is drawn as a point cloud whatever this says. |
| `igvPanelState`, `panelVisibility` | Full-app only: checked material-provider tracks, and which panels are open. The viewer-only page ignores them. |
| `cameraLightingRig` | The camera. Read back by the viewer page after the ensemble loads, replacing its default framing; the full app does not yet read it. |
| `structureAppearance` | See below. |

Viewer settings — background, gnomon, ground plane, reference ruler — are **not** in the block.
They are kept beside the session (`viewerSettings.js`).

## `structureAppearance`

How the 3D structure is drawn (see **Structure appearance** in `CONTEXT.md`). The writer always
writes every field. The reader takes each field on its own: a field missing or malformed falls back
to its default, and a session with no `structureAppearance` (anything written before #128) loads
entirely with defaults. Code: `src/structureAppearance.js`.

| Field | Type | Default | Meaning |
|---|---|---|---|
| `ballRadiusIndex` | integer 0–10 | 5 | Rung on the ball-radius ladder. Out-of-range values are clamped. |
| `stickRadiusIndex` | integer 0–10 | 5 | Rung on the stick-radius ladder. Out-of-range values are clamped. |
| `sticksVisible` | boolean | `true` | Whether sticks show in ball-and-stick. |
| `pointSizeRadiusFraction` | number > 0, or `null` | `null` | Point-cloud point size, as a fraction of the trace's bounding radius. `null`: not chosen; the point cloud derives a size from its bounds. |
| `pointOpacity` | number in (0, 1] | 0.375 | Point-cloud point opacity. The transparency control steps it by ±10% within [0.1, 0.9]. |
| `colorRamp` | string | `peter_kovesi_rainbow_bgyr_35_85_c72_n256` | Color-ramp id from Spacewalk's color-map registry. An id the reader's build does not know falls back to the default. |
| `isCircular` | boolean | `false` | Circular genome: the ribbon closes and a stick joins the last ball to the first. |

### The radius ladder

Both ladders have 11 rungs (`RADIUS_LADDER_LENGTH`). Rung *i* is
`lerp(0.5·r, 2·r, i/10)`, where *r* is `0.2 ×` (ball) or `0.05 ×` (stick) the trace's average
distance between consecutive balls. The rung, not the radius, is the session value: radii scale
with the trace, rungs do not. A step moves one rung and stops at either end.
