# Changelog

All notable changes to the "Sitecore Serialization Viewer" extension will be documented in this file.

## [1.0.3] - 2026-03-16

### Fixed
- **Git Network Error Handling**: Added proper error handling for `ECONNRESET` errors when Git tries to reach unreachable remotes
- Added timeout protection (10 seconds) for Git operations to prevent hanging
- Extension now shows friendly warning message instead of crashing on network errors
- Git configuration improvements for offline/slow network scenarios (increased postBuffer, disabled lowSpeedLimit)
- Extension continues to work in "offline mode" when Git has network issues

### Improved
- Better error messages that explain what went wrong
- Console logging for debugging network-related issues
- Graceful degradation when Git operations fail

### Added
- **Comprehensive Logging**: Added detailed console logging for troubleshooting
  - Extension activation steps with version info
  - Git root and Serialization path discovery process
  - Command execution logs (viewChanges, compareWithHead, previewPull, previewPush)
  - Git operation results (success/failure, change counts)
  - File watcher status
  - Initial analysis results
  - Error details with stack traces
- Logs visible in VS Code Output console (View → Output → "Extension Host")

## [1.0.2] - 2026-03-16

### Added
- **Smart Folder Detection**: Extension now automatically searches for `.module.json` files in parent directories
- Git root detection: Automatically finds the git repository root, even if VS Code is opened in a subfolder
- Intelligent Serialization folder discovery: Searches multiple common locations (e.g., `authoring/Serialization`, `src/Serialization`)
- Support for multi-folder repository structures (e.g., `Repo/app/` and `Repo/authoring/`)

### Improved
- Extension now works regardless of which folder you open in VS Code
- Automatically searches up to 3 levels deep to find Serialization folders
- Skips irrelevant folders (node_modules, .git, dist, etc.) for faster search
- Console logging for discovered paths (Git root and Serialization path)

### Fixed
- Extension not activating when VS Code is opened in a subfolder of the repository
- Module.json files not detected when in sibling directories

## [1.0.1] - 2026-03-16

### Changed
- Removed detailed file structure documentation from README
- Cleaned up unnecessary documentation files

## [1.0.0] - 2026-03-14

### Added
- Initial release
- Visual change tracking for Sitecore serialization
- Git integration for detecting added/modified/deleted items
- Field-level diff comparison
- Tree view with hierarchical display
- Statistics dashboard
- Item detail panel with rich formatting
- Auto-refresh on file changes
- Support for shared and language-specific fields
- Virtual document provider for side-by-side field diffs
- Open items directly in Sitecore Content Editor
- Configurable serialization path
- Comprehensive field metadata display

### Features
- Detect and categorize serialization changes (Added/Modified/Deleted)
- Compare YAML files with Git HEAD
- Show field-level differences with old/new values
- Display statistics (total changes, field changes, averages)
- Beautiful webview panel for detailed item inspection
- Support for multi-language and versioned content
- Automatic field name resolution for common Sitecore fields
- Click-through navigation to YAML files
- Context menu actions

### Technical
- TypeScript-based implementation
- VS Code Extension API integration
- simple-git for Git operations
- yaml parser for YAML file handling
- Custom tree data providers
- Webview panels for rich UI
- Virtual document content provider
