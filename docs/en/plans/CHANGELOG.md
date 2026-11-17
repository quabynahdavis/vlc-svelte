# Changelog — Plans

Dates use `YYYY-MM-DD`.

## 2026-11-17

- Recorded the Phase 2 video-surface decision in [02-libvlc-integration.md](02-libvlc-integration.md): native video stays on the canvas frame pump (960 px wide, even dimensions, RV32, latest frame wins, DOM overlays stay). The old 1080p30 / <25% core gate is closed as a pivot to embedding. A native window is a later mode, only if a real file is unwatchable. [01-player-enhancements.md](01-player-enhancements.md) §3 matches that decision.
- Recorded the Phase 3 libvlc seam in [02-libvlc-integration.md](02-libvlc-integration.md): network MRLs, `player://event`, audio and subtitle track switching, and external subtitle load. Left equalizer mapping, the optional volume and visualizer work, and packaging open.
- [01-player-enhancements.md](01-player-enhancements.md) §3 now points at that in-progress state.
- Added this folder's `OVERVIEW.md` and `CHANGELOG.md`.

## 2026-11-14

- Added [02-libvlc-integration.md](02-libvlc-integration.md) and pointed [01-player-enhancements.md](01-player-enhancements.md) §3 at it. Later the same day the doc recorded the verified Phase 0 scaffold, the Phase 1 audio route, and the Phase 2 frame-pump measurements.
