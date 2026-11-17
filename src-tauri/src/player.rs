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
//! - `player_load`       (absolute file path or network MRL; builds the native player)
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

/// Where a `player_load` / subtitle argument should be opened.
///
/// Owned so a `file://` URL can be percent-decoded into a filesystem path
/// without borrowing the input. Pure and unit-tested in the default build.
#[derive(Debug, PartialEq, Eq)]
pub enum MediaTarget {
    /// Filesystem path for `libvlc_media_new_path`.
    Path(String),
    /// MRL with an allowlisted scheme for `libvlc_media_new_location`.
    Location(String),
}

const NETWORK_SCHEMES: &[&str] = &[
    "http", "https", "rtsp", "rtsps", "rtmp", "rtmps", "mms", "mmsh", "rtp", "udp",
];

/// Classify a player argument. Absolute and relative paths stay paths so the
/// Phase 1 local-file contract is unchanged. `http`/`https` (HLS and DASH
/// included), `rtsp`, `rtmp`, `mms`, `rtp` and `udp` become locations.
/// `file://` is decoded back into a path. Every other scheme is rejected.
pub fn classify_media_target(input: &str) -> Result<MediaTarget, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("empty media location".to_string());
    }
    if trimmed.bytes().any(|byte| byte < 0x20) {
        return Err("media location contains a control character".to_string());
    }

    let Some((scheme, rest)) = split_scheme(trimmed) else {
        if looks_like_bare_scheme(trimmed) {
            return Err("unsupported media scheme".to_string());
        }
        return Ok(MediaTarget::Path(trimmed.to_string()));
    };
    let scheme = scheme.to_ascii_lowercase();
    if scheme == "file" {
        let path = file_url_to_path(rest)?;
        if path.is_empty() {
            return Err("empty file url".to_string());
        }
        return Ok(MediaTarget::Path(path));
    }
    if !NETWORK_SCHEMES.contains(&scheme.as_str()) {
        return Err(format!("unsupported media scheme: {scheme}"));
    }
    if !network_location_has_host(rest) {
        return Err("network location is missing a host".to_string());
    }
    Ok(MediaTarget::Location(trimmed.to_string()))
}

/// URI libvlc will accept for an external subtitle. Network MRLs pass
/// through; filesystem paths become `file://` URIs.
pub fn subtitle_uri(input: &str) -> Result<String, String> {
    match classify_media_target(input)? {
        MediaTarget::Location(mrl) => Ok(mrl),
        MediaTarget::Path(path) => Ok(file_uri_from_path(&path)),
    }
}

/// `file://` URI for a filesystem path. Spaces and other reserved bytes are
/// percent-encoded; backslashes are normalised to slashes first.
pub fn file_uri_from_path(path: &str) -> String {
    let mut uri = String::from("file://");
    let normalized = path.replace('\\', "/");
    if !normalized.starts_with('/') {
        uri.push('/');
    }
    const HEX: &[u8; 16] = b"0123456789ABCDEF";
    for byte in normalized.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'/' | b'-' | b'_' | b'.' | b'~' => {
                uri.push(byte as char);
            }
            _ => {
                uri.push('%');
                uri.push(HEX[(byte >> 4) as usize] as char);
                uri.push(HEX[(byte & 0x0f) as usize] as char);
            }
        }
    }
    uri
}

/// Split `scheme://rest` when the scheme is a non-empty token of ASCII
/// letters and digits. Windows drive paths (`C:\...`, `C:/...`) are not
/// schemes because they have no `//`.
/// `scheme:something` that is not a Windows drive path (`C:\` or `C:/`).
fn looks_like_bare_scheme(input: &str) -> bool {
    let Some((scheme, rest)) = input.split_once(':') else {
        return false;
    };
    if scheme.len() != 1 || !scheme.bytes().all(|byte| byte.is_ascii_alphabetic()) {
        return scheme.bytes().all(|byte| byte.is_ascii_alphanumeric()) && !rest.is_empty();
    }
    let next = rest.as_bytes().first().copied();
    !matches!(next, Some(b'\\' | b'/'))
}

fn split_scheme(input: &str) -> Option<(&str, &str)> {
    let (scheme, rest) = input.split_once("://")?;
    if scheme.is_empty()
        || !scheme
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'+' || byte == b'.' || byte == b'-')
    {
        return None;
    }
    Some((scheme, rest))
}

fn network_location_has_host(rest: &str) -> bool {
    let host = rest.split(['/', '?', '#']).next().unwrap_or("");
    let host = host.strip_prefix('@').unwrap_or(host);
    let host = host.rsplit_once(':').map(|(name, _port)| name).unwrap_or(host);
    !host.is_empty()
}

fn file_url_to_path(rest: &str) -> Result<String, String> {
    let path = if let Some(stripped) = rest.strip_prefix("localhost") {
        stripped
    } else {
        rest
    };
    percent_decode(path)
}

fn percent_decode(input: &str) -> Result<String, String> {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            if index + 2 >= bytes.len() {
                return Err("bad percent-encoding".to_string());
            }
            let hi = hex_value(bytes[index + 1])?;
            let lo = hex_value(bytes[index + 2])?;
            out.push((hi << 4) | lo);
            index += 3;
        } else {
            out.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(out).map_err(|_| "media path is not utf-8".to_string())
}

fn hex_value(byte: u8) -> Result<u8, String> {
    match byte {
        b'0'..=b'9' => Ok(byte - b'0'),
        b'a'..=b'f' => Ok(byte - b'a' + 10),
        b'A'..=b'F' => Ok(byte - b'A' + 10),
        _ => Err("bad percent-encoding".to_string()),
    }
}

/// One elementary stream the native player can switch to. `id` is the
/// libvlc track id (`-1` is the usual "disable" entry for subtitles).
#[derive(serde::Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NativeTrack {
    pub id: i32,
    pub name: String,
}

/// Track list plus the id libvlc currently has selected. `current` is `-1`
/// when nothing is selected or nothing is loaded.
#[derive(serde::Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NativeTrackList {
    pub tracks: Vec<NativeTrack>,
    pub current: i32,
}

impl NativeTrackList {
    fn empty() -> Self {
        Self {
            tracks: Vec::new(),
            current: -1,
        }
    }
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
    use std::ffi::{c_void, CStr, CString};
    use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
    use std::sync::{Mutex, OnceLock};
    use std::time::Instant;

    use tauri::Emitter;
    use vlc::ffi;
    use vlc::{EventType, Instance, Media, MediaPlayer, MediaPlayerAudioEx};

    /// Process-wide native player: one libvlc instance + media player, plus
    /// the loaded media (vlc-rs 0.1 has no MediaPlayer::get_length, so the
    /// length comes from the media's own duration).
    struct NativePlayer {
        _instance: Instance,
        media_player: MediaPlayer,
        media: Media,
        /// Heap slot whose address is the event callback's user-data.
        /// Moving this struct moves the `Box`, not the `u64`, so detach can
        /// still pass the same pointer after the player is taken out of the
        /// mutex.
        generation_slot: Box<u64>,
    }

    // SAFETY: libvlc handles (instance/media/media_player) are internally
    // synchronised and documented thread-safe by libvlc itself; vlc-rs 0.1
    // simply does not mark them Send. Handles are only touched under the
    // PLAYER mutex below.
    unsafe impl Send for NativePlayer {}

    /// Global player slot. `Mutex::new(None)` is const-stable since Rust
    /// 1.63, so no lazy init is needed.
    static PLAYER: Mutex<Option<NativePlayer>> = Mutex::new(None);

    /// Set around stop/load so a libvlc `EndReached` fired by `stop()` itself
    /// cannot advance the queue. The callback never touches libvlc or the
    /// Tauri runtime; it only enqueues a notice for the pump thread.
    static EVENTS_SUPPRESSED: AtomicBool = AtomicBool::new(true);

    struct PlayerNotice {
        kind: &'static str,
        generation: u64,
    }

    #[derive(Clone, serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct PlayerEventBody {
        kind: &'static str,
        generation: u64,
    }

    static NOTICE_TX: OnceLock<std::sync::mpsc::Sender<PlayerNotice>> = OnceLock::new();

    fn ensure_event_pump(app: &tauri::AppHandle) {
        NOTICE_TX.get_or_init(|| {
            let (tx, rx) = std::sync::mpsc::channel::<PlayerNotice>();
            let app = app.clone();
            // A dropped receiver ends the thread. The sender lives for the
            // process, so this runs until exit.
            let _ = std::thread::Builder::new()
                .name("libvlc-events".to_string())
                .spawn(move || {
                    while let Ok(notice) = rx.recv() {
                        let _ = app.emit(
                            "player://event",
                            PlayerEventBody {
                                kind: notice.kind,
                                generation: notice.generation,
                            },
                        );
                    }
                });
            tx
        });
    }

    /// libvlc callback. Must not call back into libvlc (that deadlocks) and
    /// must not touch the Tauri runtime. Panics are swallowed: unwinding
    /// across FFI is undefined.
    unsafe extern "C" fn on_vlc_event(event: *const ffi::libvlc_event_t, data: *mut c_void) {
        let _ = std::panic::catch_unwind(|| {
            if EVENTS_SUPPRESSED.load(Ordering::Acquire) || event.is_null() || data.is_null() {
                return;
            }
            let kind_code = unsafe { (*event)._type };
            let kind = if kind_code == EventType::MediaPlayerEndReached as i32 {
                "ended"
            } else if kind_code == EventType::MediaPlayerEncounteredError as i32 {
                "error"
            } else {
                return;
            };
            let generation = unsafe { *(data as *const u64) };
            if let Some(tx) = NOTICE_TX.get() {
                let _ = tx.send(PlayerNotice { kind, generation });
            }
        });
    }

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
        // vlc-rs 0.1 does not bind these 3.0 entry points.
        fn libvlc_event_detach(
            manager: *mut ffi::libvlc_event_manager_t,
            event_type: libc::c_int,
            callback: ffi::libvlc_callback_t,
            user_data: *mut c_void,
        );
        fn libvlc_media_player_add_slave(
            mp: *mut ffi::libvlc_media_player_t,
            slave_type: libc::c_int,
            uri: *const libc::c_char,
            select: libc::c_int,
        ) -> libc::c_int;
    }

    fn attach_events(media_player: &MediaPlayer, user_data: *mut c_void) {
        let manager = media_player.event_manager();
        unsafe {
            let _ = ffi::libvlc_event_attach(
                manager.ptr,
                EventType::MediaPlayerEndReached as i32,
                on_vlc_event,
                user_data,
            );
            let _ = ffi::libvlc_event_attach(
                manager.ptr,
                EventType::MediaPlayerEncounteredError as i32,
                on_vlc_event,
                user_data,
            );
        }
    }

    fn detach_events(media_player: &MediaPlayer, user_data: *mut c_void) {
        let manager = media_player.event_manager();
        unsafe {
            libvlc_event_detach(
                manager.ptr,
                EventType::MediaPlayerEndReached as i32,
                on_vlc_event,
                user_data,
            );
            libvlc_event_detach(
                manager.ptr,
                EventType::MediaPlayerEncounteredError as i32,
                on_vlc_event,
                user_data,
            );
        }
    }

    /// Stop and detach the player currently in the slot, if any. Caller must
    /// already be suppressing events. Does not touch the frame surface.
    fn shutdown_locked_player() -> Result<(), String> {
        let mut guard = PLAYER
            .lock()
            .map_err(|_| "player mutex poisoned".to_string())?;
        if let Some(player) = guard.take() {
            let user_data = player.generation_slot.as_ref() as *const u64 as *mut c_void;
            detach_events(&player.media_player, user_data);
            player.media_player.stop();
        }
        Ok(())
    }

    fn collect_tracks(head: *mut ffi::libvlc_track_description_t) -> Vec<super::NativeTrack> {
        let mut tracks = Vec::new();
        let mut current = head;
        // A corrupt list must not walk forever inside a command.
        let mut guard = 0;
        while !current.is_null() && guard < 64 {
            guard += 1;
            let description = unsafe { &*current };
            let name = if description.psz_name.is_null() {
                format!("Track {}", description.i_id)
            } else {
                unsafe { CStr::from_ptr(description.psz_name) }
                    .to_string_lossy()
                    .into_owned()
            };
            tracks.push(super::NativeTrack {
                id: description.i_id,
                name,
            });
            current = description.p_next;
        }
        if !head.is_null() {
            unsafe { ffi::libvlc_track_description_list_release(head) };
        }
        tracks
    }

    fn track_list(head: *mut ffi::libvlc_track_description_t, current: i32) -> super::NativeTrackList {
        super::NativeTrackList {
            tracks: collect_tracks(head),
            current,
        }
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

    pub fn load(app: &tauri::AppHandle, raw: &str) -> Result<u64, String> {
        let target = super::classify_media_target(raw)?;
        // Suppress before tearing the previous player down: libvlc can emit
        // EndReached from stop(), and that must not advance the queue.
        EVENTS_SUPPRESSED.store(true, Ordering::Release);
        shutdown_locked_player()?;
        // Frame reset after the old player is gone, so a late display
        // callback cannot republish the previous picture. No PLAYER lock is
        // held here.
        reset_frames();
        ensure_event_pump(app);

        // A fresh libvlc instance per load. Instance pooling stays deferred
        // until the rendering decision lands.
        let instance = Instance::new().ok_or("libvlc init failed")?;
        let media = match &target {
            super::MediaTarget::Path(path) => {
                Media::new_path(&instance, path).ok_or("libvlc failed to open media")?
            }
            super::MediaTarget::Location(mrl) => {
                Media::new_location(&instance, mrl).ok_or("libvlc failed to open location")?
            }
        };
        let media_player = MediaPlayer::new(&instance).ok_or("libvlc media player init failed")?;
        media_player.set_media(&media);
        // Video callbacks go on every load (audio included — the format
        // callback simply never fires without a video track), before play.
        install_video_callbacks(&media_player);

        let generation = next_generation();
        let generation_slot = Box::new(generation);
        let user_data = generation_slot.as_ref() as *const u64 as *mut c_void;
        attach_events(&media_player, user_data);

        EVENTS_SUPPRESSED.store(false, Ordering::Release);
        if media_player.play().is_err() {
            EVENTS_SUPPRESSED.store(true, Ordering::Release);
            detach_events(&media_player, user_data);
            return Err("libvlc failed to start playback".to_string());
        }

        *PLAYER
            .lock()
            .map_err(|_| "player mutex poisoned".to_string())? = Some(NativePlayer {
            _instance: instance,
            media_player,
            media,
            generation_slot,
        });
        Ok(generation)
    }

    fn next_generation() -> u64 {
        static GENERATION: AtomicU64 = AtomicU64::new(0);
        GENERATION.fetch_add(1, Ordering::AcqRel) + 1
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
        EVENTS_SUPPRESSED.store(true, Ordering::Release);
        shutdown_locked_player()?;
        // Reset the frame surface AFTER releasing the PLAYER mutex: stop()
        // takes PLAYER -> (libvlc) and the display callback takes the
        // published mutex, so those locks must never nest.
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
            // Local files usually know their length on the media. Network
            // VOD (HLS, DASH) often reports it only on the player, and live
            // streams report neither — 0 means "unknown", not "already ended".
            let media_ms = p.media.duration().unwrap_or(0);
            let length_ms = if media_ms > 0 {
                media_ms
            } else {
                let player_ms = unsafe { ffi::libvlc_media_player_get_length(p.media_player.ptr) };
                if player_ms > 0 { player_ms } else { 0 }
            };
            (time, length_ms as f64 / 1000.0)
        })
    }

    pub fn audio_tracks() -> Result<super::NativeTrackList, String> {
        let guard = PLAYER
            .lock()
            .map_err(|_| "player mutex poisoned".to_string())?;
        let Some(player) = guard.as_ref() else {
            return Ok(super::NativeTrackList::empty());
        };
        let head = unsafe { ffi::libvlc_audio_get_track_description(player.media_player.ptr) };
        let current = unsafe { ffi::libvlc_audio_get_track(player.media_player.ptr) };
        Ok(track_list(head, current))
    }

    pub fn set_audio_track(id: i32) -> Result<(), String> {
        let rc = with_player(|player| unsafe {
            ffi::libvlc_audio_set_track(player.media_player.ptr, id)
        })?;
        if rc == 0 {
            Ok(())
        } else {
            Err("libvlc rejected the audio track".to_string())
        }
    }

    pub fn spu_tracks() -> Result<super::NativeTrackList, String> {
        let guard = PLAYER
            .lock()
            .map_err(|_| "player mutex poisoned".to_string())?;
        let Some(player) = guard.as_ref() else {
            return Ok(super::NativeTrackList::empty());
        };
        let head = unsafe { ffi::libvlc_video_get_spu_description(player.media_player.ptr) };
        let current = unsafe { ffi::libvlc_video_get_spu(player.media_player.ptr) };
        Ok(track_list(head, current))
    }

    pub fn set_spu(id: i32) -> Result<(), String> {
        let rc = with_player(|player| unsafe {
            ffi::libvlc_video_set_spu(player.media_player.ptr, id)
        })?;
        if rc == 0 {
            Ok(())
        } else {
            Err("libvlc rejected the subtitle track".to_string())
        }
    }

    /// Attach an external subtitle and select it. `raw` is a filesystem path
    /// or an allowlisted URL; libvlc wants a URI with a scheme.
    pub fn add_subtitle(raw: &str) -> Result<(), String> {
        let uri = super::subtitle_uri(raw)?;
        let c_uri = CString::new(uri).map_err(|_| "subtitle location contains a nul".to_string())?;
        // libvlc_media_slave_type_subtitle == 0. `select` is a C bool; 1
        // asks libvlc to switch to the new track once it is loaded.
        let rc = with_player(|player| unsafe {
            libvlc_media_player_add_slave(player.media_player.ptr, 0, c_uri.as_ptr(), 1)
        })?;
        if rc == 0 {
            Ok(())
        } else {
            Err("libvlc rejected the subtitle".to_string())
        }
    }
}

/// Stub half: identical signatures, so the command surface (and the
/// generated handler list) is stable while the native backend is absent.
#[cfg(not(feature = "libvlc"))]
mod native {
    fn unavailable() -> String {
        "native backend not built - rebuild with the `libvlc` cargo feature".to_string()
    }

    pub fn load(_app: &tauri::AppHandle, path: &str) -> Result<u64, String> {
        // Reject a bad location even when libvlc is not linked, so the
        // classification helpers stay part of the default build.
        super::classify_media_target(path)?;
        Err(unavailable())
    }

    pub fn audio_tracks() -> Result<super::NativeTrackList, String> {
        Ok(super::NativeTrackList::empty())
    }

    pub fn set_audio_track(_id: i32) -> Result<(), String> {
        Err(unavailable())
    }

    pub fn spu_tracks() -> Result<super::NativeTrackList, String> {
        Ok(super::NativeTrackList::empty())
    }

    pub fn set_spu(_id: i32) -> Result<(), String> {
        Err(unavailable())
    }

    pub fn add_subtitle(path: &str) -> Result<(), String> {
        let _ = super::subtitle_uri(path)?;
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

/// Load a filesystem path or an allowlisted network MRL into the native
/// backend. Starts playing on success and returns the generation stamped on
/// that media's end/error events.
#[tauri::command]
pub fn player_load(app: tauri::AppHandle, path: String) -> Result<u64, String> {
    native::load(&app, &path)
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
/// never blocks the main thread. `length` is `0` when the media has no
/// known duration (typical of live streams).
#[tauri::command(async)]
pub fn player_position() -> Result<(f64, f64), String> {
    native::position()
}

/// Audio tracks of the loaded media, plus the selected id. Empty when
/// nothing is loaded (tracks often appear only after playback has opened).
#[tauri::command]
pub fn player_audio_tracks() -> Result<NativeTrackList, String> {
    native::audio_tracks()
}

/// Select an audio track by libvlc id.
#[tauri::command]
pub fn player_set_audio_track(id: i32) -> Result<(), String> {
    native::set_audio_track(id)
}

/// Subtitle (SPU) tracks of the loaded media, plus the selected id.
/// `-1` is libvlc's disable entry when it offers one.
#[tauri::command]
pub fn player_spu_tracks() -> Result<NativeTrackList, String> {
    native::spu_tracks()
}

/// Select a subtitle track by libvlc id. Pass `-1` to disable.
#[tauri::command]
pub fn player_set_spu(id: i32) -> Result<(), String> {
    native::set_spu(id)
}

/// Add an external subtitle (path or URL) and select it. libvlc blends SPU
/// into the callback picture on this build; profile styling is not applied.
#[tauri::command]
pub fn player_add_subtitle(path: String) -> Result<(), String> {
    native::add_subtitle(&path)
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

    #[test]
    fn local_paths_stay_paths() {
        assert_eq!(
            classify_media_target("/home/davisville/Music/a.mp3").unwrap(),
            MediaTarget::Path("/home/davisville/Music/a.mp3".to_string())
        );
        assert_eq!(
            classify_media_target(r"C:\Videos\clip.mkv").unwrap(),
            MediaTarget::Path(r"C:\Videos\clip.mkv".to_string())
        );
    }

    #[test]
    fn network_mrls_stay_locations() {
        let hls = "https://cdn.example/live/index.m3u8";
        assert_eq!(
            classify_media_target(hls).unwrap(),
            MediaTarget::Location(hls.to_string())
        );
        let rtsp = "rtsp://camera.local/stream";
        assert_eq!(
            classify_media_target(rtsp).unwrap(),
            MediaTarget::Location(rtsp.to_string())
        );
        assert_eq!(
            classify_media_target("udp://@239.1.1.1:5000").unwrap(),
            MediaTarget::Location("udp://@239.1.1.1:5000".to_string())
        );
    }

    #[test]
    fn file_urls_decode_to_paths() {
        assert_eq!(
            classify_media_target("file:///tmp/my%20clip.mp4").unwrap(),
            MediaTarget::Path("/tmp/my clip.mp4".to_string())
        );
        assert_eq!(
            classify_media_target("file://localhost/tmp/a.mp3").unwrap(),
            MediaTarget::Path("/tmp/a.mp3".to_string())
        );
    }

    #[test]
    fn unsupported_schemes_and_empty_input_are_rejected() {
        assert!(classify_media_target("").is_err());
        assert!(classify_media_target("   ").is_err());
        assert!(classify_media_target("javascript:alert(1)").is_err());
        assert!(classify_media_target("http://").is_err());
        assert!(classify_media_target("https:///no-host").is_err());
    }

    #[test]
    fn subtitle_paths_become_file_uris() {
        assert_eq!(
            subtitle_uri("/tmp/my clip.srt").unwrap(),
            "file:///tmp/my%20clip.srt"
        );
        assert_eq!(
            subtitle_uri("https://cdn.example/sub.vtt").unwrap(),
            "https://cdn.example/sub.vtt"
        );
    }
}
