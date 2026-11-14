# libvlc Integration Plan

**Status**: Prepared — Phase 0 scaffold landed behind a cargo feature flag
**Target**: All platforms (Linux, macOS, Windows), feature-flagged and off by default
**Backend**: `libvlc` 3.x via the `vlc` crate (vlc-rs) inside `src-tauri/src/player.rs`

---

## 0. Summary & Current State

Playback today is entirely HTML5: `PlayerView.svelte` renders a `<video>` element whose `src` is an `asset://` URL, with the Web Audio graph (`AudioContext` → `GainNode` → `AnalyserNode`) providing the 100–200% volume boost and the dock visualizer. Transport UI lives in `TransportBar.svelte`; thumbnails, waveforms and cover art are Rust-side (ffmpeg + lofty + SQLite); queue and watch-state logic is store-driven. This stack covers local file playback well and is the shipped default.

libvlc unlocks what the webview codec stack cannot:

- **Hardware decode** for HEVC/H.265 and AV1 (webview support varies per WebKitGTK/WebView2 build and often falls back to software decode).
- **Network stream protocols** beyond plain HTTP progressive: RTSP/RTP, HLS, DASH, MMS — plus libvlc's own network resilience (reconnect, caching options).
- **Disc formats**: DVD and Blu-ray menus and navigation.
- **Codec coverage**: MKV attachments, unusual audio codecs, A/52, DTS, etc., without depending on the webview build.
- **Audio track switching** inside multi-track containers and an audio equalizer / spatializer API.
- **Robust subtitle handling**: embedded subtitle track selection and external SRT load at runtime.

Why feature-flagged rather than a cutover:

- **No system libvlc on the dev machine** — the default build must never link or require it.
- **vlc-rs 0.1.0** is a thin binding targeting **libvlc 3.x only**; libvlc 4 (still churning its API) is not supported by the bindings yet.
- HTML5 is proven and covers current needs; the native path stays optional until each phase's acceptance criteria pass. The intent is a **backend swap behind a stable seam**, not a rewrite: `src/stores/player.ts` remains the single source of truth for state in both modes.

---

## 1. Scaffolding (Already Prepared)

Phase 0 introduced the seam without touching default behavior. Nothing links libvlc unless explicitly opted in.

### Feature flag (`src-tauri/Cargo.toml`)

```toml
[dependencies]
vlc = { version = "0.1.0", optional = true }

[features]
libvlc = ["dep:vlc"]
```

The default feature set is unchanged: `cargo build` / `cargo test` never compile the `vlc` crate, and the produced binary has no libvlc dependency.

### Command surface (`src-tauri/src/player.rs`)

Nine commands, all gated behind `#[cfg(feature = "libvlc")]` for the native implementation and compiled as thin stubs otherwise:

| Command | Signature | Semantics |
| --- | --- | --- |
| `player_probe` | `() -> 'html5' \| 'native'` | Reports which backend is active. `'html5'` unless the binary was built with `--features libvlc` **and** a libvlc runtime was found at startup. The frontend uses this to enable/disable the native toggle. |
| `player_load` | `(path_or_url, opts?) -> ok` | Stops any current playback, creates a `MediaPlayer` for the media (local path or network URL), prepares it paused. Returns metadata the store needs (duration, tracks) where available. |
| `player_play` | `() -> ok` | Resumes/plays. |
| `player_pause` | `() -> ok` | Pauses. |
| `player_toggle` | `() -> ok` | Play/pause toggle, mirroring the store's `togglePlayback`. |
| `player_stop` | `() -> ok` | Stops and releases the media (called on track change and teardown). |
| `player_seek` | `(seconds: f64) -> ok` | Absolute time seek; libvlc handles keyframe snap internally. |
| `player_set_volume` | `(0..200) -> ok` | Percent volume; see §4 for the >125% gap. |
| `player_position` | `() -> { time, length }` | Current position poll (ms), replacing HTML5 `timeupdate` on the native path. |

### TS seam (`src/lib/playerBackend.ts`)

Typed wrappers over `invoke` for the nine commands plus `playerBackend()` — a resolver that returns `'html5'` when `hasTauri()` is false, when the probe says so, or when the user's native toggle is off. All future call sites go through this module; no component ever invokes `player_*` directly.

### Enabling the flag locally

```bash
# Debian/Ubuntu
sudo apt install libvlc-dev        # headers + pkg-config file for linking
sudo apt install libvlc5 vlc       # runtime, for actually playing media

cd src-tauri && cargo build --features libvlc
```

Without the dev package the build fails at link time with a clear pkg-config error — this is intentional; the default build never links libvlc.

---

## 2. System Requirements & Install Matrix

vlc-rs locates libvlc via **pkg-config on Linux** (`libvlc.pc` comes with `libvlc-dev`) and standard link paths elsewhere.

| Platform | Build-time (dev) | Runtime | Notes |
| --- | --- | --- | --- |
| Linux (Debian/Ubuntu) | `libvlc-dev` (3.x) | `libvlc5` + `vlc` plugin packages, or a full `vlc` install | Simplest path; plugins resolved from `/usr/lib/x86_64-linux-gnu/vlc/plugins`. |
| Windows | `vlc` MSVC prebuilt (or vcpkg `libvlc`) | **Bundle** `libvlc.dll`, `libvlccore.dll` and the `plugins/` directory alongside the app executable | Plugin discovery needs `VLC_PLUGIN_PATH` pointed at the bundled `plugins/` dir. |
| macOS | `brew install libvlc` (keg) or the `VLC.app` framework | Same as build-time, or bundle `VLC.app`/the framework into the `.app` | vlc-rs supports `set_nsobject` for AppKit view embedding. |

**Bundling strategy (open question for Phase 4):** Tauri supports `externalBin` sidecars and `resources`. libvlc is not a sidecar-shaped dependency — it is a DLL/dylib plus a **plugin tree** whose layout must be preserved. The likely shape is `resources` for `libvlccore`, `plugins/` and the locales, with the main `libvlc` dynamic library linked/loaded alongside the executable; on Windows this may mean `externalBin` + a manual `VLC_PLUGIN_PATH` set in `main.rs` before libvlc init. Linux can lean on the system `vlc` package and document it as an optional runtime dependency, with bundling as a follow-up. License note: bundling libvlc means shipping LGPL-2.1 components — already accounted for in `LICENSES/` — but the plugin set must be reviewed for GPL-only plugins.

---

## 3. Video Rendering Surface Decision (the Hard Part)

libvlc decodes frames outside the webview. Getting them on screen in a Tauri window has two viable approaches.

### (a) Native window embedding

Attach libvlc's video output to a native window handle layered with the webview: `media_player.set_hwnd(hwnd)` on Windows, `set_nsobject(win_id)` on macOS, `set_xwindow(xid)` on Linux (X11; Wayland goes through `set_xwindow` with the xdg-shellless path or an X11 window).

**Pros**
- Zero per-frame IPC: full GPU performance, 4K/HDR capable, exactly the output path desktop VLC uses.
- No pixel-format or color-space translation work.

**Cons**
- **Z-order fight**: the video surface must be a native child window that coexists with the webview. Either it sits *above* the webview (then the transport bar, hover previews and subtitle overlay must be a second native layer, or punched through) or *behind* with a transparent webview hole (WebKitGTK transparency support is uneven). This is the classic video-player-under-browser-overlay problem and it is fiddly per platform.
- **Loses DOM overlays**: subtitle styling, hover scrub previews and any Svelte-rendered OSD would have to be native or dropped; the existing subtitle profile system would not apply.
- X11/Wayland differences on Linux need separate handling.

### (b) Video callbacks → webview surface

Register `set_video_callbacks(lock/unlock/display/cleanup)` (vlc-rs exposes these). libvlc hands decoded frames (typically `RV32`/`YUV` planar) to our callbacks; we copy into a shared buffer and get it to the webview either by:

- a **custom protocol frame pump** — same shape as the existing `asset://`/`thumb` pipeline: a `vlcframe://` handler streams the latest frame, the frontend paints it into a `<canvas>` via rAF; or
- a shared-memory/IPC channel with a lightweight encoding (downscaled BGR + dirty-rect) to cut bandwidth.

**Pros**
- **Preserves the entire UI stack**: transport bar, hover previews, subtitle profiles, PiP chrome, gestures — everything keeps working because the frame is just pixels in a DOM surface.
- No z-order or transparency battles; one code path per platform (the callback contract).
- Fits the project's existing "Rust produces bytes, webview renders" pattern.

**Cons**
- **Per-frame IPC bandwidth**: 1080p RV32 ≈ 8 MB, 4K ≈ 33 MB per frame — impossible over the standard invoke/protocol channel at 30–60 fps without downscaling or shared memory. Needs a cap (e.g. render at ≤1080p RGB or YUV→RGB on the Rust side) or an shm design.
- Pixel-format negotiation: `set_video_format` to pick a format we can cheaply convert; color space/DPR mismatch between the decoded frame and the canvas backing store must be handled.
- Frame pacing: the pump must drop frames, never queue them (latest-frame-wins semantics).

### Recommendation

**Prototype (b) first, capped to the existing thumbnail-protocol style** (latest-frame custom protocol into a `<canvas>`), because it keeps all DOM overlays and the whole existing UI — the cost is a perf cliff, not a design dead end. **Fall back to (a)** for a "native video" mode if measured frame-pump latency/CPU at 1080p is unacceptable, accepting the overlay compromises. The decision gate is Phase 2's exit criterion (§9): smooth 1080p30 with <25% single-core CPU on the dev machine, or we pivot.

```rust
// Shape of the (b) prototype, inside player.rs (feature = "libvlc")
mp.set_video_format("RV32", width, height, pitch, lines);
mp.set_video_callbacks(
    lock:   || &mut frame_buf,          // returns the writable buffer
    unlock: |_| {},                     // publish seq number
    display: |_| tx.latest_replace(buf), // latest-frame-wins channel
    cleanup: || {},
);
// vlcframe:// custom protocol handler serves buf as raw BGRA + stride metadata
```

---

## 4. Audio Path

The native backend bypasses the entire Web Audio chain — the `<video>` element no longer exists, so `createMediaElementSource` has nothing to attach to.

### Volume

The store's 0–200% volume maps to `player_set_volume(0..200)`, but `libvlc_audio_set_volume` caps at **125%** on the native side. Options, in preference order:

1. **Soft-clip gain above 125%**: register an audio callback (`set_audio_callbacks`), apply `gain = vol/125` in the PCM tap ourselves, and normalize through `libvlc_audio_set_volume` up to 125 only. Adds a copy through the callback path and clip risk at extreme settings.
2. **Accept a 125% cap in native mode** and surface the difference honestly in the volume HUD (simplest, no audio-quality risk). The 200% capability remains an HTML5-mode feature.

Decide during Phase 1 based on how loud users actually need native mode to be; option 2 is the Phase 1 default, option 1 is a Phase 3 refinement.

### Visualizer

The `AnalyserNode` loses its media-element source in native mode. Replacement options:

- **PCM tap → Web Audio**: the same `set_audio_callbacks` tap posts interleaved float PCM to the webview, where it feeds an `AudioWorklet`/`AnalyserNode` fed by a script-processed source. Preserves the existing visualizer panel untouched but adds continuous audio IPC (a modest, stereo-48kHz-sized stream — far cheaper than video frames).
- **HTML5-only visualizer initially**: in native mode the dock panel shows the synthetic fallback bars it already uses when the analyser is unusable. Zero new code; ship this in Phase 1.

Phase 1 ships the second option; the PCM tap is a Phase 3 item only if wanted.

---

## 5. Feature Parity Checklist

| Capability | HTML5 today | libvlc path | Gap / action |
| --- | --- | --- | --- |
| Play / pause / toggle | `<video>` events | `player_play` / `player_pause` / `player_toggle` | None — store routes through the seam |
| Seek | `currentTime` | `player_seek(seconds)` + `player_position` poll | Poll cadence replaces `timeupdate`; same store shape |
| Volume 0–200% | Web Audio `GainNode` | `player_set_volume`, native cap 125% | §4 decision; HUD must reflect the active cap |
| Mute | `video.muted` / gain 0 | volume 0 via command | None |
| Playback rate | `playbackRate` | `libvlc_media_player_set_rate` | Add to the seam when rate control ships |
| Fullscreen | DOM fullscreen on the stage shell | Same — surface is a DOM element (approach b); native fullscreen only under approach (a) | None under (b) |
| Subtitles | WebVTT `<track>` from subtitle profiles | `add_slave` / `media_slaves` for external SRT; embedded track switching via `set_spu` | SRT load + track switching need new seam calls (Phase 3); profile styling applies to approach (b) only |
| Audio track switching | Not available (webview default track) | `set_es` audio track selection | New capability on native (Phase 3) |
| Waveform seekbar | Rust ffmpeg pipeline | Unaffected | None — Rust-side, independent of playback backend |
| Thumbnails | Rust ffmpeg pipeline | Unaffected | None |
| Cover art / metadata | lofty | Unaffected | None |
| Queue / next-episode | Store-driven | Unchanged | None — store logic is backend-agnostic |
| Keyboard shortcuts | Global handlers → store | Unchanged | None |
| Watch progress / history | Store + SQLite | Unchanged | None |
| Network streams | HTTP progressive via `<video src>` | RTSP/HLS/DASH via libvlc | New capability on native (Phase 3); `NetworkPanel` URLs pass through `player_load` unchanged |

---

## 6. Frontend Integration Steps

1. **Settings toggle**: add `nativePlaybackEnabled: boolean` (default `false`) to `src/stores/settings.ts` under Settings → Player. Shown/labelled only when `playerProbe()` returns `'native'`; the toggle is inert otherwise.
2. **Backend resolution**: `playerBackend()` in `src/lib/playerBackend.ts` returns `'native'` only when Tauri is present, the probe reports native, and the toggle is on. It re-resolves reactively so flipping the toggle switches live or at next track load.
3. **PlayerView gating**: when the backend is `'native'`:
   - hide the `<video>` element and render the backend's surface container (`<canvas>` for approach (b), a native-surface placeholder div for (a));
   - route `play/pause/toggle/stop/seek/setVolume` from the player store through the seam commands instead of the element API;
   - subscribe to position via the bridge (next step) and feed the same store fields the HTML5 path updates, so `TransportBar` is unchanged.
4. **Position/event bridge**: HTML5 gets `timeupdate` for free; native does not. Two options:
   - **Polling** `player_position` on a rAF-driven interval (~4 Hz, paused while not playing). Simple, robust, already proven by the watch-progress tick; slight position-update latency.
   - **Tauri events** emitted from Rust `MediaPlayerEventManager` callbacks (end-reached, seekable-changed, encoutered-error → `app.emit("player://event", …)`). Lower latency and enables end-of-track detection for next-episode without polling; requires careful listener cleanup on track change.

   Recommended: start with polling (Phase 1–2), add events for `end-reached`/error in Phase 3 since next-episode auto-advance needs a reliable end signal.
5. **Failure mode**: if any seam command rejects (native path broken, media unloadable), fall back to `'html5'` for the remainder of the session and surface a one-line notice — never a dead player.

---

## 7. Testing & Acceptance

### Test matrix (manual, per phase)

| Area | Cases |
| --- | --- |
| Audio formats | mp3, m4a, flac, ogg, wav — load, play, seek, pause/resume, stop, next-track |
| Video formats | h264 mp4, hevc mkv (the HW-decode win), av1 webm/mkv |
| Network | http progressive file, rtsp stream, hls playlist; stream error handling (unreachable host) |
| Subtitles | external .srt via add_slave, embedded subtitle track switch |
| Volume | 0%, 50%, 125% (native cap), 200% request (cap or soft-clip per §4 decision), mute |
| Seek accuracy | audio (sample-accurate-ish), video keyframe, seek while paused, seek near EOF |
| Track switching | multi-audio mkv; switch while playing without restart |
| Lifecycle | track change releases previous media; stop then load; app quit mid-playback; native→html5 toggle mid-session |

### Acceptance criteria per phase

- **Phase 0**: `cargo build` (default) and `cargo test` pass with zero libvlc references in the binary; `cargo build --features libvlc` compiles on a machine with `libvlc-dev`; `player_probe` returns `'html5'` in default builds; all nine stub commands respond without panicking.
- **Phase 1**: audio file loads and plays natively with correct volume semantics; switching tracks does not leak media players; the HTML5 path is byte-for-byte unchanged when the toggle is off.
- **Phase 2**: chosen rendering approach produces stable video at 1080p30 with acceptable CPU (gate: <25% single-core for the frame pump) and correct aspect ratio/DPR; otherwise the approach decision is revisited per §3.
- **Phase 3**: RTSP and HLS load and play; subtitle track switching works; end-of-track event drives next-episode.
- **Phase 4**: the shipped package on each OS runs native mode from a clean machine (no system VLC installed) with the bundled plugin tree.

---

## 8. Risks & Mitigations

| Risk | Severity | Mitigation |
| --- | --- | --- |
| vlc-rs 0.1.0 maturity — thin, sparsely documented binding; gaps (e.g. event manager ergonomics) | High | Expect to drop to `libvlc-sys` raw FFI escapes for isolated calls; isolate all libvlc usage inside `player.rs` so escapes stay contained; pin the crate version. |
| libvlc 4 API break | High | Pin libvlc **3.x** in docs and packaging checks; assert major version at probe time; vlc-rs does not support 4.x anyway. |
| Per-OS packaging (Windows DLL + plugins, macOS framework) | High | Defer to Phase 4; Linux-first with system packages; treat bundling as its own acceptance matrix row. |
| Callback-thread panics — libvlc invokes callbacks on its own threads; unwinding across FFI is UB | High | Every callback body wrapped in `catch_unwind` + logged, never let a panic escape; all shared state behind `Mutex`/atomics, no re-entrancy into the Tauri runtime from callback threads (emit via channels instead). |
| Frame-pump performance (§3b) | Medium | Latest-frame-wins, never queue; cap render resolution; measure before committing — pivot to native embedding if the gate fails. |
| DPR / color-space mismatch between decoded frames and the webview canvas | Medium | Negotiate the pixel format explicitly via `set_video_format`; render the canvas backing store at device pixel ratio; test on both 1x and 2x displays. |
| Two code paths forever — every player feature needs HTML5 + native implementations | Medium | The store (`src/stores/player.ts`) stays the single source of truth; the seam is the only place that branches. Features that cannot be provided natively degrade explicitly (§4 visualizer, §5 volume cap) rather than silently diverging. HTML5 remains the default so the native path cannot regress the shipped experience. |
| LGPL bundling scope if plugins ship (Phase 4) | Low | Plugin set review before packaging; the LICENSES boundary is already documented. |

---

## 9. Phase Plan

| Phase | Scope | Effort | Exit criteria |
| --- | --- | --- | --- |
| **0 — Scaffold** (done) | Feature flag, `player.rs` stubs, nine commands, `player_probe` contract, TS seam | small | §7 Phase 0 criteria; default build unchanged |
| **1 — Audio-only native** | Real libvlc init behind the toggle, audio file playback end-to-end, volume semantics (125% cap), teardown on track change, HTML5-only visualizer fallback | medium | §7 Phase 1 criteria; a user can play an mp3 natively with the toggle on and nothing changes with it off |
| **2 — Video surface decision** | Prototype (b) frame pump to `<canvas>`; measure; decide (b) vs (a); implement the chosen path for video files | large | §7 Phase 2 criteria; written decision record appended to this doc |
| **3 — Subtitles, equalizer, network** | `add_slave`/SRT load, embedded track switching (audio + subtitle), end-of-track events for next-episode, RTSP/HLS `player_load`, optional >125% soft-clip, optional PCM-tap visualizer | medium | §7 Phase 3 criteria |
| **4 — Packaging** | Windows DLL+plugins bundling, macOS framework, Linux bundling-or-doc decision, plugin license review, clean-machine acceptance on all three OSes | medium–large | §7 Phase 4 criteria |

Phases 2 and 3 are independent enough to interleave (network-stream support is valuable even before the video surface is final, since audio streams need no surface).
