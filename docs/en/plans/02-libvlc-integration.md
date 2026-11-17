# libvlc Integration Plan

**Status**: Phase 3 seam landed (network MRLs, end/error events, audio and subtitle track switching, external subtitle load). The >125% soft-clip and the PCM visualizer are in: one libvlc audio callback feeds both. Phase 2 is decided: native video stays on the canvas frame pump (960 px wide, even dimensions, RV32, latest frame wins, DOM overlays stay). A native window is a later mode, only if a real file is unwatchable in the app. Equalizer mapping and packaging are not started. As of 2026-11-17, libvlc is the default playback engine and the webview `<video>` player is optional.
**Target**: All platforms (Linux, macOS, Windows). libvlc is the default engine; the webview player is the optional fallback.
**Backend**: `libvlc` 3.x via the `vlc` crate (vlc-rs) inside `src-tauri/src/player.rs`

---

## 0. Summary & Current State

libvlc plays video and music by default when `player_probe` reports `'native'`. The webview `<video>` player is optional. `PlayerView.svelte` still owns that element for the fallback: its `src` is an `asset://` URL, and the Web Audio graph (`AudioContext` → `GainNode` → `AnalyserNode`) provides the 100–200% volume boost and the dock visualizer on that path. Transport UI lives in `TransportBar.svelte`; thumbnails, waveforms and cover art are Rust-side (ffmpeg + lofty + SQLite); queue and watch-state logic is store-driven. The webview player is used when the binary was built without libvlc, or when the user turns it on.

libvlc unlocks what the webview codec stack cannot:

- **Hardware decode** for HEVC/H.265 and AV1 (webview support varies per WebKitGTK/WebView2 build and often falls back to software decode).
- **Network stream protocols** beyond plain HTTP progressive: RTSP/RTP, HLS, DASH, MMS — plus libvlc's own network resilience (reconnect, caching options).
- **Disc formats**: DVD and Blu-ray menus and navigation.
- **Codec coverage**: MKV attachments, unusual audio codecs, A/52, DTS, etc., without depending on the webview build.
- **Audio track switching** inside multi-track containers and an audio equalizer / spatializer API.
- **Robust subtitle handling**: embedded subtitle track selection and external SRT load at runtime.

Why the feature flag stays, with libvlc on by default:

- **libvlc is present on the dev machine** (3.0.24: `/usr/lib/libvlc.so`, headers in `/usr/include/vlc`, pkg-config file `libvlc.pc`). `cargo build` and `tauri dev` link it. `cargo check --no-default-features` still builds the HTML5-only binary with no libvlc linked.
- **vlc-rs 0.1.0** is a thin binding targeting **libvlc 3.x only**; libvlc 4 (still churning its API) is not supported by the bindings yet.
- The webview player stays available as the fallback. The intent is a **backend swap behind a stable seam**, not a rewrite: `src/stores/player.ts` remains the single source of truth for state in both modes.

---

## 1. Scaffolding (Already Prepared)

Phase 0 introduced the seam behind a feature flag. As of 2026-11-17 that flag is the Cargo default, so a normal build links libvlc. `--no-default-features` keeps the HTML5-only binary.

### Feature flag (`src-tauri/Cargo.toml`)

```toml
[dependencies]
# NOTE: the bare `vlc` crate on crates.io is a binary application, not a
# library. The actual binding crate is `vlc-rs`, whose lib target is named
# `vlc` (so all code paths stay `vlc::Instance` etc.).
vlc = { package = "vlc-rs", version = "0.1.0", optional = true }

[features]
default = ["libvlc"]
libvlc = ["dep:vlc", "dep:libc"]
```

`cargo build`, `cargo test`, and `tauri dev` / `tauri build` use that default and link libvlc. `cargo check --no-default-features` does not compile the `vlc` crate, and that binary has no libvlc dependency. The desktop npm scripts (`dev`, `dev:tauri`, `build`) call `tauri dev` / `tauri build` without `--no-default-features`, so they follow the Cargo default.

### Command surface (`src-tauri/src/player.rs`)

Fourteen commands, all compiled in both builds so the frontend contract is stable (the native half lives in a `#[cfg(feature = "libvlc")]` module; the stub half answers with a descriptive error, except the track-list commands, which answer with an empty list):

| Command | Signature | Semantics |
| --- | --- | --- |
| `player_probe` | `() -> 'html5' \| 'native'` | Purely compile-time: reports which half was built. `'native'` when the `libvlc` feature is on (the default build). `'html5'` for `--no-default-features`. The frontend uses libvlc when this is `'native'` unless the user turns the webview player on. When this is `'html5'`, Settings keeps playback on the webview player and does not offer a native switch. |
| `player_load` | `(path) -> generation` | Stops any current playback, creates a fresh `Instance`/`Media`/`MediaPlayer` and starts playback. A filesystem path uses `new_path`; `http`/`https` (HLS and DASH included), `rtsp`, `rtmp`, `mms`, `rtp` and `udp` use `new_location`; `file://` is decoded to a path. The returned generation is stamped on that media's events. |
| `player_play` | `() -> ok` | Resumes/plays. |
| `player_pause` | `() -> ok` | Pauses. |
| `player_toggle` | `() -> bool` | Play/pause toggle, answering the new is-playing state. |
| `player_stop` | `() -> ok` | Stops and releases the media (called on track change and teardown). |
| `player_seek` | `(seconds: f64) -> ok` | Absolute time seek; libvlc handles keyframe snap internally. |
| `player_set_volume` | `(percent: i32) -> ok` | 0–200. libvlc is held at 125; the PCM tap soft-clips the rest. See §4. |
| `player_position` | `() -> (time, length)` | Current position poll in **seconds**. Length falls back from the media to the player, and is `0` when unknown (live streams). |
| `player_audio_tracks` | `() -> { tracks, current }` | Audio elementary streams once the input has opened them. Empty when nothing is loaded. |
| `player_set_audio_track` | `(id) -> ok` | Select an audio track by libvlc id. |
| `player_spu_tracks` | `() -> { tracks, current }` | Subtitle tracks. `-1` is libvlc's disable entry when it offers one. |
| `player_set_spu` | `(id) -> ok` | Select a subtitle track. `-1` disables. libvlc blends the SPU into the callback picture. |
| `player_add_subtitle` | `(path) -> ok` | Add an external subtitle (path or allowlisted URL) and select it. |

### TS seam (`src/lib/playerBackend.ts`)

Typed wrappers over `invoke` for the commands plus `playerBackend()` — which returns `'html5'` for browser preview, when the probe fails, or whenever the shell reports the HTML5 build. All future call sites go through this module; no component ever invokes `player_*` directly. The shell emits `player://event` with `{ kind: 'ended' \| 'error', generation }` from a channel drained off libvlc's callback thread. The main window capability includes `core:event:allow-listen` so the webview can subscribe.

### Enabling the flag locally

```bash
# Debian/Ubuntu
sudo apt install libvlc-dev        # headers + pkg-config file for linking
sudo apt install libvlc5 vlc       # runtime, for actually playing media

cd src-tauri && cargo build
# HTML5-only binary, no libvlc linked:
cd src-tauri && cargo check --no-default-features
```

Without the dev package the default build fails at link time with a clear pkg-config error. `--no-default-features` does not need libvlc.

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

**Native video stays on the canvas frame pump (approach b), as the prototype already shipped.** The next slice does not build a native window embed.

The shipped pump is:

- **960 px wide**, even dimensions, **RV32**, as implemented (the 1080p sample is published at 960×544).
- **Latest frame wins.** The pump drops frames; it does not queue them.
- **DOM overlays stay**: transport, hover chrome, docks, and the subtitle UI. The frame is pixels in a `<canvas>`, so those Svelte surfaces remain.

The old Phase 2 gate — smooth 1080p30 at <25% of one core, or pivot to embedding — is **closed as a pivot trigger**. The lab numbers already in §9 are why:

- The copy is cheap: display-callback swizzle and publish costs about **2.53 ms/frame** in a release build (the pump ceiling is far above 30 fps).
- The slow run was **software decode**, about **14 fps** on the 1080p sample (13.8 fps in the release run), not the pump.
- A native window (`set_xwindow` / `set_hwnd` / `set_nsobject`) would drop the DOM overlays this shell exists to keep.

A native window remains a **later mode**, only if a real file is unwatchable in the app. Hardware decode and 4K are the reason to revisit it.

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

The native backend does not play through the `<video>` element. `libvlc_audio_set_callbacks` replaces the normal audio output, so the samples are silent unless something else plays them. One play callback fills a ring. The webview plays that PCM, and the same chunks are what the dock visualizer hears.

Phase 1 shipped the 125% cap and the synthetic bars. Both are replaced by the behavior below. The canvas frame pump is unchanged.

### What the callback receives

libvlc 3.0.24's `amem` module is the output behind these callbacks. Two facts about it decided the code:

- **Sample format.** `amem` only accepts `S16N`. Asking for `FL32` makes `Start()` fail, and native playback goes silent. The setup callback requests stereo, 48 kHz, `S16N`. The play callback converts those samples to float as it copies them. The webview only sees float PCM.
- **Volume is post-volume.** There is no `libvlc_audio_set_volume_callback`, so amem uses its software volume (`SoftVolumeSet` / `SoftMuteSet`). That cubes the linear gain — `(percent / 100)³` — and amplifies the PCM *before* `play`. 100% cubes to 1, so unity is unchanged. The callback does not receive pre-volume samples.

`SoftVolumeSet` itself does not stop at 125. This app still holds the libvlc call at 125, which is the cap Phase 1 hit on the normal output. The tap applies everything above that.

Because the amplifier runs on s16, a 125% setting (about 1.95× after the cube) can already hard-clip inside int16. The tanh stage only softens what is left.

### Volume

The UI stays 0–200.

| UI percent | `libvlc_audio_set_volume` | Tap, before the chunk is played |
| --- | --- | --- |
| 0, or mute | 0 | Silence. The Web Audio gain is also 0, so chunks already queued go silent immediately. |
| 1–125 | That same percent | Gain 1. Samples pass through, so 100% stays unity. |
| 126–200 | 125 | Gain `percent / 125`, then `tanh`. Not a hard clamp to ±1. |

0–125 follow libvlc's cubic curve, not the HTML5 linear `GainNode`. 50% is much quieter in native mode than in the webview player. 100% matches.

### PCM path and the visualizer

The play callback only copies into a ring sized ahead of time (~171 ms of stereo 48 kHz). It does not call libvlc or Tauri, and it does not allocate. If the webview falls behind, the oldest unread samples are dropped. Each callback body is wrapped so a panic cannot unwind across FFI.

`vlcaudio://localhost/pcm` serves at most ~20 ms per poll: `[seq u64][generation u32][rate u32][channels u32][frames u32][interleaved f32 LE]`. No chunk answers `204`. The player polls from `requestAnimationFrame`, one fetch at a time, and skips the poll while more than ~120 ms is already scheduled.

Those chunks play through the existing graph: `GainNode` → `AnalyserNode` → destination. The gain node is only the mute and 0% switch. HTML5 playback still uses `createMediaElementSource` on the media element. Native mode clears that element's `src`, so it does not also play.

`AudioVisualizerPanel` is the same panel. While native mode is on and a chunk has arrived in the last 250 ms, it reads that analyser. Synthetic bars remain when the tap is silent or native mode is off.

Track changes, seek, pause, stop, and leaving native mode flush the ring (the generation counter bumps) and drop buffers the webview had already scheduled.

### Equalizer

The dock and Settings → Audio faders are a preamp plus libvlc 3.0.24's ten ISO bands, from `libvlc_audio_equalizer_get_band_frequency`:

31.25, 62.5, 125, 250, 500, 1000, 2000, 4000, 8000, 16000 Hz.

The labels are 31.25 Hz, 62.5 Hz, 125 Hz, 250 Hz, 500 Hz, 1 kHz, 2 kHz, 4 kHz, 8 kHz, and 16 kHz. A save written for the old centres (60, 170, 310, 600, 1k, 3k, 6k, 12k, 14k, 16 kHz) has no `eqLayout` of `libvlc-iso-10`, so those gains are dropped instead of being played as if 60 Hz were 31.25 Hz.

Presets are None, Flat, Rock, Jazz, Classical, and Podcast. Flat, Rock, and Classical load libvlc's preset of the same name, preamp included. None zeros the preamp and the ten bands. Jazz and Podcast are local curves for these bands (libvlc has neither preset), with preamp +12 dB so they share Flat's loudness baseline. Flat itself is preamp +12 dB and ten zeros.

When native playback is on and the equalizer toggle is on, `player_set_equalizer` sets the preamp, sets each band with `libvlc_audio_equalizer_set_amp_at_index`, and calls `libvlc_media_player_set_equalizer`. The toggle off passes NULL, which bypasses the filter. HTML5 still stores and shows the faders. It does not run them on the media element.

A throwaway probe (compiled, run, deleted, not committed) played a 1 kHz sine through `libvlc_audio_set_callbacks` on this machine's libvlc 3.0.24. The equalizer does change that PCM:

- No equalizer: the dry level.
- Filter on, preamp 0 dB, every band 0 dB: about −12 dB (RMS ratio 0.25). The filter multiplies the input by `EQZ_IN_FACTOR` (0.25).
- Preamp +12 dB, bands at 0: back to the dry level (ratio about 0.995). That curve is unity. It is also libvlc's Flat preset.
- Preamp 0 dB and the 1000 Hz band at +12 dB: the sine returned to the dry level, so the band gain is in the callback samples.

A band at 0 dB adds nothing. Because the filter already affects the callback, the tap does not run a second equalizer. Two-pass stays off; that path squares the preamp and would move the unity point.

### Subtitle profile

Native subtitles stay libvlc's freetype text, blended into the frame. There is no cue parser and no DOM subtitle layer. `player_set_subtitle_profile` sends the active profile (`subtitleProfiles.formatting` and the live delay in `settings.subtitleDelay`) into libvlc. HTML5 is left as it is.

| Profile | libvlc |
| --- | --- |
| Font family | `--freetype-font`, and only when `fc-list` has that family. Otherwise the option is omitted and libvlc keeps its default face. On this machine DejaVu Sans and Noto Sans resolve; Inter and Roboto do not. A missing family does not fail playback. |
| Text colour `#RRGGBB` | `--freetype-color` as that RGB integer, with `--freetype-opacity=255`. |
| Outline colour | `--freetype-outline-color`. Outline opacity is 255 when the thickness is above 0, and 0 when it is 0. |
| Size, relative percent | `--freetype-fontsize=0` and `--sub-text-scale` set to the percent (50–200). 100 is libvlc's normal scale. |
| Size, exact pixels | `--freetype-fontsize` set to the pixel size (12–72) and `--sub-text-scale=100`. A non-zero absolute size overrides the relative size. |
| Outline width 0–4 | `--freetype-outline-thickness` as the rounded integer. libvlc reads it as a fraction of the glyph (`value / 100`, clipped at 0.5). 0 is none, 2 is Thin, 4 is Normal. |
| Background opacity 0–100% | `--freetype-background-opacity` as `round(percent * 255 / 100)`. The background colour stays black. |
| Vertical position | `--sub-margin` in pixels. libvlc subtracts that from the subtitle's y, so a larger margin sits higher: bottom 0, lower-middle 72, middle 180, top 360. |
| Delay, seconds | `libvlc_video_set_spu_delay`, in microseconds. Positive shows the subtitle later. libvlc clears the delay on every media change, so it is set again after each load. |

Text-renderer options are arguments to `libvlc_new`. A media option does not reach freetype. Each load builds a new instance, so the next file picks up the font, the exact size, the outline colour, and the margin. During playback, delay is applied immediately. Text colour, background opacity, outline thickness, and `sub-text-scale` are also written onto the live instance, because freetype reads those on each render. Font, exact pixel size, outline colour, and the vertical margin are copied when the renderer starts, so a change to those during playback waits for the next load.

---

## 5. Feature Parity Checklist

| Capability | HTML5 today | libvlc path | Gap / action |
| --- | --- | --- | --- |
| Play / pause / toggle | `<video>` events | `player_play` / `player_pause` / `player_toggle` | None — store routes through the seam |
| Seek | `currentTime` | `player_seek(seconds)` + `player_position` poll | Poll cadence replaces `timeupdate`; same store shape |
| Volume 0–200% | Web Audio `GainNode` (linear) | libvlc 0–125 (cubic, post-volume), tap gain + `tanh` above 125 | Shipped. 100% is unity. 0–125 are not the HTML5 curve. See §4 |
| Mute | `video.muted` / gain 0 | volume 0 via command | None |
| Playback rate | `playbackRate` | `libvlc_media_player_set_rate` | Add to the seam when rate control ships |
| Fullscreen | DOM fullscreen on the stage shell | Same — surface is a DOM element (approach b); native fullscreen only under approach (a) | None under (b) |
| Subtitles | WebVTT `<track>` from subtitle profiles | libvlc SPU blended into the frame; `player_set_subtitle_profile` drives freetype (font, colours, size, outline, background, margin, delay) | Shipped for native mode. HTML5 is unchanged. See §4 |
| Audio track switching | Not available (webview default track) | `set_es` audio track selection | New capability on native (Phase 3) |
| Waveform seekbar | Rust ffmpeg pipeline | Unaffected | None — Rust-side, independent of playback backend |
| Thumbnails | Rust ffmpeg pipeline | Unaffected | None |
| Cover art / metadata | lofty | Unaffected | None |
| Queue / next-episode | Store-driven | Unchanged | None — store logic is backend-agnostic |
| Keyboard shortcuts | Global handlers → store | Unchanged | None |
| Watch progress / history | Store + SQLite | Unchanged | None |
| Network streams | HTTP progressive via `<video src>` | RTSP/HLS/DASH via libvlc | Phase 3 routes allowlisted URLs through `player_load` when libvlc is the active engine. The webview player stays the path when the user opts in, or when the probe is `'html5'`. |

---

## 6. Frontend Integration Steps

1. **Settings toggle** (shipped 2026-11-17): `html5Playback: boolean` (default `false`) in `src/stores/settings.ts`, Settings → Playback, labelled **Webview player**. Off means libvlc. A missing key uses libvlc. A saved `nativePlayback: false` from the old default is not treated as an opt-in to the webview player; `nativePlayback: true` stays on libvlc, so the rename does not invert that choice. Once `html5Playback` is stored, that boolean is the choice. When `player_probe` returns `'html5'`, the control is disabled, shown on, and playback stays on the webview player.
2. **Backend resolution**: `playerBackend()` in `src/lib/playerBackend.ts` returns `'native'` when Tauri is present and the probe reports native, and `'html5'` for browser preview, a failed probe, or the HTML5-only build. PlayerView uses libvlc only when that result is `'native'` and `html5Playback` is false. Flipping the control switches live via the media key.
3. **PlayerView gating**: when the backend is `'native'`:
   - hide the `<video>` element and render the backend's surface container (`<canvas>` for approach (b), a native-surface placeholder div for (a));
   - route `play/pause/toggle/stop/seek/setVolume` from the player store through the seam commands instead of the element API;
   - subscribe to position via the bridge (next step) and feed the same store fields the HTML5 path updates, so `TransportBar` is unchanged.
4. **Position/event bridge**: HTML5 gets `timeupdate` for free; native does not. Two options:
   - **Polling** `player_position` on a rAF-driven interval (~4 Hz, paused while not playing). Simple, robust, already proven by the watch-progress tick; slight position-update latency.
   - **Tauri events** emitted from Rust `MediaPlayerEventManager` callbacks (end-reached, seekable-changed, encoutered-error → `app.emit("player://event", …)`). Lower latency and enables end-of-track detection for next-episode without polling; requires careful listener cleanup on track change.

   Recommended: start with polling (Phase 1–2), add events for `end-reached`/error in Phase 3 since next-episode auto-advance needs a reliable end signal.
5. **Failure mode**: if any seam command rejects (native path broken, media unloadable), opt into the webview player for the session (`html5Playback: true`) and surface a one-line notice — never a dead player.

---

## 7. Testing & Acceptance

### Test matrix (manual, per phase)

| Area | Cases |
| --- | --- |
| Audio formats | mp3, m4a, flac, ogg, wav — load, play, seek, pause/resume, stop, next-track |
| Video formats | h264 mp4, hevc mkv (the HW-decode win), av1 webm/mkv |
| Network | http progressive file, rtsp stream, hls playlist; stream error handling (unreachable host) |
| Subtitles | external .srt via add_slave, embedded subtitle track switch |
| Volume | 0%, 50%, 100% (unity), 125% (libvlc cap, no extra tap gain), 200% (gain 200/125 then tanh), mute |
| Seek accuracy | audio (sample-accurate-ish), video keyframe, seek while paused, seek near EOF |
| Track switching | multi-audio mkv; switch while playing without restart |
| Lifecycle | track change releases previous media; stop then load; app quit mid-playback; native→html5 toggle mid-session |

### Acceptance criteria per phase

- **Phase 0** (historical bar, before 2026-11-17): `cargo build` and `cargo test` passed with zero libvlc references in the binary; `cargo build --features libvlc` compiled on a machine with `libvlc-dev`; `player_probe` returned `'html5'` in default builds; all nine stub commands responded without panicking. **Current bar:** `cargo build` / `cargo check` link libvlc and `player_probe` returns `'native'`; `cargo check --no-default-features` still builds the HTML5-only binary, links no libvlc, and `player_probe` returns `'html5'`.
- **Phase 1**: audio file loads and plays natively with correct volume semantics; switching tracks does not leak media players; the HTML5 path is byte-for-byte unchanged when the toggle is off.
- **Phase 2**: the canvas frame pump is the video surface: RV32, width capped at 960 px with even dimensions, latest frame wins, and DOM overlays stay. The old 1080p30 / <25% single-core gate is closed and does not pivot to embedding. A native window is a later mode, only if a real file is unwatchable in the app.
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
| Frame-pump performance (§3b) | Medium | Latest-frame-wins, never queue; width capped at 960 px, RV32. The copy measured ~2.53 ms/frame release; the ~14 fps 1080p run was software decode. The old CPU gate does not pivot to a native window. Revisit embedding only if a real file is unwatchable; hardware decode and 4K are that reason. |
| DPR / color-space mismatch between decoded frames and the webview canvas | Medium | Negotiate the pixel format explicitly via `set_video_format`; render the canvas backing store at device pixel ratio; test on both 1x and 2x displays. |
| Two code paths forever — every player feature needs HTML5 + native implementations | Medium | The store (`src/stores/player.ts`) stays the single source of truth; the seam is the only place that branches. Volume, the dock visualizer, the equalizer, and subtitle styling meet on the native path (§4). libvlc is the default engine. The webview player remains the fallback when libvlc is not linked or the user turns it on. |
| LGPL bundling scope if plugins ship (Phase 4) | Low | Plugin set review before packaging; the LICENSES boundary is already documented. |

---

## 9. Phase Plan

| Phase | Scope | Effort | Exit criteria |
| --- | --- | --- | --- |
| **0 — Scaffold** (done, verified) | Feature flag, `player.rs` with a real audio-only native half, nine commands, `player_probe` contract, TS seam. Verified against the dev machine's libvlc 3.0.24: `cargo check --features libvlc` compiles clean and a temporary runtime test played a real mp3 (playhead advanced, duration parsed, toggle/volume/stop all correct) | small | §7 Phase 0 criteria; default build unchanged |
| **1 — Audio-only native** (done) | `nativePlayback` settings toggle (Settings → Playback, default off) + PlayerView native routing: `player_load` per audio track, 250 ms `player_position` poll drives the store clock, store-drift detection pushes user seeks into libvlc, end-of-track → next (repeat-one reloads in place), volume/mute mirrored at the native ~125% cap, teardown on mode flip/video switch/unmount, element carries no media in native mode (no double audio), fail-safe toggle-off if libvlc refuses a track. Visualizer stays HTML5-only | medium | §7 Phase 1 criteria; a user can play an mp3 natively with the toggle on and nothing changes with it off |
| **2 — Video surface** (decided: canvas frame pump) | Approach (b) stays. Local video routes through libvlc unless the user has opted into the webview player (or the probe is `'html5'`). libvlc video callbacks (RV32, width capped at 960 px, even dimensions) publish the latest frame through a process-global buffer; a `vlcframe://` custom URI scheme protocol serves self-describing frames `[seq u64 LE][width u32 LE][height u32 LE][rgba…]` (204 = no live frame); the frontend rAF loop fetches and paints a `<canvas>` with seq-skip. Transport, hover chrome, docks, and the subtitle UI stay as DOM overlays. A native window (`set_xwindow` / `set_hwnd` / `set_nsobject`) is a later mode, only if a real file is unwatchable in the app. | large | §3 decision. Lab numbers below: pump ~2.53 ms/frame release; 1080p sample decode-bound at ~14 fps |
| **3 — Subtitles, network, events** (seam, volume, visualizer, equalizer, and subtitle styling done) | `player_load` accepts network MRLs and the player routes them on the libvlc engine; `player://event` (`ended` / `error`) drives next-episode, with the position poll kept as a fallback for files that have a length; audio and subtitle tracks can be listed and selected; one external subtitle file can be added from the subtitle dialog and is selected by libvlc. The audio callback covers 0–200% volume and the dock visualizer. The equalizer uses libvlc's ten ISO bands, and the subtitle profile is passed to freetype (§4). | medium | §7 Phase 3 criteria for RTSP/HLS, track switching, and the end event |
| **4 — Packaging** | Windows DLL+plugins bundling, macOS framework, Linux bundling-or-doc decision, plugin license review, clean-machine acceptance on all three OSes | medium–large | §7 Phase 4 criteria |

Phases 2 and 3 were independent enough to interleave. The video surface is the canvas frame pump; network streams that need a picture use it, and audio streams need no surface.

As of 2026-11-17, libvlc is the default engine for video and music. The webview `<video>` player is optional (`html5Playback`, default false). Phase 1's `nativePlayback` control defaulted off; a stored `false` from that default is not kept as a choice to stay on the webview player.

### Phase 2 prototype outcome (measured)

- **libvlc 3.0 API discovery**: `libvlc_media_player_set_video_callbacks` does not exist in 3.0.24 — that name is VLC 4 (verified against `/usr/include/vlc/libvlc_media_player.h` and `nm -D /usr/lib/libvlc.so`). The 3.0-era installer `libvlc_video_set_callbacks(mp, lock, unlock, display, opaque)` is used instead, declared locally because vlc-rs 0.1.0 does not export it and its `libvlc_video_lock_cb` alias mis-types the `planes` parameter (`*mut c_void` vs the header's `void **`).
- **Temp-test measurements** (test added, run, then removed — same pattern as Phase 0): source `/home/davisville/Videos/Swife Demo.mp4` (1080p → capped 960×544), 2,088,960 bytes/frame; display-callback swizzle+publish cost **2.53 ms/frame release** (pump ceiling ≈ 395 fps) vs **13.09 ms debug**; the rework from a byte-loop to `as_chunks::<4>` + a pre-sized published buffer was a **4.4×** improvement (57.6 ms → 13.09 ms debug).
- **Wall fps is decode-bound, not pump-bound** on the dev box: avcodec logged "more than 5 seconds of late video -> dropping frame (computer too slow ?)" — software decode of the 1080p file cannot sustain real time, so displayed fps tracked the decoder (27.5 fps debug / 13.8 release runs), NOT the pump. The copy is cheap (~2.53 ms/frame release). That is why the old gate (smooth 1080p30 at <25% of one core, or pivot to embedding) is closed: the slow run was software decode, and embedding would drop the DOM overlays this shell exists to keep. Hardware decode and 4K remain the reason a native window could be revisited later.
- **Known prototype gaps** that Phase 3 did not close, and that the audio tap also does not close: hover preview is dead in native mode (it sources from the emptied element). The dock visualizer and the >125% volume cap were closed later by the PCM tap (§4). Network streams route native when the toggle is on (see below). Native subtitles are still libvlc SPU blended into the frame; the dock profile now styles that renderer (§4) instead of painting its own cues.

### Phase 3 outcome

- **Network load.** `classify_media_target` (unit-tested in the default build) sends filesystem paths, including decoded `file://` URLs and Windows drive paths, to `libvlc_media_new_path`, and `http`, `https`, `rtsp`, `rtsps`, `rtmp`, `rtmps`, `mms`, `mmsh`, `rtp`, and `udp` to `libvlc_media_new_location`. Other schemes are rejected. PlayerView uses the same allowlist: a local audio or video id still wins; otherwise `src` or `id` is opened when it is an allowlisted URL. RTSP-family URLs and playlist/video extensions (`m3u8`, `m3u`, `mpd`, and the local video extensions) use the existing frame pump. Other HTTP(S) URLs stay audio-only so a radio stream does not sit under an empty canvas.
- **End and error events.** libvlc's `MediaPlayerEndReached` and `MediaPlayerEncounteredError` callbacks only enqueue a `{ kind, generation }` notice. A process thread emits `player://event`. The callback never calls libvlc or Tauri. `stop()` and the start of `load()` suppress events so libvlc's stop-triggered end does not advance the queue. The webview ignores a notice whose generation is not the one `player_load` just returned. Repeat-one reloads in place; any other end calls `next()`. An error notice opts into the webview player for the session (`html5Playback: true`) and shows a one-line stage notice. The 250 ms poll still seeks and clocks the store, and still advances when `length > 0` and time is within 150 ms of the end, in case the event is missed. Live streams (`length == 0`) advance only from the event.
- **Tracks and external subtitles.** `player_audio_tracks` / `player_spu_tracks` copy libvlc's track-description list (capped at 64) and the current id. The audio dock and the subtitle dock show those lists only while the native toggle is on and the list is non-empty; the HTML5 mock options and the subtitle profile fields stay in place otherwise. Choosing an entry calls `player_set_audio_track` or `player_set_spu`. With the toggle on, the subtitle dialog's file picker is the native open dialog and `player_add_subtitle` turns the path into a `file://` URI (`libvlc_media_slave_type_subtitle`, select = true). libvlc documents that callback output blends sub-pictures on the CPU, so the selected subtitle is painted into the `vlcframe://` picture. Folder and playlist association in that dialog still store no filesystem paths.
- **Phase 2 decision (2026-11-17).** Native video stays on the canvas frame pump: 960 px wide, even dimensions, RV32, latest frame wins, DOM overlays stay. The old gate (smooth 1080p30 at <25% of one core, or pivot to embedding) is closed. A native window (`set_xwindow` / `set_hwnd` / `set_nsobject`) is a later mode, only if a real file is unwatchable in the app. It is not the next slice. See §3.
- **Volume and the visualizer.** Shipped on the audio callback described in §4. PCM is post-volume. libvlc is held at 125 (its amem software gain is cubic, so 100% is unity and 50% is quieter than HTML5). Above 125 the tap applies `percent / 125` and `tanh`. The format on the wire from libvlc is `S16N`, because 3.0.24 amem rejects `FL32`; the ring stores float. `vlcaudio://` chunks play through `GainNode` → `AnalyserNode` → destination. The dock panel uses that analyser while chunks are arriving and keeps the synthetic bars when the tap is silent. The `<video>` element stays empty in native mode. The canvas frame pump was not changed.
- **Equalizer (2026-11-17).** The faders are libvlc's bands (31.25 Hz through 16 kHz) plus preamp. Native playback applies them with `libvlc_media_player_set_equalizer`. The probe in §4 showed that this changes callback PCM, and that preamp +12 dB with flat bands is unity. See §4.
- **Subtitle profile (2026-11-17).** Font, colours, size, outline, background opacity, vertical margin, and delay go through libvlc's freetype renderer and `libvlc_video_set_spu_delay`. A family fontconfig cannot resolve is omitted. See §4.
- **Left unfinished on purpose.**
  - Phase 4 packaging is untouched. It needs a bundling decision plus Windows and macOS libvlc binaries that are not on this machine.
