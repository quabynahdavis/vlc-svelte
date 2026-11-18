# Changelog — Plans

Dates use `YYYY-MM-DD`.

## 2026-11-18

- libvlc opens only a real non-empty file. Asset URLs and `path:asset://…:native` watch keys are decoded to that path; empty files, directories, and raw asset URLs are not opened. The frame stays at the decoder size and the webview fetches it from `http://vlcframe.localhost/frame`. Recorded in [02-libvlc-integration.md](02-libvlc-integration.md).
- Native local-video seek hover uses `thumb_generate` at the hovered time, cached by file path and timestamp; streams with no local path stay without a thumbnail. Recorded in [02-libvlc-integration.md](02-libvlc-integration.md).
- The RV32 callback keeps the decoder's width and height. Resizing inside that callback makes swscale fail, so the canvas shows the full frame. Recorded in [02-libvlc-integration.md](02-libvlc-integration.md).
- Linux WebKitGTK fetches libvlc frames and PCM at `http://vlcframe.localhost/frame` and `http://vlcaudio.localhost/pcm`. Recorded in [02-libvlc-integration.md](02-libvlc-integration.md).
- Software decode is required for the RV32 callback. Recorded in [02-libvlc-integration.md](02-libvlc-integration.md).

## 2026-11-17

- libvlc is the default playback engine. The webview `<video>` player is optional: it is used when the binary is built without the `libvlc` feature, or when the user turns Webview player on (`html5Playback`, default false). A saved `nativePlayback: false` from the old default is not treated as that opt-in. Recorded in [02-libvlc-integration.md](02-libvlc-integration.md). [OVERVIEW.md](OVERVIEW.md) matches.
- Recorded the native equalizer and subtitle profile in [02-libvlc-integration.md](02-libvlc-integration.md) §4. The faders are libvlc 3.0.24's bands (31.25, 62.5, 125, 250, 500, 1000, 2000, 4000, 8000, 16000 Hz) plus preamp. `set_equalizer` changes callback PCM; preamp +12 dB with flat bands is unity. Subtitle font, colours, size, outline, background, vertical margin, and delay go through libvlc's freetype renderer.
- Recorded the shipped native audio tap in [02-libvlc-integration.md](02-libvlc-integration.md) §4. The callback PCM is post-volume `S16N` (libvlc 3.0.24 amem rejects `FL32` and cubes software gain, so 100% is unity). libvlc is held at 125; above that the tap applies `percent / 125` and `tanh`. `vlcaudio://` chunks play through the existing analyser graph, and the dock visualizer uses them while they are arriving. The canvas frame pump is unchanged.
- Recorded the Phase 2 video-surface decision in [02-libvlc-integration.md](02-libvlc-integration.md): native video stays on the canvas frame pump (960 px wide, even dimensions, RV32, latest frame wins, DOM overlays stay). The old 1080p30 / <25% core gate is closed as a pivot to embedding. A native window is a later mode, only if a real file is unwatchable. [01-player-enhancements.md](01-player-enhancements.md) §3 matches that decision.
- Recorded the Phase 3 libvlc seam in [02-libvlc-integration.md](02-libvlc-integration.md): network MRLs, `player://event`, audio and subtitle track switching, and external subtitle load. Left equalizer mapping, the optional volume and visualizer work, and packaging open.
- [01-player-enhancements.md](01-player-enhancements.md) §3 now points at that in-progress state.
- Added this folder's `OVERVIEW.md` and `CHANGELOG.md`.

## 2026-11-14

- Added [02-libvlc-integration.md](02-libvlc-integration.md) and pointed [01-player-enhancements.md](01-player-enhancements.md) §3 at it. Later the same day the doc recorded the verified Phase 0 scaffold, the Phase 1 audio route, and the Phase 2 frame-pump measurements.
