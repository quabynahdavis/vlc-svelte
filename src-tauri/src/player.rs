//! Feature-flagged native media backend (libvlc) behind a stable IPC seam.
//!
//! Playback in the shell is currently HTML5: TransportBar/PlayerView drive
//! webview `<audio>` / `<video>` elements. Phase 1 wired libvlc into the
//! AUDIO path; Phase 2 (this module's frame pump) adds the video-surface
//! PROTOTYPE: libvlc's video callbacks copy frames into a process-global
//! buffer, a `vlcframe://` custom URI scheme serves them to the webview, and
//! the frontend paints them onto a `<canvas>`. This is deliberately NOT
//! native window embedding (no `libvlc_media_player_set_xwindow`); it exists
//! to be measured before any rendering decision is finalised.
//!
//! Every command below exists in both builds so the frontend contract never
//! changes, but the native half only compiles with `--features libvlc`,
//! which requires system libvlc 3.x dev packages. The default build stays
//! on HTML5 and the commands answer with a descriptive error instead.
//!
//! Command surface (all registered in `main.rs`):
//! - `player_probe`      -> `"html5"` | `"native"` — which half was compiled
//! - `player_load`       (absolute file path; builds the native player)
//! - `player_play` / `player_pause` / `player_toggle` (toggle -> is-playing)
//! - `player_stop`       (tears the native player down)
//! - `player_seek`       (absolute position, seconds)
//! - `player_set_volume` (0–200 percent, clamped by a pure helper)
//! - `player_position`   -> `(time, length)` seconds; vlc-rs reports ms
//!
//! Frame surface (Phase 2):
//! - `vlc_frame_snapshot()` — latest decoded frame for the custom protocol
//!   handler in `main.rs` (`vlcframe://localhost/frame`). Body layout:
//!   `[seq: u64 LE][width: u32 LE][height: u32 LE][rgba bytes...]`.
//!   No live frame -> `204 No Content` with an empty body (chosen over 404:
//!   204 carries no error semantics for the polling loop and needs no body).

#[derive(serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Backend {
    // Only constructed in the HTML5 (default) build; kept in both so the
    // serialized "html5" value is part of the stable IPC contract.
    #[cfg_attr(feature = "libvlc", allow(dead_code))]
    Html5,
    // Only constructed in the feature-enabled build; kept in both so the
    // serialized "native" value is part of the stable IPC contract.
    #[cfg_attr(not(feature = "libvlc"), allow(dead_code))]
    Native,
}

/// Report which backend the shell was compiled with. Always available so the
/// frontend can branch before issuing any native command.
#[tauri::command]
pub fn player_probe() -> Backend {
    #[cfg(feature = "libvlc")]
    {
        Backend::Native
    }
    #[cfg(not(feature = "libvlc"))]
    {
        Backend::Html5
    }
}

/// Clamp a 0–200 percent volume value. Pure helper shared by both cfg halves
/// and unit-tested in the default build.
#[cfg_attr(not(feature = "libvlc"), allow(dead_code))]
pub fn clamp_volume_percent(v: i32) -> i32 {
    v.clamp(0, 200)
}

/// Latest frame rendered by libvlc's video callbacks, as
/// `(width, height, seq, rgba)` — the exact tuple the `vlcframe://` protocol
/// handler in `main.rs` serialises into its 16-byte-header body.
///
/// `None` while no video output is live (audio-only media, before the format
/// callback succeeded, or after a stop/reset). Runs on the protocol thread;
/// cloning the ~2 MB pixel buffer under the published mutex is accepted
/// prototype cost — this is one of the things the measurement session weighs.
#[cfg(feature = "libvlc")]
pub fn vlc_frame_snapshot() -> Option<(u32, u32, u64, Vec<u8>)> {
    native::frame_snapshot()
}

/// Stub half: no native player can exist, so no frame can either.
#[cfg(not(feature = "libvlc"))]
pub fn vlc_frame_snapshot() -> Option<(u32, u32, u64, Vec<u8>)> {
    None
}

// NOTE: compiled only with --features libvlc; requires system libvlc 3.x.
#[cfg(feature = "libvlc")]
mod native {
    use std::cell::UnsafeCell;
    use std::ffi::c_void;
    use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
    use std::sync::{Mutex, OnceLock};
    use std::time::Instant;

    use vlc::ffi;
    use vlc::{Instance, Media, MediaPlayer, MediaPlayerAudioEx};

    /// Process-wide native player: one libvlc instance + media player, plus
    /// the loaded media (vlc-rs 0.1 has no MediaPlayer::get_length, so the
    /// length comes from the media's own duration).
    struct NativePlayer {
        _instance: Instance,
        media_player: MediaPlayer,
        media: Media,
    }

    // SAFETY: libvlc handles (instance/media/media_player) are internally
    // synchronised and documented thread-safe by libvlc itself; vlc-rs 0.1
    // simply does not mark them Send. Handles are only touched under the
    // PLAYER mutex below.
    unsafe impl Send for NativePlayer {}

    /// Global player slot. `Mutex::new(None)` is const-stable since Rust
    /// 1.63, so no lazy init is needed.
    static PLAYER: Mutex<Option<NativePlayer>> = Mutex::new(None);

    // ── Video frame pump (Phase 2 prototype) ──────────────────────────────
    //
    // libvlc's video callbacks (lock/unlock/display) run on ONE video-output
    // thread, serialised lock -> unlock -> display. The plane is only ever
    // dereferenced inside that window, so an UnsafeCell over the buffer is
    // sound. Everything the rest of the process sees (protocol thread, the
    // temp test) flows through the atomics and the published mutex.

    /// The frame as published to the protocol thread. `seq` is bumped once
    /// per displayed frame, so the frontend can skip polls whose frame it
    /// already painted.
    struct PublishedFrame {
        seq: u64,
        width: u32,
        height: u32,
        rgba: Vec<u8>,
    }

    /// Process-global frame state. At most one native player exists at a
    /// time (the PLAYER mutex guarantees it), so a single static slot is
    /// sufficient; the format callback re-initialises it per media.
    struct FrameShared {
        /// Raw RV32 plane, written by libvlc between lock and unlock.
        plane: UnsafeCell<Vec<u8>>,
        width: AtomicU32,
        height: AtomicU32,
        /// Format callback succeeded and frames may flow.
        live: AtomicBool,
        /// Bumped once per displayed frame.
        seq: AtomicU64,
        /// Latest swizzled frame for the protocol thread.
        published: Mutex<PublishedFrame>,
        /// display_cb cost instrumentation: total nanos around the
        /// swizzle+publish body and how many frames it measured.
        display_total_ns: AtomicU64,
        display_count: AtomicU64,
    }

    // SAFETY: `plane` is dereferenced only by libvlc's single video thread
    // between the lock and unlock callbacks, and by the display callback on
    // that same thread (libvlc serialises lock -> unlock -> display); Rust
    // code never touches it outside those callbacks. Every other field is an
    // atomic or a Mutex, which are Sync on their own.
    unsafe impl Sync for FrameShared {}

    /// Frame state slot, initialised on first use. Callbacks must be
    /// panic-free, so every accessor goes through this cheap `get_or_init`.
    static FRAMES: OnceLock<FrameShared> = OnceLock::new();

    fn frames() -> &'static FrameShared {
        FRAMES.get_or_init(|| FrameShared {
            plane: UnsafeCell::new(Vec::new()),
            width: AtomicU32::new(0),
            height: AtomicU32::new(0),
            live: AtomicBool::new(false),
            seq: AtomicU64::new(0),
            published: Mutex::new(PublishedFrame {
                seq: 0,
                width: 0,
                height: 0,
                rgba: Vec::new(),
            }),
            display_total_ns: AtomicU64::new(0),
            display_count: AtomicU64::new(0),
        })
    }

    /// Total nanos spent inside display_cb (swizzle + publish) and how many
    /// frames were measured. Read by the temp probe test only.
    #[cfg_attr(not(test), allow(dead_code))]
    pub fn frame_display_stats() -> (u64, u64) {
        let shared = frames();
        (
            shared.display_total_ns.load(Ordering::Relaxed),
            shared.display_count.load(Ordering::Relaxed),
        )
    }

    /// Gate the frame surface off and forget the last published frame. Used
    /// on every load (a new media must never serve the previous one's
    /// frames) and on stop/teardown, so the protocol handler answers
    /// "no frame" (204) and the frontend stops painting stale content.
    fn reset_frames() {
        let shared = frames();
        shared.live.store(false, Ordering::Release);
        shared.seq.store(0, Ordering::Release);
        if let Ok(mut published) = shared.published.lock() {
            published.seq = 0;
            published.width = 0;
            published.height = 0;
            published.rgba.clear();
        }
    }

    // Installer declarations. Declared locally with type aliases matching the
    // real libvlc headers: vlc-rs's `libvlc_video_lock_cb` alias types the
    // `planes` parameter as `*mut c_void` where the header says `void **`
    // (ABI-compatible, but it rejects correctly-typed callbacks). NOTE:
    // libvlc 3.0 has no `libvlc_media_player_set_video_callbacks` (that name
    // appears only in VLC 4); the 3.0-era installer is
    // `libvlc_video_set_callbacks`, which carries the same three callbacks
    // plus the shared `opaque` pointer.
    type VideoFormatCb = Option<
        unsafe extern "C" fn(
            *mut *mut c_void,
            *mut libc::c_char,
            *mut libc::c_uint,
            *mut libc::c_uint,
            *mut libc::c_uint,
            *mut libc::c_uint,
        ) -> libc::c_uint,
    >;
    type VideoLockCb =
        Option<unsafe extern "C" fn(*mut c_void, *mut *mut c_void) -> *mut c_void>;
    type VideoUnlockCb =
        Option<unsafe extern "C" fn(*mut c_void, *mut c_void, *const *mut c_void)>;
    type VideoDisplayCb = Option<unsafe extern "C" fn(*mut c_void, *mut c_void)>;
    type VideoCleanupCb = Option<unsafe extern "C" fn(*mut c_void)>;

    extern "C" {
        fn libvlc_video_set_format_callbacks(
            mp: *mut ffi::libvlc_media_player_t,
            setup: VideoFormatCb,
            cleanup: VideoCleanupCb,
        );
        fn libvlc_video_set_callbacks(
            mp: *mut ffi::libvlc_media_player_t,
            lock: VideoLockCb,
            unlock: VideoUnlockCb,
            display: VideoDisplayCb,
            opaque: *mut c_void,
        );
    }

    /// Install the video callbacks on a freshly built media player. Safe to
    /// call for audio-only media too — the format callback simply never
    /// fires without a video track. Must run before `play()`.
    fn install_video_callbacks(media_player: &MediaPlayer) {
        // SAFETY: `ptr` is the live libvlc_media_player_t handle owned by
        // `media_player` (vlc-rs 0.1 exposes it as `pub ptr`); libvlc stores
        // the function pointers for the lifetime of the player.
        unsafe {
            libvlc_video_set_format_callbacks(
                media_player.ptr,
                Some(format_cb),
                Some(cleanup_cb),
            );
            libvlc_video_set_callbacks(
                media_player.ptr,
                Some(lock_cb),
                Some(unlock_cb),
                Some(display_cb),
                std::ptr::null_mut(),
            );
        }
    }

    /// Format callback (runs once per format change on libvlc's video
    /// thread). Force RV32, cap the width at 960 preserving aspect with even
    /// dimensions, keep pitch == width*4 exactly (no stride padding — the
    /// swizzle then walks the plane linearly), (re)allocate the plane, and
    /// open the frame gate. Returns the number of picture buffers allocated
    /// (1 on success, 0 = failure).
    extern "C" fn format_cb(
        opaque: *mut *mut c_void,
        chroma: *mut libc::c_char,
        width: *mut libc::c_uint,
        height: *mut libc::c_uint,
        pitches: *mut libc::c_uint,
        lines: *mut libc::c_uint,
    ) -> libc::c_uint {
        // No per-player state is needed (single global frame slot).
        if !opaque.is_null() {
            unsafe { *opaque = std::ptr::null_mut() };
        }
        if chroma.is_null()
            || width.is_null()
            || height.is_null()
            || pitches.is_null()
            || lines.is_null()
        {
            return 0;
        }

        let (orig_w, orig_h) = unsafe { (*width as u32, *height as u32) };
        if orig_w == 0 || orig_h == 0 {
            return 0;
        }

        // Cap width at 960 preserving aspect; integer maths keeps this
        // panic-free (u64 products of ≤ 960*1080 cannot overflow).
        let mut new_w = orig_w;
        let mut new_h = orig_h;
        if new_w > 960 {
            new_h = (((orig_h as u64) * 960 + (orig_w as u64) / 2) / (orig_w as u64)) as u32;
            new_w = 960;
        }
        // Even dimensions only: some decoders/filters assume it.
        new_w &= !1;
        new_h &= !1;
        if new_w == 0 || new_h == 0 {
            return 0;
        }

        let pitch = new_w * 4;
        let size = match (new_h as usize).checked_mul(pitch as usize) {
            Some(size) if size > 0 => size,
            _ => return 0,
        };

        // SAFETY: the out-parameters are libvlc-owned buffers, valid for the
        // duration of this callback; the plane is our UnsafeCell written
        // only on this thread.
        unsafe {
            // Write exactly 4 bytes — libvlc's chroma is a 4-byte
            // identifier, no trailing NUL.
            std::ptr::copy_nonoverlapping(b"RV32".as_ptr(), chroma as *mut u8, 4);
            *width = new_w;
            *height = new_h;
            *pitches = pitch;
            *lines = new_h;
        }

        let shared = frames();
        // try_reserve keeps an allocation failure a clean `return 0` instead
        // of an abort inside an FFI callback. Both buffers are sized here, on
        // the format-change path, so the per-frame display callback never
        // allocates: it swizzles straight into `published`.
        let mut plane = Vec::new();
        if plane.try_reserve_exact(size).is_err() {
            return 0;
        }
        plane.resize(size, 0);
        // SAFETY: format_cb runs on the video thread before any lock call
        // for the new format, so replacing the plane cannot race a reader.
        unsafe { *shared.plane.get() = plane };

        if let Ok(mut published) = shared.published.lock() {
            let mut rgba = Vec::new();
            if rgba.try_reserve_exact(size).is_ok() {
                rgba.resize(size, 0);
                published.rgba = rgba;
            }
            // On failure the display callback's `rgba.len() < expected`
            // guard simply keeps skipping frames; the gate below stays open
            // because the plane itself is fine.
        }

        shared.width.store(new_w, Ordering::Release);
        shared.height.store(new_h, Ordering::Release);
        shared.seq.store(0, Ordering::Release);
        // Re-open the gate only after w/h and the buffers are in place.
        shared.live.store(true, Ordering::Release);
        1
    }

    /// Lock callback (video thread): hand libvlc the plane pointer to decode
    /// into. The private picture id stays null — the plane address is the
    /// only state display_cb needs.
    extern "C" fn lock_cb(opaque: *mut c_void, planes: *mut *mut c_void) -> *mut c_void {
        let _ = opaque;
        if planes.is_null() {
            return std::ptr::null_mut();
        }
        let shared = frames();
        // SAFETY: only libvlc's video thread runs between lock and unlock,
        // and this callback runs on that thread.
        let plane = unsafe { &mut *shared.plane.get() };
        // SAFETY: writing through the libvlc-provided out-pointer.
        unsafe { *planes = plane.as_mut_ptr() as *mut c_void };
        std::ptr::null_mut()
    }

    /// Unlock callback (video thread): nothing to release — libvlc writes
    /// the plane directly and display_cb reads it on the same thread.
    extern "C" fn unlock_cb(opaque: *mut c_void, picture: *mut c_void, planes: *const *mut c_void) {
        let _ = (opaque, picture, planes);
    }

    /// Display callback (video thread): the frame is complete — swizzle
    /// BGRA->RGBA (RV32 is little-endian B,G,R,A; ImageData wants R,G,B,A)
    /// straight into the pre-sized published buffer under its mutex (the
    /// prototype's chosen "published-buffer copy path": zero per-frame
    /// allocation, the mutex hold doubles as the swizzle cost the
    /// instrumentation measures). The whole body is timed with Instant
    /// (panic-free) into the two instrument atomics.
    extern "C" fn display_cb(opaque: *mut c_void, picture: *mut c_void) {
        let _ = (opaque, picture);
        let shared = frames();
        if !shared.live.load(Ordering::Acquire) {
            return;
        }
        let width = shared.width.load(Ordering::Acquire) as usize;
        let height = shared.height.load(Ordering::Acquire) as usize;
        let expected = match (width.checked_mul(height)).and_then(|p| p.checked_mul(4)) {
            Some(expected) if expected > 0 => expected,
            _ => return,
        };

        let started = Instant::now();

        // SAFETY: display_cb runs on the video thread after unlock, so the
        // plane is stable to read here.
        let plane = unsafe { &*shared.plane.get() };
        if plane.len() < expected {
            return;
        }

        // Locking for the whole swizzle: the protocol thread either waits a
        // few ms for a complete frame or gets the previous one — seq makes
        // either outcome correct.
        let Ok(mut published) = shared.published.lock() else {
            return;
        };
        if published.rgba.len() < expected {
            return;
        }

        // as_chunks hands out exactly-sized [u8; 4] references, so the
        // per-lane indices below are provably in-bounds with no panic path.
        let (src_px, _) = plane.as_chunks::<4>();
        let (dst_px, _) = published.rgba.as_chunks_mut::<4>();
        for (dst, src) in dst_px.iter_mut().zip(src_px) {
            dst[0] = src[2];
            dst[1] = src[1];
            dst[2] = src[0];
            // Video frames are opaque; decoders may leave the RV32 alpha
            // lane undefined, so force it rather than risk an invisible
            // canvas.
            dst[3] = 255;
        }

        let next_seq = shared.seq.load(Ordering::Relaxed) + 1;
        published.seq = next_seq;
        published.width = width as u32;
        published.height = height as u32;
        drop(published);
        shared.seq.store(next_seq, Ordering::Release);

        shared
            .display_total_ns
            .fetch_add(started.elapsed().as_nanos() as u64, Ordering::Relaxed);
        shared.display_count.fetch_add(1, Ordering::Relaxed);
    }

    /// Cleanup callback (video thread): the video output is going away.
    extern "C" fn cleanup_cb(opaque: *mut c_void) {
        let _ = opaque;
        let shared = frames();
        shared.live.store(false, Ordering::Release);
        shared.seq.store(0, Ordering::Release);
    }

    /// Snapshot for the `vlcframe://` protocol handler: cloning the
    /// published frame while no video output is live returns None.
    pub fn frame_snapshot() -> Option<(u32, u32, u64, Vec<u8>)> {
        let shared = frames();
        if !shared.live.load(Ordering::Acquire) {
            return None;
        }
        let published = shared.published.lock().ok()?;
        if published.width == 0 || published.rgba.is_empty() {
            return None;
        }
        Some((
            published.width,
            published.height,
            published.seq,
            published.rgba.clone(),
        ))
    }

    /// Run `f` against the loaded player, or fail if nothing was loaded.
    fn with_player<T>(f: impl FnOnce(&NativePlayer) -> T) -> Result<T, String> {
        let guard = PLAYER
            .lock()
            .map_err(|_| "player mutex poisoned".to_string())?;
        let player = guard.as_ref().ok_or("no media loaded")?;
        Ok(f(player))
    }

    pub fn load(path: &str) -> Result<(), String> {
        // A new media must never serve the previous one's frames: gate the
        // frame surface off up front (no PLAYER lock is held here, so this
        // cannot nest with stop()'s reset on the other side).
        reset_frames();

        // Scaffold behaviour: a fresh libvlc instance per load. Instance
        // pooling/reuse is deferred until the rendering decision lands.
        let instance = Instance::new().ok_or("libvlc init failed")?;
        let media = Media::new_path(&instance, path).ok_or("libvlc failed to open media")?;
        let media_player = MediaPlayer::new(&instance).ok_or("libvlc media player init failed")?;
        media_player.set_media(&media);
        // Video callbacks go on every load (audio included — the format
        // callback simply never fires without a video track), before play.
        install_video_callbacks(&media_player);
        media_player
            .play()
            .map_err(|_| "libvlc failed to start playback".to_string())?;

        *PLAYER
            .lock()
            .map_err(|_| "player mutex poisoned".to_string())? = Some(NativePlayer {
            _instance: instance,
            media_player,
            media,
        });
        Ok(())
    }

    pub fn play() -> Result<(), String> {
        let result = with_player(|p| p.media_player.play())?;
        result.map_err(|_| "libvlc failed to start playback".to_string())
    }

    pub fn pause() -> Result<(), String> {
        with_player(|p| p.media_player.pause())?;
        Ok(())
    }

    pub fn toggle() -> Result<bool, String> {
        with_player(|p| {
            if p.media_player.is_playing() {
                p.media_player.pause();
                Ok(false)
            } else {
                p.media_player.play().map(|_| true)
            }
        })?
        .map_err(|_| "libvlc failed to start playback".to_string())
    }

    pub fn stop() -> Result<(), String> {
        let mut guard = PLAYER
            .lock()
            .map_err(|_| "player mutex poisoned".to_string())?;
        if let Some(player) = guard.as_ref() {
            player.media_player.stop();
        }
        // Drop the whole handle set; libvlc_media_player_stop already
        // releases the media, so the slot goes back to "nothing loaded".
        *guard = None;
        drop(guard);
        // Reset the frame surface AFTER releasing the PLAYER mutex: stop()
        // takes PLAYER -> published and load() takes published (reset) ->
        // PLAYER, so they must never nest the other way round.
        reset_frames();
        Ok(())
    }

    pub fn seek(seconds: f64) -> Result<(), String> {
        with_player(|p| p.media_player.set_time((seconds.max(0.0) * 1000.0) as i64))?;
        Ok(())
    }

    pub fn set_volume(percent: i32) -> Result<(), String> {
        let clamped = super::clamp_volume_percent(percent);
        let result = with_player(|p| p.media_player.set_volume(clamped))?;
        result.map_err(|_| "libvlc rejected the volume value".to_string())
    }

    pub fn position() -> Result<(f64, f64), String> {
        with_player(|p| {
            let time = p.media_player.get_time().unwrap_or(0) as f64 / 1000.0;
            let length = p.media.duration().unwrap_or(0) as f64 / 1000.0;
            (time, length)
        })
    }
}

/// Stub half: identical signatures, so the command surface (and the
/// generated handler list) is stable while the native backend is absent.
#[cfg(not(feature = "libvlc"))]
mod native {
    fn unavailable() -> String {
        "native backend not built - rebuild with the `libvlc` cargo feature".to_string()
    }

    pub fn load(_path: &str) -> Result<(), String> {
        Err(unavailable())
    }

    pub fn play() -> Result<(), String> {
        Err(unavailable())
    }

    pub fn pause() -> Result<(), String> {
        Err(unavailable())
    }

    pub fn toggle() -> Result<bool, String> {
        Err(unavailable())
    }

    pub fn stop() -> Result<(), String> {
        Err(unavailable())
    }

    pub fn seek(_seconds: f64) -> Result<(), String> {
        Err(unavailable())
    }

    pub fn set_volume(_percent: i32) -> Result<(), String> {
        Err(unavailable())
    }

    pub fn position() -> Result<(f64, f64), String> {
        Err(unavailable())
    }
}

/// Load a file into the native backend by absolute path. Starts playing on
/// success; the play state afterwards is "playing".
#[tauri::command]
pub fn player_load(path: String) -> Result<(), String> {
    native::load(&path)
}

/// Resume playback of the loaded media.
#[tauri::command]
pub fn player_play() -> Result<(), String> {
    native::play()
}

/// Pause the loaded media.
#[tauri::command]
pub fn player_pause() -> Result<(), String> {
    native::pause()
}

/// Toggle play/pause; answers the new is-playing state.
#[tauri::command]
pub fn player_toggle() -> Result<bool, String> {
    native::toggle()
}

/// Stop and release the native player.
#[tauri::command]
pub fn player_stop() -> Result<(), String> {
    native::stop()
}

/// Seek to an absolute position (seconds from the start).
#[tauri::command]
pub fn player_seek(seconds: f64) -> Result<(), String> {
    native::seek(seconds)
}

/// Set the playback volume, clamped to 0–200 percent by
/// `clamp_volume_percent`.
#[tauri::command]
pub fn player_set_volume(percent: i32) -> Result<(), String> {
    native::set_volume(percent)
}

/// Current `(time, length)` in seconds. Async so the mutex/lock roundtrip
/// never blocks the main thread.
#[tauri::command(async)]
pub fn player_position() -> Result<(f64, f64), String> {
    native::position()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn volume_helper_keeps_in_range_values() {
        assert_eq!(clamp_volume_percent(0), 0);
        assert_eq!(clamp_volume_percent(100), 100);
        assert_eq!(clamp_volume_percent(200), 200);
    }

    #[test]
    fn volume_helper_clamps_out_of_range_values() {
        assert_eq!(clamp_volume_percent(-5), 0);
        assert_eq!(clamp_volume_percent(250), 200);
        assert_eq!(clamp_volume_percent(-999), 0);
        assert_eq!(clamp_volume_percent(999), 200);
    }

    // Default-build guard: with the native half absent the shell must report
    // HTML5 so the frontend keeps its current playback path.
    #[cfg(not(feature = "libvlc"))]
    #[test]
    fn probe_reports_html5_when_feature_is_off() {
        assert!(matches!(player_probe(), Backend::Html5));
    }
}
