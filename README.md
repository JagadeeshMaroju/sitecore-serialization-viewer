# Sitecore Serialization Viewer

A powerful VS Code extension for visualizing Sitecore CLI serialization changes with detailed field-level diffs.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## Features

### 🔍 Visual Change Tracking
- **Added Items**: See all newly serialized Sitecore items
- **Modified Items**: Track changes to existing items
- **Deleted Items**: View items removed from serialization

### 📊 Detailed Statistics
- Total changes overview
- Item count by change type
- Field-level change metrics
- Average fields changed per item

### 🎯 Field-Level Comparison
- **Side-by-side diff viewer** for individual fields
- Field metadata display (ID, scope, language, version)
- Inline preview of old vs new values
- Support for both shared fields and language-specific fields

### 🌳 Hierarchical Tree View
- Organized by change type (Added/Modified/Deleted)
- Expandable items showing all changed fields
- Quick navigation to YAML files
- Context menu actions

### 🎨 Rich Visual Panel
- Beautiful webview panel with detailed item information
- Color-coded change indicators
- Formatted diff display
- Complete item metadata

## Screenshots

### Changes Overview
The sidebar shows all serialization changes organized by type with expandable tree views.

### Field-Level Diffs
Click any field to see a side-by-side comparison with syntax highlighting.

### Statistics Dashboard
Track your serialization metrics with detailed counts and percentages.

## Installation

### From VSIX
1. Download the latest `.vsix` file from releases
2. In VS Code, go to Extensions view (`Ctrl+Shift+X`)
3. Click the `...` menu at the top
4. Select "Install from VSIX..."
5. Choose the downloaded file

### From Marketplace (Coming Soon)
Search for "Sitecore Serialization Viewer" in the VS Code Extensions marketplace.

## Usage

### Getting Started

1. **Open a Sitecore project** that contains a `Serialization` folder with `.module.json` files
2. The extension will **automatically activate** and analyze your serialization changes
3. View changes in the **Sitecore Serialization** sidebar

### Commands

| Command | Description | Shortcut |
|---------|-------------|----------|
| `Sitecore: View Serialization Changes` | Analyze and display all changes | - |
| `Sitecore: Compare with HEAD` | Compare current state with Git HEAD | - |
| `Sitecore: Refresh Serialization View` | Reload the analysis | - |
| `Sitecore: Show Item Details` | Open detailed view panel | - |
| `Sitecore: Open in Sitecore` | Open item in Sitecore Content Editor | - |

### Viewing Changes

#### Tree View
1. Open the **Sitecore Serialization** view in the sidebar
2. Expand change categories (Added/Modified/Deleted)
3. Click any item to open its YAML file
4. Expand modified items to see changed fields
5. Click a field to see side-by-side diff

#### Detail Panel
1. Right-click any item in the tree
2. Select "Show Item Details"
3. View complete item information and all field changes in a rich panel

### Git Integration

The extension automatically integrates with Git:
- Detects added, modified, and deleted YAML files
- Compares current state with HEAD commit
- Shows field-level differences
- Auto-refreshes on file changes (configurable)

## Configuration

Configure the extension via VS Code settings:

```json
{
  // Path to Sitecore serialization folder (relative to workspace root)
  "sitecoreSerializer.serializationPath": "Serialization",
  
  // Automatically refresh when serialization files change
  "sitecoreSerializer.autoRefresh": true,
  
  // Show field IDs in addition to field names
  "sitecoreSerializer.showFieldIDs": false,
  
  // Sitecore instance URL for opening items directly (e.g., "https://cm.mysite.com")
  "sitecoreSerializer.sitecoreInstanceUrl": ""
}
```

## Understanding Sitecore Serialization

### What is Serialization?

Sitecore serialization is the process of converting Sitecore items (content, templates, settings) into YAML files that can be:
- Stored in source control (Git)
- Shared across development teams
- Deployed to different environments

### CLI Commands

```bash
# Pull items from Sitecore to YAML files
dotnet sitecore ser pull

# Push YAML files to Sitecore
dotnet sitecore ser push

# Validate serialization
dotnet sitecore ser validate
```

This extension helps you **visualize what changes** occurred after running these commands.

## How It Works

1. **YAML Parsing**: Reads and parses Sitecore YAML files
2. **Git Integration**: Uses Git to detect changes (added/modified/deleted files)
3. **Field Comparison**: Compares old vs new field values at a granular level
4. **Visual Display**: Presents changes in an intuitive tree structure

## Requirements

- VS Code 1.85.0 or higher
- Git repository
- Sitecore XM Cloud project with CLI serialization

## Known Issues

- Field name resolution relies on common Sitecore field IDs; custom fields show IDs
- Large repositories (1000+ items) may have initial load delay
- Binary field changes are not visualized

## Roadmap

- [ ] Custom field name mapping configuration
- [ ] Export change reports
- [ ] Integration with Sitecore CLI commands
- [ ] Template hierarchy visualization
- [ ] Multi-branch comparison
- [ ] Change history timeline

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details

## Support

- **Issues**: [GitHub Issues](https://github.com/your-repo/issues)
- **Documentation**: [Wiki](https://github.com/your-repo/wiki)

## Acknowledgments

Built for the Sitecore development community to make serialization workflows more transparent and efficient.

---

**Made with ❤️ for Sitecore Developers**
