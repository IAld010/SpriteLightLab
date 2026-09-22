# Sprite Light Lab

[简体中文](README.md) | **English**

> [!IMPORTANT]
> **End users only need to download the EXE. You do not need the source code.**
>
> The `Source code (zip)` and `Source code (tar.gz)` files are intended only for developers who want to inspect or rebuild the project.
>
> **[Download SpriteLightLab-v1.0.5-win-x64.exe](https://github.com/IAld010/SpriteLightLab/releases/download/v1.0.5/SpriteLightLab-v1.0.5-win-x64.exe)**

<p align="center">
  <img src="docs/images/app-icon.png" width="144" alt="Sprite Light Lab icon">
</p>

<p align="center">
  A local tool for quickly previewing 2D sprite assets with palette swap and normal-map lighting.
</p>

<p align="center">
  <a href="https://github.com/IAld010/SpriteLightLab/releases/latest"><img alt="GitHub Release" src="https://img.shields.io/github/v/release/IAld010/SpriteLightLab?display_name=tag"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/IAld010/SpriteLightLab"></a>
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows%20x64-0078D4">
</p>

## Download and Run

Windows users can download the self-contained single-file build:

<p align="center">
  <a href="https://github.com/IAld010/SpriteLightLab/releases/download/v1.0.5/SpriteLightLab-v1.0.5-win-x64.exe"><strong>Download SpriteLightLab v1.0.5</strong></a>
</p>

- Platform: Windows 10 / 11 x64
- File size: approximately 49.5 MB
- No Node.js installation required
- No .NET Runtime installation required
- No internet connection required at runtime
- Double-click the EXE to start the local service and open the default browser

> The EXE is not code-signed. Windows SmartScreen may appear on first launch. Select **More info** → **Run anyway** after verifying the download.

## Interface Preview

| Chinese | English |
|---|---|
| ![Chinese launcher](docs/images/launcher-zh.png) | ![English launcher](docs/images/launcher-en.png) |

## Features

| Area | Capability |
|---|---|
| Sprite import | Local folders, drag and drop, frame PNGs, automatic normal-map pairing |
| Atlas import | Aseprite and TexturePacker JSON with color/normal layout validation |
| Animation | Clip grouping, renaming, drag sorting, playback, looping, and frame-rate control |
| Indexed palette swap | Exact LUT replacement for up to 256 colors while preserving alpha |
| Full-color palette swap | Color rules, tolerance, hue, saturation, brightness, and global tinting |
| Palette tools | Multiple palettes, undo/redo, GPL and HEX import/export |
| Lighting | Ambient, directional, point, and spot lights with up to 32 active lights |
| Rendering | Normal strength, green-channel flip, stylized diffuse lighting, and optional specular highlights |
| Graphics backends | WebGL2 and WebGPU |
| Project data | IndexedDB autosave, persistent directory handles, and PWA offline support |
| Export | Preview PNG, transparent current-frame PNG, lightweight JSON, self-contained JSON, and ZIP project packages |

## Quick Start

1. Double-click `SpriteLightLab.exe`.
2. Wait for the launcher to show **Running**; the browser opens at `http://127.0.0.1:5173`.
3. Select a local asset folder, drag files into the app, or load a bundled demo.
4. Verify sprite/normal-map pairing, animation clips, and frame order.
5. Adjust Palette Swap, lighting, shadows, and specular settings.
6. Save the project or export PNG / JSON / ZIP.

A detailed Chinese manual is available here: [User Guide](docs/USER_GUIDE.md).

## Launcher Behavior

- Default address: `http://127.0.0.1:5173`
- Port range: `5173–5199`
- Port order: last successful port → 5173 → 5174–5199
- Binds only to `127.0.0.1`; it is not exposed to the local network
- Supports immediate Chinese/English switching and remembers the selected language
- Launching the EXE a second time restores the existing window instead of starting another server
- Minimizing the window does not stop the service
- Closing the window or selecting **Exit** stops the service and releases the port
- The tray menu can open the app, start/stop the service, open logs, and exit

## Data and Privacy

Projects and assets are stored in the current browser IndexedDB and are bound to the launch origin:

```text
http://127.0.0.1:5173
```

Different ports are different storage origins:

```text
http://127.0.0.1:5173
http://127.0.0.1:5174
```

Therefore:

- Projects remain available on the same computer, browser, and port.
- Changing computers, browsers, or ports does not migrate project data automatically.
- Use ZIP/JSON export and import to move projects between environments.
- Asset processing is completely local and is not uploaded to an external server.

Launcher state and log locations:

```text
%LOCALAPPDATA%\SpriteLightLab\launcher-state.json
%LOCALAPPDATA%\SpriteLightLab\logs\launcher.log
```

## Run from Source

### Requirements

- Node.js 24 or newer
- npm 11 or newer
- Windows 10 / 11

```powershell
git clone https://github.com/IAld010/SpriteLightLab.git
cd sprite-light-lab
npm ci
npm run dev
```

Open the local URL printed by Vite.

## Build the Windows EXE

The launcher requires the .NET 9 SDK.

```powershell
.\launcher\build-launcher.ps1
```

The build script:

1. Builds the frontend `dist` directory.
2. Compresses it into the embedded `wwwroot.zip` resource.
3. Publishes a self-contained `win-x64` single-file EXE.
4. Writes the result to `launcher\publish\SpriteLightLab.exe`.
5. Copies it to the desktop as `SpriteLightLab.exe`.

Skip the frontend rebuild:

```powershell
.\launcher\build-launcher.ps1 -SkipFrontendBuild
```

## Tests

```powershell
npm run lint
npm run test:coverage
npm run test:e2e
```

Launcher integration tests:

```powershell
.\launcher\test-launcher.ps1
```

Current automated baseline:

- Vitest: `80/80`
- Playwright: `29/29`
- Launcher integration assertions: `33/33`

## Project Structure

```text
sprite-light-lab/
├─ src/                         React application source
├─ public/                      PWA files, sample projects, and static assets
├─ e2e/                         Playwright end-to-end tests
├─ launcher/
│  ├─ SpriteLightLab.Launcher/  .NET WinForms launcher
│  ├─ build-launcher.ps1        Single-file EXE build script
│  └─ test-launcher.ps1         Launcher integration tests
├─ docs/
│  ├─ USER_GUIDE.md             Detailed Chinese user guide
│  └─ images/                   Documentation screenshots
├─ package.json
└─ README.md
```

## Technology Stack

- React 19
- TypeScript 6
- Vite 8
- PixiJS 8
- Zustand 5
- IndexedDB / idb
- PWA / Service Worker
- .NET 9 WinForms
- TcpListener local HTTP server
- Self-contained single-file publishing

## FAQ

### Why is the project library empty on another computer?

Project data is stored in browser IndexedDB and is not bundled with the EXE. Export the project as ZIP/JSON on the original computer, then import it on the new computer.

### Why did the port change to 5174?

Port 5173 was already in use. The launcher automatically tries the following ports and remembers the last successful port.

### What should I do if the browser cannot connect?

Confirm that the launcher still shows **Running**, click **Start Service**, and refresh the browser tab.

### Are assets uploaded anywhere?

No. The application communicates only with `127.0.0.1`, and all project data remains in the local browser.

## License

This project is licensed under the [MIT License](LICENSE).