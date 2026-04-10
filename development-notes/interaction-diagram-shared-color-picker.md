# Shared Color Picker — Interaction Diagrams

A single `vanilla-picker` instance is shared across four color swatches (background, gnomon, ground plane, scale bars). The picker is created lazily on first click and re-targeted via `movePopup()` to whichever swatch the user activates.

---

## 1. Architecture

```mermaid
%%{init: {'themeVariables': {'fontSize': '18px', 'fontFamily': 'arial'}, 'flowchart': {'nodeSpacing': 60, 'rankSpacing': 50}}}}%%
flowchart TB
    subgraph SharedPicker["sharedColorPicker.js"]
        Register[register]
        UpdateSwatch[updateSwatch]
        EnsurePicker[ensurePicker]
        Picker["Picker (single instance)"]

        Register -->|lazy init| EnsurePicker
        EnsurePicker -->|new Picker / return existing| Picker
    end

    subgraph Consumers["Registration Sites"]
        TJS[ThreeJSInitializer]
        SM[SceneManager]
        SBS[ScaleBarService]

        TJS -->|register background| Register
        SM -->|register groundplane| Register
        SM -->|register gnomon| Register
        SBS -->|register scale-bars| Register
    end

    subgraph Swatches["Swatch Containers (index.html)"]
        BG["div[data-colorpicker='background']"]
        GP["div[data-colorpicker='groundplane']"]
        GN["div[data-colorpicker='gnomon']"]
        SB["div[data-colorpicker='scale-bars']"]
    end

    subgraph Targets["Color Targets"]
        Scene["scene.background"]
        GroundPlane["GroundPlane.color"]
        Gnomon["Gnomon.color"]
        ScaleBars["ScaleBarService.color"]
    end

    Register -->|addEventListener click| BG
    Register -->|addEventListener click| GP
    Register -->|addEventListener click| GN
    Register -->|addEventListener click| SB

    Picker -->|onChange → setColor| Scene
    Picker -->|onChange → setColor| GroundPlane
    Picker -->|onChange → setColor| Gnomon
    Picker -->|onChange → setColor| ScaleBars

    Picker -->|onChange| Settings["spacewalk-settings-changed → SettingsManager.save()"]
```

### Key Points

| Aspect | Detail |
|--------|--------|
| **Single instance** | One `Picker`, created lazily by `ensurePicker()` on first swatch click |
| **Re-targeting** | `picker.movePopup({ parent, color }, true)` re-parents and opens the popup |
| **Initial swatch color** | Derived from saved settings (localStorage) or default (`appleCrayonColorThreeJS('iron')`) |
| **getColor (lazy)** | Called only on click — reads live color from the scene object |
| **Settings persistence** | `onChange` dispatches `spacewalk-settings-changed`; `SettingsManager` listens and saves to localStorage |

---

## 2. Background — Sequence

```mermaid
%%{init: {'themeVariables': {'fontSize': '16px'}}}%%
sequenceDiagram
    autonumber
    participant User
    participant Swatch as div[data-colorpicker='background']
    participant SP as sharedColorPicker
    participant Picker as Picker (vanilla-picker)
    participant Scene as scene.background
    participant SM as SettingsManager

    Note over SP: ThreeJSInitializer calls register() at init
    SP->>Swatch: set backgroundColor from saved settings or scene.background

    User->>Swatch: click
    Swatch->>SP: click handler
    SP->>SP: ensurePicker()
    SP->>SP: getColor() → scene.background
    SP->>Picker: movePopup({ parent: swatch, color }, true)
    Picker->>Picker: open popup anchored to swatch

    User->>Picker: select color
    Picker->>Swatch: set backgroundColor
    Picker->>Scene: setColor → scene.background = new THREE.Color(color)
    Picker->>SM: dispatch spacewalk-settings-changed
    SM->>SM: save() → localStorage
```

---

## 3. Ground Plane — Sequence

```mermaid
%%{init: {'themeVariables': {'fontSize': '16px'}}}%%
sequenceDiagram
    autonumber
    participant User
    participant Swatch as div[data-colorpicker='groundplane']
    participant SP as sharedColorPicker
    participant Picker as Picker (vanilla-picker)
    participant GP as GroundPlane
    participant SM as SettingsManager

    Note over SP: SceneManager constructor calls register() at init
    SP->>Swatch: set backgroundColor from saved settings or 'iron'

    Note over SP: On trace load, SceneManager calls updateSwatch()
    SP->>Swatch: set backgroundColor from groundPlaneConfig.color

    User->>Swatch: click
    Swatch->>SP: click handler
    SP->>SP: ensurePicker()
    SP->>SP: getColor() → groundPlane.color ?? 'iron'
    SP->>Picker: movePopup({ parent: swatch, color }, true)
    Picker->>Picker: open popup anchored to swatch

    User->>Picker: select color
    Picker->>Swatch: set backgroundColor
    Picker->>GP: setColor(color)
    Picker->>SM: dispatch spacewalk-settings-changed
    SM->>SM: save() → localStorage
```

---

## 4. Gnomon — Sequence

```mermaid
%%{init: {'themeVariables': {'fontSize': '16px'}}}%%
sequenceDiagram
    autonumber
    participant User
    participant Swatch as div[data-colorpicker='gnomon']
    participant SP as sharedColorPicker
    participant Picker as Picker (vanilla-picker)
    participant GN as Gnomon
    participant SM as SettingsManager

    Note over SP: SceneManager constructor calls register() at init
    SP->>Swatch: set backgroundColor from saved settings or 'iron'

    Note over SP: On trace load, SceneManager calls updateSwatch()
    SP->>Swatch: set backgroundColor from gnomonConfig.color

    User->>Swatch: click
    Swatch->>SP: click handler
    SP->>SP: ensurePicker()
    SP->>SP: getColor() → gnomon.color ?? 'iron'
    SP->>Picker: movePopup({ parent: swatch, color }, true)
    Picker->>Picker: open popup anchored to swatch

    User->>Picker: select color
    Picker->>Swatch: set backgroundColor
    Picker->>GN: setColor(color)
    Picker->>SM: dispatch spacewalk-settings-changed
    SM->>SM: save() → localStorage
```

---

## 5. Scale Bars — Sequence

```mermaid
%%{init: {'themeVariables': {'fontSize': '16px'}}}%%
sequenceDiagram
    autonumber
    participant User
    participant Swatch as div[data-colorpicker='scale-bars']
    participant SP as sharedColorPicker
    participant Picker as Picker (vanilla-picker)
    participant SBS as ScaleBarService
    participant SM as SettingsManager

    Note over SP: ScaleBarService constructor calls register() at init
    SP->>Swatch: set backgroundColor from saved settings or 'iron'

    Note over SP: On setState(), ScaleBarService calls updateSwatch()
    SP->>Swatch: set backgroundColor from restored color

    User->>Swatch: click
    Swatch->>SP: click handler
    SP->>SP: ensurePicker()
    SP->>SP: getColor() → scaleBarService.color
    SP->>Picker: movePopup({ parent: swatch, color }, true)
    Picker->>Picker: open popup anchored to swatch

    User->>Picker: select color
    Picker->>Swatch: set backgroundColor
    Picker->>SBS: setColor(color) → update SVG fill on all scale bar elements
    Picker->>SM: dispatch spacewalk-settings-changed
    SM->>SM: save() → localStorage
```

---

## 6. Settings Restore — Sequence

```mermaid
%%{init: {'themeVariables': {'fontSize': '16px'}}}%%
sequenceDiagram
    autonumber
    participant LS as localStorage
    participant Settings as SettingsManager.load()
    participant TJS as ThreeJSInitializer
    participant SCM as SceneManager
    participant UB as UIBootstrapper
    participant SP as sharedColorPicker

    Note over Settings: App launch — each consumer reads saved settings

    Settings->>TJS: background: { r, g, b }
    TJS->>TJS: scene.background = new THREE.Color(r, g, b)
    TJS->>SP: register(container, scene.background, ...)
    SP->>SP: swatch backgroundColor ← saved color

    Settings->>SCM: groundPlane: { r, g, b }, gnomon: { r, g, b }
    SCM->>SP: register(container, saved color or 'iron', ...)
    SP->>SP: swatch backgroundColor ← saved color

    Settings->>UB: scaleBars: { r, g, b }
    UB->>UB: new ScaleBarService(..., savedColor)
    UB->>SP: register(container, savedColor or 'iron', ...)
    SP->>SP: swatch backgroundColor ← saved color
```
