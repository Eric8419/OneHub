# Melody Hub Brand Assets

Design direction: rounded-square soft pixel AI gateway.

The main mark is a generated bitmap icon: a local model/API gateway built from rounded-square pixel tiles. It uses a warm off-white base, graphite routing tiles, cyan signal accents, and a small green status light.

## Files

- `source-icon.png` - original generated bitmap source.
- `app-icon-1024.png` - generated 1024px app icon source for Tauri.
- `favicon.png` - generated browser favicon.
- `taskbar-icon-256.png` - generated taskbar preview asset.
- `brand-tokens.json` - portable color and asset references.

The dev-mode Windows taskbar icon is embedded from `src-tauri/icons/taskbar-icon.ico` via `src-tauri/build.rs`. The packaged app icon is generated into `src-tauri/icons/icon.ico`. A PNG copy of the taskbar-focused artwork is also available at `src-tauri/icons/taskbar-icon.png`.

## Usage

Run `powershell -ExecutionPolicy Bypass -File scripts\generate-brand-icon.ps1` after replacing `source-icon.png` to regenerate app, taskbar, and favicon PNGs.
