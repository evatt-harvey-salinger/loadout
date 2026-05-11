# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.13] - 2026-05-11

### Changed
- Migrate to per-target `.gitignore` files for better tool-specific configuration management

## [0.1.12] - 2026-05-10

### Added
- Update gitignore at artifact creation time (`skill add`, `rule add`, `install`)
- Use directory patterns for skills in gitignore (e.g., `.cursor/skills/foo/`)
- Command aliases: `a` (activate), `d` (deactivate), `c` (check), etc.

### Changed
- Collapse dir-layout artifacts (skills) to single row per artifact in sync output

### Fixed
- Fallback script uses marker file to avoid re-running on each shell
- Fallback script cleans up broken symlinks before creating new ones
- Fallback script uses correct path for AGENTS.md instruction

## [0.1.11] - 2026-05-08

### Changed
- Renamed package from `@evatt/loadout` to `loadouts`
- Renamed CLI binary from `loadout` to `loadouts`
- Project config directory renamed from `.loadout/` to `.loadouts/`
- Root config file renamed from `loadout.yaml` to `loadouts.yaml`
- Global config moved from `~/.config/loadout` to `~/.config/loadouts`

## [0.1.10] - 2026-05-08

### Added
- CI/CD pipeline with GitHub Actions
- Automated npm publishing via OIDC Trusted Publishers
- Version tag verification in release workflow
- Update notifications (`loadouts update` command)

### Changed
- Release workflow now requires Node 24 for npm 11.x (Trusted Publishers support)

## [0.1.0] - 2026-05-07

### Added
- Initial release
- Core loadout system with artifacts: rules, skills, instructions, extensions
- Multi-tool support: Claude Code, Cursor, OpenCode, Codex, Pi
- Global and project-scoped configurations
- Sources for cross-project configuration sharing
- CLI commands: `activate`, `deactivate`, `sync`, `status`, `check`, `list`, `info`, `create`, `edit`, `init`
- Per-loadout instructions with `AGENTS.<loadout>.md` pattern
- Unified table format with scope indicators
