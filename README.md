# Sitecore Serialization Viewer

A VS Code extension for visualizing Sitecore CLI serialization changes with field-level diffs, pull/push previews, validation, and built-in connection management.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Features

### 🔌 Connection Management
- Connect to **Sitecore on-prem** instances using Sitecore Identity Server (`dotnet sitecore login`)
- Connect to **Sitecore AI** (XM Cloud) via `dotnet sitecore cloud login`
- Auto-detects existing CLI connections on startup by scanning `.sitecore/` config files
- **Auto-suggests the Authority URL** from the CM host (e.g. `https://cm.nb.sc` → `https://id.nb.sc`)
- Connection state persisted per workspace

### 🔍 Local Change Tracking (Git-based)
- **Added Items**: newly serialized Sitecore items
- **Modified Items**: existing items with field-level changes
- **Deleted Items**: items removed from serialization
- Compares working tree against Git HEAD automatically

### 📥 Pull Preview
- Runs `dotnet sitecore ser pull --what-if` to show what Sitecore has changed
- Displays Create / Update / Delete breakdown in the sidebar
- One-click **Pull Now** button to execute the real pull after reviewing

### 📤 Push Preview
- Runs `dotnet sitecore ser push --what-if` to show what would be pushed
- Displays Create / Update / Delete breakdown in the sidebar
- One-click **Push Now** button to execute the real push after reviewing

### ✅ Serialization Validation
- Runs `dotnet sitecore ser validate` and groups results into **Errors / Warnings / Info**
- Each issue shows the Sitecore item path and message
- If errors are found, a **Fix Validations** button appears (`dotnet sitecore ser validate --fix`)

### 📊 Statistics
- Total change counts by type (Added / Modified / Deleted)
- Field-level change metrics
- Mode indicator (Local Changes / Pull Preview / Push Preview / Validation)
- Clickable action items (Pull Now / Push Now / Fix Validations) directly in the stats panel

### 🎯 Field-Level Diffs
- Side-by-side diff viewer for individual fields
- Field metadata (ID, scope, language, version)
- Inline preview of old vs new values
- Shared and language-specific field support

### 🌳 Tree Views
- **Changes Overview** — organized by change type, expandable to field level
- **Statistics** — counts and action buttons
- **Connection** — manage your Sitecore connection

---

## Installation

### From VSIX
1. Download the latest `.vsix` file from releases
2. In VS Code open the Extensions view (`Ctrl+Shift+X`)
3. Click the `...` menu → **Install from VSIX…**
4. Select the downloaded file

The extension activates automatically when it detects a `*.module.json` file in the workspace.

---

## Getting Started

### 1. Connect to Sitecore

Open the **Sitecore Serialization** activity bar → **Connection** panel.

**Sitecore on-prem (Sitecore Identity Server)**
1. Select **Sitecore on-prem**
2. Enter your **CM Host** (e.g. `https://cm.your-site.com`)
3. The **Authority URL** is auto-suggested as `https://id.your-site.com` — change it if your Identity Server is at a different URL
4. Click **Connect** — a browser window opens for authentication

The CLI command executed:
```bash
dotnet sitecore login --authority https://id.your-site.com --cm https://cm.your-site.com --allow-write true
```

**Sitecore AI (XM Cloud)**
1. Select **Sitecore AI**
2. Click **Connect** — a browser window opens for Sitecore Cloud authentication

The CLI command executed:
```bash
dotnet sitecore cloud login
```

> If you are already authenticated via the CLI, the extension auto-detects your host from `.sitecore/user.json` and `sitecore.json` on startup.

---

### 2. View Local Changes

The extension analyses your Git working tree automatically on startup and when `.yml` files change.

1. Open the **Changes Overview** panel in the sidebar
2. Expand **Added / Modified / Deleted** categories
3. Click an item to open its YAML file
4. Expand a modified item to see changed fields
5. Click a field to open a **side-by-side diff**

---

### 3. Preview Pull / Push

Use the toolbar buttons in the **Changes Overview** panel:

| Button | Action |
|--------|--------|
| `$(cloud-download)` Preview Pull | Runs `dotnet sitecore ser pull --what-if` and shows what will change |
| `$(cloud-upload)` Preview Push | Runs `dotnet sitecore ser push --what-if` and shows what will change |

After a preview, a **Pull Now** or **Push Now** button appears:
- In the **Statistics** panel (click the action item)
- In the **Changes Overview** toolbar
- In the notification toast

Both execute with a confirmation dialog before running the real command.

---

### 4. Validate Serialization

Click the `$(check-all)` **Validate** toolbar button in the **Changes Overview** panel.

- Runs `dotnet sitecore ser validate`
- Groups issues into **Errors**, **Warnings**, and **Info**
- Each issue shows the Sitecore path and description

If errors are found:
- A **Fix Validations** button (`$(wrench)`) appears in the toolbar and Statistics panel
- The notification toast offers **Fix Validations**
- Clicking it runs `dotnet sitecore ser validate --fix` (with confirmation)

---

## Commands

All commands are available via the Command Palette (`Ctrl+Shift+P` → type `Sitecore`):

| Command | Description |
|---------|-------------|
| `Sitecore: Connect to Sitecore` | Focus the Connection panel |
| `Sitecore: View Serialization Changes` | Re-run local Git analysis |
| `Sitecore: Preview Pull Changes` | What-if pull from Sitecore |
| `Sitecore: Preview Push Changes` | What-if push to Sitecore |
| `Sitecore: Pull Now` | Execute real pull (with confirmation) |
| `Sitecore: Push Now` | Execute real push (with confirmation) |
| `Sitecore: Validate Serialization` | Run `dotnet sitecore ser validate` |
| `Sitecore: Fix Validation Errors` | Run `dotnet sitecore ser validate --fix` |
| `Sitecore: Refresh Serialization View` | Refresh local change analysis |
| `Sitecore: Show Item Details` | Open rich detail panel for a tree item |

---

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `sitecoreSerializer.loginType` | `"identity"` | `"identity"` for Sitecore on-prem, `"cloud"` for Sitecore AI |
| `sitecoreSerializer.sitecoreHost` | `""` | CM host URL saved after a successful connection |
| `sitecoreSerializer.sitecoreAuthority` | `""` | Identity Server URL saved after a successful connection |
| `sitecoreSerializer.serializationPath` | `"Serialization"` | Path to the serialization folder (relative to workspace root) |
| `sitecoreSerializer.autoRefresh` | `true` | Refresh automatically when `.yml` files change |
| `sitecoreSerializer.showFieldIDs` | `false` | Show field GUIDs alongside field names |

---

## Requirements

- VS Code 1.85.0 or higher
- Git repository
- [Sitecore CLI](https://doc.sitecore.com/xmc/en/developers/xm-cloud/sitecore-command-line-interface.html) (`dotnet tool install -g Sitecore.CLI`)
- A Sitecore XM / XM Cloud project with CLI serialization (`.module.json` files)

---

## How It Works

1. **Activation** — triggers when a `*.module.json` is found in the workspace
2. **Auto-detection** — scans `.sitecore/` and `sitecore.json` for an existing CM host
3. **Git analysis** — uses `simple-git` to detect added/modified/deleted `.yml` files vs HEAD
4. **YAML parsing** — reads Sitecore item YAML to extract field values
5. **CLI integration** — delegates pull/push/validate/login to the `dotnet sitecore` CLI via `child_process`

---

## Known Issues

- Field name resolution uses a built-in GUID map; custom fields fall back to their GUID
- Large repositories (1000+ items) may have a slight initial load delay
- Binary field values are not visualised in diffs

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

**Made with ❤️ for Sitecore Developers**
