# Sitecore Serialization Viewer

A VS Code extension for visualizing Sitecore CLI serialization changes — field-level diffs, pull/push previews, validation, and connection management for both **Sitecore on-prem** and **Sitecore AI (XM Cloud)**.

![Version](https://img.shields.io/badge/version-1.0.4-blue)
![License](https://img.shields.io/badge/license-MIT-green)

[GitHub Repository](https://github.com/JagadeeshMaroju/sitecore-serialization-viewer)

---

## Features

### Connection Management
Supports two modes from the **Connection** panel:

| Mode | Use For |
|------|---------|
| **Sitecore on-prem** | Self-hosted XM / XP instances with Sitecore Identity Server |
| **Sitecore AI** | XM Cloud — cloud-managed environments |

- Auto-detects existing CLI connections on startup from `.sitecore/user.json`
- Connected host URL shown in the status card after authentication
- Connection state persisted per workspace

### Pull Preview & Pull Now
- Runs `dotnet sitecore ser pull --what-if` to preview changes before touching any local files
- Shows a Create / Update / Delete breakdown with field-level details in the sidebar
- **Pull Now** button available in the Statistics panel, Changes Overview toolbar, and notification toast — always with a confirmation dialog

### Push Preview & Push Now
- Runs `dotnet sitecore ser push --what-if` to preview what would be pushed before making any changes
- Same breakdown and field-level detail as pull preview
- **Push Now** button in the same three places, with confirmation

### Serialization Validation
- Runs `dotnet sitecore ser validate` and groups results into **Errors / Warnings / Info**
- Each issue shows the Sitecore item path and message
- When errors are found, a **Fix Validations** button appears that runs `dotnet sitecore ser validate --fix`

### Statistics
- Change counts by type (Added / Modified / Deleted) and field-level metrics
- Mode indicator (Local Changes / Pull Preview / Push Preview / Validation)
- Clickable Pull Now / Push Now / Fix Validations actions directly in the panel

### Field-Level Diffs
- Side-by-side diff viewer per field with old → new values
- Field metadata (ID, scope, language, version)
- Shared and language-specific field support

### Tree Views
- **Changes Overview** — by change type, expandable to field level
- **Statistics** — counts and action buttons
- **Connection** — manage your Sitecore connection

---

## Installation

### From VS Code Marketplace _(recommended)_
1. Open VS Code and go to the Extensions view (`Ctrl+Shift+X`)
2. Search for **Sitecore Serialization Viewer**
3. Click **Install**

### From VSIX
1. Download the latest `.vsix` from the [GitHub releases page](https://github.com/JagadeeshMaroju/sitecore-serialization-viewer/releases)
2. In the Extensions view click `...` → **Install from VSIX…**
3. Select the downloaded file

The extension activates automatically when it finds a `*.module.json` file in the workspace.

---

## Getting Started

### 1. Connect to Sitecore

Open the **Sitecore Serialization** activity bar → **Connection** panel and pick your mode.

#### Sitecore on-prem

![Sitecore on-prem Connection Panel](images/connection-panel-onprem.png)

1. Select **Sitecore on-prem**
2. Enter your **CM Host** (e.g. `https://cm.your-site.com`)
3. The **Authority URL** is auto-suggested — change it if your Identity Server is at a different address
4. Click **Connect** — a browser window opens to complete authentication

```bash
dotnet sitecore login --authority https://id.your-site.com --cm https://cm.your-site.com --allow-write true
```

#### Sitecore AI (XM Cloud)

![Sitecore AI Connection Panel](images/connection-panel.png)

The Sitecore AI panel has three sections:

**Switch Default Environment**

Populated from `.sitecore/user.json`. The current default is pre-selected; the **Set as Default** button is disabled until you pick a different environment.

```bash
dotnet sitecore environment set-default -n <EnvironmentName>
```

> Pull and push always target the default environment, so switching here changes what `ser pull` / `ser push` operates against.

**Connect to Environment**

Adds a new XM Cloud environment using its environment ID (found in the XM Cloud Deploy portal). The new environment appears in the dropdown immediately after connecting.

```bash
dotnet sitecore cloud environment connect --environment-id <EnvironmentId> --allow-write true
```

**Cloud Login**

Run this once to authenticate with Sitecore Cloud, or again when your session expires.

```bash
dotnet sitecore cloud login
```

After any Sitecore AI action the status card refreshes and shows the active CM host from `.sitecore/user.json`.

---

### 2. Preview Pull / Push

Use the toolbar buttons in the **Changes Overview** panel:

| Button | Command |
|--------|---------|
| Preview Pull | `dotnet sitecore ser pull --what-if` |
| Preview Push | `dotnet sitecore ser push --what-if` |

Each changed item is grouped by type:

| Type | Meaning |
|------|---------|
| Create | In Sitecore but not locally — will be created on pull |
| Update | Exists in both but differs — changed fields shown with old → new values |
| Delete | Local only — will be removed on pull |

Expand any item to see which fields changed.

### 3. Pull Now / Push Now

After a preview the **Pull Now** / **Push Now** button is available in three places:

- The **Statistics** panel action item
- The **Changes Overview** toolbar
- The notification toast

Both show a confirmation dialog before running.

```bash
dotnet sitecore ser pull   # pull
dotnet sitecore ser push   # push
```

### 4. Validate Serialization

Click **Validate** in the **Changes Overview** toolbar.

- Results are grouped into Errors, Warnings, and Info
- Each issue shows the Sitecore path and description
- If errors are found, a **Fix Validations** button appears that runs `dotnet sitecore ser validate --fix` (with confirmation)

---

## Commands

All commands are in the Command Palette (`Ctrl+Shift+P` → type `Sitecore`):

| Command | Description |
|---------|-------------|
| `Sitecore: Connect to Sitecore` | Focus the Connection panel |
| `Sitecore: View Serialization Changes` | Re-run local Git analysis |
| `Sitecore: Preview Pull Changes` | What-if pull from Sitecore |
| `Sitecore: Preview Push Changes` | What-if push to Sitecore |
| `Sitecore: Pull Now` | Execute pull (with confirmation) |
| `Sitecore: Push Now` | Execute push (with confirmation) |
| `Sitecore: Validate Serialization` | Run `dotnet sitecore ser validate` |
| `Sitecore: Fix Validation Errors` | Run `dotnet sitecore ser validate --fix` |
| `Sitecore: Refresh Serialization View` | Refresh local change analysis |
| `Sitecore: Show Item Details` | Open detail panel for a tree item |

---

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `sitecoreSerializer.loginType` | `"identity"` | `"identity"` for on-prem, `"cloud"` for Sitecore AI |
| `sitecoreSerializer.sitecoreHost` | `""` | CM host saved after a successful on-prem connection |
| `sitecoreSerializer.sitecoreAuthority` | `""` | Identity Server URL saved after a successful on-prem connection |
| `sitecoreSerializer.serializationPath` | `"Serialization"` | Path to the serialization folder, relative to workspace root |
| `sitecoreSerializer.autoRefresh` | `true` | Auto-refresh when `.yml` files change |
| `sitecoreSerializer.showFieldIDs` | `false` | Show field GUIDs alongside field names |

---

## Requirements

- VS Code 1.85.0 or higher
- [Sitecore CLI](https://doc.sitecore.com/xmc/en/developers/xm-cloud/sitecore-command-line-interface.html) (`dotnet tool install -g Sitecore.CLI`)
- A Sitecore XM / XM Cloud project with CLI serialization (`.module.json` files)

---

## How It Works

1. **Activation** — triggers when a `*.module.json` is found in the workspace
2. **Auto-detection** — scans `.sitecore/user.json` for an existing host and environments
3. **YAML parsing** — reads Sitecore item YAML to extract field values
4. **CLI integration** — delegates pull / push / validate / login to `dotnet sitecore` via `child_process`

For Sitecore AI, environments are read from `.sitecore/user.json`. Any endpoint with a `ref` field is treated as an XM Cloud environment:

```json
{
  "endpoints": {
    "xmCloud": {
      "host": "https://xmclouddeploy-api.sitecorecloud.io/",
      "authority": "https://auth.sitecorecloud.io/"
    },
    "default": {
      "ref": "xmCloud",
      "host": "https://xmc-<id>-dev.sitecorecloud.io/",
      "allowWrite": true
    },
    "qa": {
      "ref": "xmCloud",
      "host": "https://xmc-<id>-qa.sitecorecloud.io/",
      "allowWrite": true
    }
  },
  "defaultEndpoint": "default"
}
```

`defaultEndpoint` controls which environment pull and push target.

---

## Known Issues

- Field name resolution uses a built-in GUID map; custom fields fall back to showing the GUID
- Large repositories (1000+ items) may have a slight initial load delay
- Binary field values are not shown in diffs

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

**Made for Sitecore Developers**
