# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
