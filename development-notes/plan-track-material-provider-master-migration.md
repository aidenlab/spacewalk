# Plan: Track Material Provider — Migration to IGV.js Master via Spacewalk Shim

## Context

Spacewalk embeds IGV.js and uses a **per-track control** to enable the track material provider—allowing genomic track data to color the 3D chromatin structure. This feature currently exists only on the **spacewalk branch** of IGV.js. The spacewalk branch has diverged significantly from master and cannot be merged. The goal is to recreate this functionality using the **master branch** instead.

**Critical constraint:** The IGV.js maintainer would reject embedding-specific code (e.g. `materialProviderExclusionTrackTypes`, `showEmbeddingCheckbox`) in core IGV. The solution must provide a **shim**—an intermediate layer that lives entirely within Spacewalk and manipulates IGV at arm's length. **Zero IGV.js modifications.**

Previous migration attempts have failed. This plan accounts for:
- **No IGV modifications** — all logic in Spacewalk
- **IGV's aggressive DOM rebuild** — no DOM injection into IGV
- **Manipulation at arm's length** — runtime patching of track objects, not source changes

---

## Approach: Axis Column Checkbox Injection via Shim

After IGV initialization has settled, Spacewalk injects a checkbox into each track's **axis column** by appending to `trackView.axis`. Spacewalk has access via `browser.trackViews`; no IGV modification required. When IGV rebuilds (loadSession, trackorderchanged), Spacewalk re-injects.

---

## Current Implementation (Spacewalk Branch)

| Component | Location | Behavior |
|-----------|----------|----------|
| Checkbox creation | `igv.js/js/trackView.js` `createAxis()` | One checkbox per track (except ruler, sequence, ideogram). Fires `dataValueMaterialCheckbox` on change. Stores `trackView.materialProviderInput`. |
| Event | `browser.fireEvent('dataValueMaterialCheckbox', [this.track])` | Payload is the track object. |
| Spacewalk listener | `IGVPanel.js` `configureMouseHandlers()` | `browser.on('dataValueMaterialCheckbox', ...)` → activate/deactivate TrackMaterialProvider. |
| Programmatic control | `utils.js` `unsetDataMaterialProviderCheckbox()` | Iterates `browser.trackViews`, sets `materialProviderInput.checked = false`. |

**Spacewalk branch axis:** Replaces the track-selection checkbox with the material-provider checkbox (no multi-track selection UI).

---

## Master Branch Differences

| Aspect | Spacewalk branch | Master branch |
|--------|------------------|---------------|
| **Axis checkbox** | Material provider only | Track selection (multi-select) only |
| **Shadow DOM** | `Browser.shadowRoot` (static, shared) | `parentDiv.shadowRoot` (per parent) |
| **Event system** | `this.eventHandlers` object | `EventEmitter` via `this.eventEmitter` |
| **fireEvent** | `handler.apply(scope, args)` | `eventEmitter.emit(eventName, args, thisObj)` — same semantics |
| **Config** | `browser.config` | `browser.config` (same) |

**Master axis structure:** `createAxis()` creates `trackSelectionContainer` with a checkbox for `track.selected` and `overlayTrackButton.setVisibility()`. The checkbox uses `name="track-select"`. We must **add a second checkbox** for the material provider; we cannot replace the existing one.

---

## Shadow DOM Considerations

1. **Checkbox lives inside shadow root** — IGV creates its DOM under `parentDiv.attachShadow()`. The checkbox is a descendant. This is true on both branches.

2. **Spacewalk never uses `querySelector` from outside** — It uses `trackView.materialProviderInput`, a JavaScript reference stored by IGV. References work across shadow boundaries. No change needed.

3. **Event flow** — The `change` listener is attached by IGV (inside shadow root). On change, IGV calls `browser.fireEvent()`, which invokes Spacewalk’s listener. This is a method call, not DOM event propagation. Shadow DOM does not affect it.

4. **`unsetDataMaterialProviderCheckbox`** — Spacewalk iterates `igvPanel.browser.trackViews` and sets `trackView.materialProviderInput.checked = false`. The reference is valid; no DOM traversal from outside the shadow root.

5. **Potential pitfall** — If any Spacewalk code used `document.querySelector` or `element.querySelector` to find the checkbox, it would fail inside shadow DOM. The current implementation does not do this. **Verify** no such code exists.

---

## Migration Plan (Shim Approach — Zero IGV Modifications)

### Phase 1: Create the Shim Module (Spacewalk)

**New file: `spacewalk/js/igvTrackMaterialProviderShim.js`**

1. **Exclusion set** (Spacewalk-owned): `MATERIAL_PROVIDER_EXCLUSION_TYPES = new Set(['ruler', 'sequence', 'ideogram'])`

2. **`installShim(browser, igvPanel)`** — called from IGVPanel after browser creation and after loadSession:
   - Call `injectCheckboxes(browser, igvPanel)`
   - Subscribe to `browser.on('trackorderchanged', () => injectCheckboxes(browser, igvPanel))`

3. **`injectCheckboxes(browser, igvPanel)`** — for each `trackView` in `browser.trackViews`:
   - Skip if `trackView._embeddingCheckboxInjected` or excluded track type or `!trackView.axis`
   - Create container div + checkbox, append to `trackView.axis`
   - Initialize from `track.embeddingCheckboxChecked`, wire change handler to activate/deactivate
   - Store `trackView.materialProviderInput = input`, set `trackView._embeddingCheckboxInjected = true`

---

### Phase 2: Integrate Shim into IGVPanel (Spacewalk)

**File: `spacewalk/js/IGVPanel.js`**

1. **Remove** `browser.on('dataValueMaterialCheckbox', ...)` — no longer used (checkbox change fires our handler directly)
2. **Add** `installShim(this.browser, this)` after browser creation and in `configureMouseHandlers`
3. **Keep** `browser.on('trackremoved', ...)` — remove from material provider when track removed
4. **restoreSessionState:** Set `track.embeddingCheckboxChecked = true`, set `materialProviderInput.checked = true` if present, call `activateTrackMaterialProvider(track)`
5. **getSessionState:** Collect `track.name` where `track.embeddingCheckboxChecked`

---

### Phase 3: Update Utils (Spacewalk)

**File: `spacewalk/js/utils/utils.js`**

1. **unsetDataMaterialProviderCheckbox:** Set `track.embeddingCheckboxChecked = false` and `materialProviderInput.checked = false` for each track.

---

### Phase 4: Dependency

**File: `spacewalk/package.json`**

2. **Point to master** — Change `"igv": "github:igvteam/igv.js#spacewalk"` to `"igv": "github:igvteam/igv.js#master"`.

---

## Implementation Checklist

### Spacewalk (all changes)

- [ ] Create `igvTrackMaterialProviderShim.js` with installShim, injectCheckboxes, exclusion set
- [ ] IGVPanel: call installShim after browser creation and in configureMouseHandlers
- [ ] IGVPanel: remove dataValueMaterialCheckbox listener; keep trackremoved
- [ ] IGVPanel: update getSessionState/restoreSessionState to use track.embeddingCheckboxChecked and materialProviderInput
- [ ] utils: update unsetDataMaterialProviderCheckbox to set track.embeddingCheckboxChecked and materialProviderInput.checked

### IGV.js

- [ ] No changes

### Testing

- [ ] Load Spacewalk with IGV master; load a track
- [ ] Check checkbox in axis column → 3D chromatin colors by track data
- [ ] Uncheck → revert to color ramp
- [ ] Switch render style (BallAndStick/Ribbon/PointCloud) → all checkboxes unset
- [ ] Save/restore session → checked state restored
- [ ] Add track interactively → new track gets checkbox (trackorderchanged)

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| IGV DOM rebuild clobbers injected checkboxes | Re-inject after loadSession and on trackorderchanged |
| Re-injecting into same track twice | Use `trackView._embeddingCheckboxInjected` flag |
| Track disposed before we clean up | trackremoved handler removes from material provider |

---

## Summary

**Zero IGV modifications.** After IGV settles, a Spacewalk shim injects a checkbox into each track's axis column (`trackView.axis`). User checks/unchecks → activates/deactivates TrackMaterialProvider. When IGV rebuilds, shim re-injects. State on `track.embeddingCheckboxChecked`. All logic in Spacewalk.
