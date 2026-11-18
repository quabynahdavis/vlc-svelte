//! Feature-flagged native media backend (libvlc) behind a stable IPC seam.
//!
//! libvlc is the default engine. The `libvlc` Cargo feature is on by
//! default, so `cargo build` and `tauri dev` link it. The webview `<video>`
//! player is the fallback: `cargo check --no-default-features` builds that
//! binary with no libvlc linked, and `player_probe` returns `"html5"`.
//! The frontend also uses the webview player when the user opts in.
//!
//! Video frames: libvlc's video callbacks copy frames into a process-global
//! buffer, a `vlcframe://` custom URI scheme serves them to the webview, and
//! the frontend paints them onto a `<canvas>`. This is deliberately NOT
//! native window embedding (no `libvlc_media_player_set_xwindow`).
//!
//! Every command below exists in both builds so the frontend contract never
//! changes. The native half compiles with the `libvlc` feature, which
//! requires system libvlc 3.x dev packages. Without that feature the
//! commands answer with a descriptive error instead.
//!
//! Command surface (all registered in `main.rs`):
//! - `player_probe`      -> `"html5"` | `"native"` — which half was compiled
//! - `player_load`       (absolute file path or network MRL; builds the native player)
//! - `player_play` / `player_pause` / `player_toggle` (toggle -> is-playing)
//! - `player_stop`       (tears the native player down)
//! - `player_seek`       (absolute position, seconds)
//! - `player_set_volume` (0–200 percent, clamped by a pure helper)
//! - `player_set_equalizer` (preamp + 10 ISO band gains, or off)
//! - `player_set_subtitle_profile` (freetype style + SPU delay)
//! - `player_position`   -> `(time, length)` seconds; vlc-rs reports ms
//!
//! Frame surface (Phase 2):
//! - `vlc_frame_snapshot()` — latest decoded frame for the custom protocol
//!   handler in `main.rs` (`vlcframe://localhost/frame`). Body layout:
//!   `[seq: u64 LE][width: u32 LE][height: u32 LE][rgba bytes...]`.
//!   No live frame -> `204 No Content` with an empty body (chosen over 404:
//!   204 carries no error semantics for the polling loop and needs no body).
//!
//! Audio tap: `libvlc_audio_set_callbacks` replaces the normal output, so the
//! play callback copies S16N PCM into a short ring and `vlcaudio://` serves
//! small chunks to the webview. The webview is what makes the samples audible.

#[derive(serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Backend {
    // Only constructed when the `libvlc` feature is off (`--no-default-features`).
    // Kept in both builds so the serialized "html5" value is part of the IPC contract.
    #[cfg_attr(feature = "libvlc", allow(dead_code))]
    Html5,
    // Constructed in the default build, which enables `libvlc`. Kept in both
    // builds so the serialized "native" value is part of the IPC contract.
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

/// Percent passed to `libvlc_audio_set_volume`.
///
/// The audio callback receives post-volume PCM. libvlc 3.0.24's amem output
/// applies that in software (`SoftVolumeSet` cubes the linear gain, so 100%
/// is still unity) and this helper never asks it for more than 125. Mute is
/// silence.
#[cfg_attr(not(feature = "libvlc"), allow(dead_code))]
pub fn libvlc_volume_percent(percent: i32, muted: bool) -> i32 {
    if muted {
        return 0;
    }
    clamp_volume_percent(percent).min(125)
}

/// Extra linear gain on top of libvlc's post-volume samples.
///
/// 0 and mute are silence. 1–125 stay at 1 (libvlc already applied them, and
/// 100% must stay unity). Above 125 the factor is `percent / 125`.
#[cfg_attr(not(feature = "libvlc"), allow(dead_code))]
pub fn native_pcm_gain(percent: i32, muted: bool) -> f32 {
    if muted {
        return 0.0;
    }
    let percent = clamp_volume_percent(percent);
    if percent == 0 {
        return 0.0;
    }
    if percent <= 125 {
        return 1.0;
    }
    percent as f32 / 125.0
}

/// Shape one sample before it is played.
///
/// Unity gain returns the sample unchanged. Any other positive gain is
/// `tanh`, which approaches ±1 and does not hard-clamp.
#[cfg_attr(not(feature = "libvlc"), allow(dead_code))]
pub fn shape_native_sample(sample: f32, gain: f32) -> f32 {
    if !sample.is_finite() || gain <= 0.0 {
        return 0.0;
    }
    if gain == 1.0 {
        return sample;
    }
    (sample * gain).tanh()
}

/// libvlc 3.0.24 `libvlc_audio_equalizer_get_band_count`.
pub const NATIVE_EQ_BANDS: usize = 10;

/// Clamp one equalizer fader to libvlc's −20..+20 dB range.
/// Non-finite values become 0 dB, which adds nothing on that band.
#[cfg_attr(not(feature = "libvlc"), allow(dead_code))]
pub fn clamp_eq_db(value: f64) -> f32 {
    if !value.is_finite() {
        return 0.0;
    }
    value.clamp(-20.0, 20.0) as f32
}

/// Active subtitle profile, matching `subtitleProfiles` plus the live delay.
///
/// Delay is seconds (−10..+10). Colours are `#RRGGBB`. `size_mode` is
/// `relative` (percent) or `exact` (pixels).
#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleProfileArgs {
    pub font: String,
    pub text_color: String,
    pub outline_color: String,
    pub size_mode: String,
    pub size: f64,
    pub outline_width: f64,
    pub background_opacity: f64,
    pub vertical_position: String,
    pub delay: f64,
}

impl Default for SubtitleProfileArgs {
    fn default() -> Self {
        Self {
            font: "Inter".to_string(),
            text_color: "#B8B8B8".to_string(),
            outline_color: "#0E0E0E".to_string(),
            size_mode: "relative".to_string(),
            size: 100.0,
            outline_width: 1.5,
            background_opacity: 25.0,
            vertical_position: "bottom".to_string(),
            delay: 0.0,
        }
    }
}

/// Values libvlc's freetype renderer and SPU delay actually consume.
#[cfg_attr(not(feature = "libvlc"), allow(dead_code))]
#[derive(Clone, Debug, PartialEq)]
pub struct SubtitleStyle {
    /// `None` omits `--freetype-font` so libvlc keeps its own default face.
    pub font: Option<String>,
    pub text_color: u32,
    pub outline_color: u32,
    pub outline_opacity: i32,
    pub fontsize_px: i32,
    pub text_scale: i32,
    pub outline_thickness: i32,
    pub background_opacity: i32,
    /// `sub-margin` in pixels. libvlc subtracts this from the subtitle y,
    /// so a larger value sits higher on the frame.
    pub margin: i32,
    pub delay_us: i64,
}

impl SubtitleStyle {
    /// Command-line options for `libvlc_new`. Text renderer options have to
    /// be set there; media options do not reach freetype.
    #[cfg_attr(not(feature = "libvlc"), allow(dead_code))]
    pub fn libvlc_args(&self) -> Vec<String> {
        let mut args = Vec::with_capacity(12);
        if let Some(font) = &self.font {
            args.push(format!("--freetype-font={font}"));
        }
        args.push(format!("--freetype-fontsize={}", self.fontsize_px));
        args.push("--freetype-opacity=255".to_string());
        args.push(format!("--freetype-color={}", self.text_color));
        args.push(format!(
            "--freetype-outline-opacity={}",
            self.outline_opacity
        ));
        args.push(format!("--freetype-outline-color={}", self.outline_color));
        args.push(format!(
            "--freetype-outline-thickness={}",
            self.outline_thickness
        ));
        args.push(format!(
            "--freetype-background-opacity={}",
            self.background_opacity
        ));
        args.push("--freetype-background-color=0".to_string());
        args.push(format!("--sub-text-scale={}", self.text_scale));
        args.push(format!("--sub-margin={}", self.margin));
        args
    }
}

#[cfg_attr(not(feature = "libvlc"), allow(dead_code))]
fn finite_or(value: f64, fallback: f64) -> f64 {
    if value.is_finite() {
        value
    } else {
        fallback
    }
}

#[cfg_attr(not(feature = "libvlc"), allow(dead_code))]
fn parse_rrggbb(value: &str, fallback: u32) -> u32 {
    let hex = value.trim().trim_start_matches('#');
    if hex.len() != 6 || !hex.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return fallback;
    }
    u32::from_str_radix(hex, 16).unwrap_or(fallback) & 0x00FF_FFFF
}

#[cfg_attr(not(feature = "libvlc"), allow(dead_code))]
fn usable_font_family(family: &str, available: bool) -> Option<String> {
    if !available {
        return None;
    }
    let trimmed = family.trim();
    if trimmed.is_empty() || trimmed.len() > 80 {
        return None;
    }
    if trimmed
        .chars()
        .any(|ch| ch.is_control() || matches!(ch, '"' | '\\' | '=' | ':'))
    {
        return None;
    }
    Some(trimmed.to_string())
}

/// Map a profile onto libvlc. `font_available` is a fontconfig answer for
/// `profile.font`; a miss drops the family so playback keeps libvlc's face.
#[cfg_attr(not(feature = "libvlc"), allow(dead_code))]
pub fn subtitle_style(profile: &SubtitleProfileArgs, font_available: bool) -> SubtitleStyle {
    let exact = profile.size_mode == "exact";
    let size = finite_or(profile.size, if exact { 24.0 } else { 100.0 });
    let fontsize_px = if exact {
        size.clamp(12.0, 72.0).round() as i32
    } else {
        0
    };
    let text_scale = if exact {
        100
    } else {
        size.clamp(50.0, 200.0).round() as i32
    };
    let outline_thickness = finite_or(profile.outline_width, 1.5).clamp(0.0, 4.0).round() as i32;
    let background = finite_or(profile.background_opacity, 25.0).clamp(0.0, 100.0);
    let margin = match profile.vertical_position.as_str() {
        "lower-middle" => 72,
        "middle" => 180,
        "top" => 360,
        _ => 0,
    };
    let delay = finite_or(profile.delay, 0.0).clamp(-10.0, 10.0);
    SubtitleStyle {
        font: usable_font_family(&profile.font, font_available),
        text_color: parse_rrggbb(&profile.text_color, 0x00B8_B8B8),
        outline_color: parse_rrggbb(&profile.outline_color, 0x000E_0E0E),
        outline_opacity: if outline_thickness > 0 { 255 } else { 0 },
        fontsize_px,
        text_scale,
        outline_thickness,
        background_opacity: (background * 255.0 / 100.0).round() as i32,
        margin,
        delay_us: (delay * 1_000_000.0).round() as i64,
    }
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
/// `file://` is decoded back into a path. Tauri asset URLs (`asset://` and
/// `http://asset.localhost/...`, including `https`) are percent-decoded to a
/// filesystem path for `libvlc_media_new_path` and are not opened as HTTP.
/// Every other scheme is rejected.
pub fn classify_media_target(input: &str) -> Result<MediaTarget, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("empty media location".to_string());
    }
    if trimmed.bytes().any(|byte| byte < 0x20) {
        return Err("media location contains a control character".to_string());
    }

    // Watch keys are `path:asset://localhost/…:native`. The embedded asset
    // URL must not be opened; the path in front of it is the file.
    if let Some(path) = embedded_file_path(trimmed) {
        return Ok(MediaTarget::Path(path));
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
    if scheme == "asset" || is_asset_localhost(&scheme, rest) {
        return Ok(MediaTarget::Path(asset_url_to_path(rest)?));
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

/// `path:asset://…` or `path:http://asset.localhost/…` → `path`, when `path`
/// is an absolute media file. Network MRLs have no such prefix.
fn embedded_file_path(input: &str) -> Option<String> {
    let marker = input.find("://")?;
    let head = &input[..marker];
    let scheme_at = head.rfind(':')?;
    let prefix = &input[..scheme_at];
    if !is_local_media_path(prefix) {
        return None;
    }
    Some(prefix.to_string())
}

fn is_local_media_path(path: &str) -> bool {
    let absolute = path.starts_with('/')
        || (path.len() > 2
            && path.as_bytes()[0].is_ascii_alphabetic()
            && path.as_bytes()[1] == b':');
    if !absolute {
        return false;
    }
    let ext = std::path::Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase());
    matches!(
        ext.as_deref(),
        Some(
            "mp4" | "m4v" | "mkv" | "webm" | "mov" | "avi" | "wmv" | "mpg" | "mpeg" | "ts"
                | "ogv" | "mp3" | "flac" | "ogg" | "oga" | "wav" | "aac" | "m4a" | "wma"
                | "opus" | "ape" | "aiff" | "aif" | "alac" | "mka"
        )
    )
}

/// Refuse directories, missing paths, and zero-byte files before libvlc opens
/// them. An empty file is what produces `cache_read` / `mjpeg cannot peek`.
pub fn ensure_playable_file(path: &str) -> Result<(), String> {
    let meta = std::fs::metadata(path).map_err(|_| "media file is not readable".to_string())?;
    if !meta.is_file() {
        return Err("media path is not a file".to_string());
    }
    if meta.len() == 0 {
        return Err("media file is empty".to_string());
    }
    Ok(())
}

fn file_url_to_path(rest: &str) -> Result<String, String> {
    let path = if let Some(stripped) = rest.strip_prefix("localhost") {
        stripped
    } else {
        rest
    };
    percent_decode(path)
}

/// `http://asset.localhost` and `https://asset.localhost` (optional port).
fn is_asset_localhost(scheme: &str, rest: &str) -> bool {
    if scheme != "http" && scheme != "https" {
        return false;
    }
    let authority = rest.split(['/', '?', '#']).next().unwrap_or("");
    let host = authority
        .rsplit_once('@')
        .map(|(_, host)| host)
        .unwrap_or(authority);
    let host = match host.rsplit_once(':') {
        Some((name, port))
            if !name.is_empty() && port.bytes().all(|byte| byte.is_ascii_digit()) =>
        {
            name
        }
        _ => host,
    };
    host.eq_ignore_ascii_case("asset.localhost")
}

/// Filesystem path inside a Tauri `convertFileSrc` URL.
///
/// The absolute path is percent-encoded after one slash that is not part of
/// the path (`asset://localhost/%2Ftmp%2Fa.mp4`,
/// `http://asset.localhost/C%3A%5Cclip.mkv`). That slash is skipped, matching
/// the asset protocol handler, then the remainder is decoded.
fn asset_url_to_path(rest: &str) -> Result<String, String> {
    let without_suffix = rest.split(['?', '#']).next().unwrap_or(rest);
    let encoded = without_suffix
        .split_once('/')
        .map(|(_, path)| path)
        .unwrap_or("");
    let path = percent_decode(encoded)?;
    if path.is_empty() {
        return Err("empty asset url".to_string());
    }
    Ok(path)
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

/// One chunk of interleaved float PCM pulled off the native ring.
///
/// Body layout for `vlcaudio://localhost/pcm` (little-endian):
/// `[seq: u64][generation: u32][rate: u32][channels: u32][frames: u32][f32...]`.
/// `generation` changes on flush, seek, stop, and track change so the webview
/// can drop audio it already scheduled. `frames` is per channel.
pub struct NativePcmChunk {
    pub seq: u64,
    pub generation: u32,
    pub rate: u32,
    pub channels: u32,
    pub frames: u32,
    pub samples: Vec<f32>,
}

/// Latest unread PCM, up to ~20 ms. `None` when native audio is idle or the
/// ring has nothing new — the protocol answers `204` in that case.
#[cfg(feature = "libvlc")]
pub fn vlc_pcm_snapshot() -> Option<NativePcmChunk> {
    native::pcm_snapshot()
}

#[cfg(not(feature = "libvlc"))]
pub fn vlc_pcm_snapshot() -> Option<NativePcmChunk> {
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
    /// thread). Force RV32 at the decoder's own width and height. Resizing
    /// here makes swscale fail with "Failed to create video converter", so
    /// the canvas scales the full frame. Pitch stays width*4 (no stride
    /// padding — the swizzle walks the plane linearly). Returns the number
    /// of picture buffers allocated (1 on success, 0 = failure).
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

        let (new_w, new_h) = unsafe { (*width as u32, *height as u32) };
        if new_w == 0 || new_h == 0 {
            return 0;
        }

        let pitch = new_w.saturating_mul(4);
        let size = match (new_h as usize).checked_mul(pitch as usize) {
            Some(size) if size > 0 => size,
            _ => return 0,
        };

        // SAFETY: the out-parameters are libvlc-owned buffers, valid for the
        // duration of this callback; the plane is our UnsafeCell written
        // only on this thread.
        unsafe {
            // Fourcc plus the NUL libvlc's 5-byte chroma buffer already
            // reserves. A missing NUL makes the converter reject RV32.
            std::ptr::copy_nonoverlapping(b"RV32\0".as_ptr(), chroma as *mut u8, 5);
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

    // ── Audio tap ─────────────────────────────────────────────────────────
    //
    // `libvlc_audio_set_callbacks` replaces the default output. The play
    // callback only copies into the ring below. A `vlcaudio://` poll (not
    // this callback) hands small chunks to the webview, which is what plays
    // them. libvlc 3.0.24's amem plugin accepts only "S16N" (its setup path
    // rejects FL32 and then produces no audio), so the callback converts
    // native-endian s16 to f32 while copying. No libvlc or Tauri calls, and
    // no allocation, on that thread.

    /// 48 kHz stereo, negotiated in the setup callback.
    const PCM_RATE: u32 = 48_000;
    const PCM_CHANNELS: usize = 2;
    /// 16384 interleaved floats ≈ 171 ms at 48 kHz stereo. Power of two.
    const PCM_CAP: usize = 16_384;
    /// ~20 ms at 48 kHz. One protocol response.
    const PCM_CHUNK_FRAMES: usize = 960;

    struct PcmState {
        /// Pre-sized on the command thread. The play callback never grows it.
        samples: Vec<f32>,
        write: u32,
        read: u32,
        live: bool,
        generation: u32,
        seq: u64,
    }

    static PCM: Mutex<PcmState> = Mutex::new(PcmState {
        samples: Vec::new(),
        write: 0,
        read: 0,
        live: false,
        generation: 0,
        seq: 0,
    });

    /// UI volume, 0–200. The play callback does not read this. 100 matches
    /// libvlc's default until the frontend pushes the store value.
    static PCM_VOLUME: AtomicU32 = AtomicU32::new(100);

    fn pcm_lock() -> std::sync::MutexGuard<'static, PcmState> {
        PCM.lock().unwrap_or_else(|err| err.into_inner())
    }

    /// Allocate the ring on the command thread and open the gate. Safe to
    /// call again: a second call drops whatever the previous media left.
    fn prepare_pcm() {
        let mut pcm = pcm_lock();
        if pcm.samples.len() != PCM_CAP {
            pcm.samples = vec![0.0; PCM_CAP];
        }
        pcm.read = 0;
        pcm.write = 0;
        pcm.live = true;
        pcm.generation = pcm.generation.wrapping_add(1);
    }

    fn mark_pcm_live() {
        let mut pcm = pcm_lock();
        if pcm.samples.len() != PCM_CAP {
            return;
        }
        pcm.read = pcm.write;
        pcm.live = true;
        pcm.generation = pcm.generation.wrapping_add(1);
    }

    fn flush_pcm() {
        let mut pcm = pcm_lock();
        pcm.read = pcm.write;
        pcm.generation = pcm.generation.wrapping_add(1);
    }

    fn reset_pcm() {
        let mut pcm = pcm_lock();
        pcm.live = false;
        pcm.read = pcm.write;
        pcm.generation = pcm.generation.wrapping_add(1);
    }

    /// Copy native-endian S16N bytes into the ring as f32 in [-1, 1). If the
    /// webview has fallen behind, the oldest unread samples are dropped so
    /// the ring stays inside `PCM_CAP`.
    fn push_s16_bytes(bytes: &[u8]) {
        let mut pcm = pcm_lock();
        if !pcm.live || pcm.samples.len() != PCM_CAP {
            return;
        }
        let total = bytes.len() / 2;
        if total == 0 {
            return;
        }
        let (bytes, total) = if total > PCM_CAP {
            let skip = (total - PCM_CAP) * 2;
            (&bytes[skip..], PCM_CAP)
        } else {
            (bytes, total)
        };
        let occupied = pcm.write.wrapping_sub(pcm.read) as usize;
        let overflow = occupied.saturating_add(total).saturating_sub(PCM_CAP);
        if overflow > 0 {
            pcm.read = pcm.read.wrapping_add(overflow as u32);
        }
        let mut offset = 0;
        while offset + 1 < bytes.len() {
            let sample = i16::from_ne_bytes([bytes[offset], bytes[offset + 1]]);
            let index = (pcm.write as usize) & (PCM_CAP - 1);
            pcm.samples[index] = f32::from(sample) * (1.0 / 32768.0);
            pcm.write = pcm.write.wrapping_add(1);
            offset += 2;
        }
    }

    pub fn pcm_snapshot() -> Option<super::NativePcmChunk> {
        let mut pcm = pcm_lock();
        if !pcm.live || pcm.samples.len() != PCM_CAP {
            return None;
        }
        let occupied = pcm.write.wrapping_sub(pcm.read) as usize;
        let frames_available = occupied / PCM_CHANNELS;
        if frames_available == 0 {
            return None;
        }
        let frames = frames_available.min(PCM_CHUNK_FRAMES);
        let count = frames * PCM_CHANNELS;
        let gain = super::native_pcm_gain(PCM_VOLUME.load(Ordering::Acquire) as i32, false);
        let mut samples = Vec::with_capacity(count);
        for _ in 0..count {
            let index = (pcm.read as usize) & (PCM_CAP - 1);
            samples.push(super::shape_native_sample(pcm.samples[index], gain));
            pcm.read = pcm.read.wrapping_add(1);
        }
        pcm.seq = pcm.seq.wrapping_add(1);
        Some(super::NativePcmChunk {
            seq: pcm.seq,
            generation: pcm.generation,
            rate: PCM_RATE,
            channels: PCM_CHANNELS as u32,
            frames: frames as u32,
            samples,
        })
    }

    type AudioSetupCb = Option<
        unsafe extern "C" fn(
            *mut *mut c_void,
            *mut libc::c_char,
            *mut libc::c_uint,
            *mut libc::c_uint,
        ) -> libc::c_int,
    >;
    type AudioCleanupCb = Option<unsafe extern "C" fn(*mut c_void)>;

    extern "C" {
        // Local declaration: vlc-rs 0.1's `libvlc_audio_setup_cb` alias drops
        // the `int` return, so a correctly-typed setup callback will not coerce.
        fn libvlc_audio_set_format_callbacks(
            mp: *mut ffi::libvlc_media_player_t,
            setup: AudioSetupCb,
            cleanup: AudioCleanupCb,
        );
    }

    fn install_audio_callbacks(media_player: &MediaPlayer) {
        prepare_pcm();
        unsafe {
            ffi::libvlc_audio_set_callbacks(
                media_player.ptr,
                Some(audio_play),
                Some(audio_pause),
                Some(audio_resume),
                Some(audio_flush),
                Some(audio_drain),
                std::ptr::null_mut(),
            );
            libvlc_audio_set_format_callbacks(
                media_player.ptr,
                Some(audio_setup),
                Some(audio_cleanup),
            );
        }
    }

    /// Ask amem for stereo 48 kHz S16N. Returning non-zero skips audio.
    extern "C" fn audio_setup(
        opaque: *mut *mut c_void,
        format: *mut libc::c_char,
        rate: *mut libc::c_uint,
        channels: *mut libc::c_uint,
    ) -> libc::c_int {
        std::panic::catch_unwind(|| {
            if !opaque.is_null() {
                unsafe { *opaque = std::ptr::null_mut() };
            }
            if format.is_null() || rate.is_null() || channels.is_null() {
                return -1;
            }
            // Exactly four bytes. amem's `char format[5]` keeps the NUL.
            unsafe {
                std::ptr::copy_nonoverlapping(b"S16N".as_ptr(), format as *mut u8, 4);
                *rate = PCM_RATE;
                *channels = PCM_CHANNELS as libc::c_uint;
            }
            mark_pcm_live();
            0
        })
        .unwrap_or(-1)
    }

    extern "C" fn audio_cleanup(opaque: *mut c_void) {
        let _ = std::panic::catch_unwind(|| {
            let _ = opaque;
            reset_pcm();
        });
    }

    extern "C" fn audio_play(
        data: *mut c_void,
        samples: *const c_void,
        count: libc::c_uint,
        pts: i64,
    ) {
        let _ = std::panic::catch_unwind(|| {
            let _ = (data, pts);
            if samples.is_null() || count == 0 {
                return;
            }
            let frames = count as usize;
            let Some(sample_count) = frames.checked_mul(PCM_CHANNELS) else {
                return;
            };
            let Some(nbytes) = sample_count.checked_mul(2) else {
                return;
            };
            if nbytes == 0 {
                return;
            }
            // SAFETY: libvlc passes `count` frames of the format negotiated
            // in `audio_setup` (S16N, stereo) and keeps them alive for this
            // call. The byte view does not require i16 alignment.
            let bytes = unsafe { std::slice::from_raw_parts(samples as *const u8, nbytes) };
            push_s16_bytes(bytes);
        });
    }

    extern "C" fn audio_pause(data: *mut c_void, pts: i64) {
        let _ = std::panic::catch_unwind(|| {
            let _ = (data, pts);
            flush_pcm();
        });
    }

    extern "C" fn audio_resume(data: *mut c_void, pts: i64) {
        let _ = (data, pts);
    }

    extern "C" fn audio_flush(data: *mut c_void, pts: i64) {
        let _ = std::panic::catch_unwind(|| {
            let _ = (data, pts);
            flush_pcm();
        });
    }

    extern "C" fn audio_drain(data: *mut c_void) {
        let _ = data;
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
        if let super::MediaTarget::Path(path) = &target {
            // Directories, missing paths, and empty files never reach libvlc.
            // An empty open is the `cache_read` / `mjpeg cannot peek` pair.
            super::ensure_playable_file(path)?;
        }
        // Suppress before tearing the previous player down: libvlc can emit
        // EndReached from stop(), and that must not advance the queue.
        EVENTS_SUPPRESSED.store(true, Ordering::Release);
        shutdown_locked_player()?;
        // Frame and PCM resets after the old player is gone, so a late
        // callback cannot republish the previous media. No PLAYER lock is
        // held here.
        reset_frames();
        reset_pcm();
        ensure_event_pump(app);

        // A fresh libvlc instance per load. Instance pooling stays deferred
        // until the rendering decision lands. Freetype options are argv:
        // media options never reach the text renderer.
        let profile = current_subtitle();
        let style = super::subtitle_style(&profile, fontconfig_has_family(&profile.font));
        let instance = open_instance(&style).ok_or("libvlc init failed")?;
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
        // Audio callbacks replace the default output; the webview plays the
        // PCM they publish. Both are installed before play.
        install_video_callbacks(&media_player);
        install_audio_callbacks(&media_player);

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

        // Apply before publishing so the first samples already carry the
        // curve, then once more after the slot is visible in case a command
        // arrived while this load still held no player.
        let _ = apply_equalizer(&media_player, current_eq());
        // Delay resets on every media change, so it is set after play.
        unsafe {
            let _ = ffi::libvlc_video_set_spu_delay(media_player.ptr, style.delay_us);
        }

        *PLAYER
            .lock()
            .map_err(|_| "player mutex poisoned".to_string())? = Some(NativePlayer {
            _instance: instance,
            media_player,
            media,
            generation_slot,
        });
        if let Some(player) = PLAYER
            .lock()
            .map_err(|_| "player mutex poisoned".to_string())?
            .as_ref()
        {
            let _ = apply_equalizer(&player.media_player, current_eq());
            reapply_subtitle(player);
        }
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
        // Reset the frame surface and the PCM ring AFTER releasing the
        // PLAYER mutex: stop() takes PLAYER -> (libvlc) and the callbacks
        // take their own locks, so those locks must never nest.
        reset_frames();
        reset_pcm();
        Ok(())
    }

    pub fn seek(seconds: f64) -> Result<(), String> {
        with_player(|p| p.media_player.set_time((seconds.max(0.0) * 1000.0) as i64))?;
        Ok(())
    }

    pub fn set_volume(percent: i32) -> Result<(), String> {
        let clamped = super::clamp_volume_percent(percent);
        // Remember the UI value even if libvlc has no output yet. The tap
        // reads it when publishing. libvlc itself stays at or below 125.
        PCM_VOLUME.store(clamped as u32, Ordering::Release);
        let libvlc_percent = super::libvlc_volume_percent(clamped, false);
        let result = with_player(|p| p.media_player.set_volume(libvlc_percent))?;
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

    /// Last equalizer the UI asked for. `enabled: false` is a real bypass
    /// (`set_equalizer(NULL)`), which is unity. A preamp of +12 dB with every
    /// band at 0 is also unity: this libvlc build multiplies the input by
    /// `EQZ_IN_FACTOR` (0.25) and the +12 dB preamp undoes it. Band 0 dB
    /// contributes nothing. Measured on callback PCM with libvlc 3.0.24.
    #[derive(Clone, Copy)]
    struct EqRequest {
        enabled: bool,
        preamp: f32,
        bands: [f32; super::NATIVE_EQ_BANDS],
    }

    static EQ_REQUEST: Mutex<EqRequest> = Mutex::new(EqRequest {
        enabled: false,
        preamp: 12.0,
        bands: [0.0; super::NATIVE_EQ_BANDS],
    });

    fn current_eq() -> EqRequest {
        *EQ_REQUEST.lock().unwrap_or_else(|err| err.into_inner())
    }

    fn store_eq(request: EqRequest) {
        *EQ_REQUEST.lock().unwrap_or_else(|err| err.into_inner()) = request;
    }

    fn apply_equalizer(player: &MediaPlayer, request: EqRequest) -> Result<(), String> {
        unsafe {
            if !request.enabled {
                let rc = ffi::libvlc_media_player_set_equalizer(player.ptr, std::ptr::null_mut());
                return if rc == 0 {
                    Ok(())
                } else {
                    Err("libvlc rejected the equalizer".to_string())
                };
            }
            let count = ffi::libvlc_audio_equalizer_get_band_count();
            if count != super::NATIVE_EQ_BANDS as u32 {
                return Err(format!(
                    "libvlc equalizer has {count} bands, expected {}",
                    super::NATIVE_EQ_BANDS
                ));
            }
            let eq = ffi::libvlc_audio_equalizer_new();
            if eq.is_null() {
                return Err("libvlc equalizer init failed".to_string());
            }
            let preamp = ffi::libvlc_audio_equalizer_set_preamp(eq, request.preamp);
            let mut bands_ok = true;
            for (index, gain) in request.bands.iter().enumerate() {
                if ffi::libvlc_audio_equalizer_set_amp_at_index(eq, *gain, index as u32) != 0 {
                    bands_ok = false;
                }
            }
            let set = ffi::libvlc_media_player_set_equalizer(player.ptr, eq);
            // The player does not keep the handle.
            ffi::libvlc_audio_equalizer_release(eq);
            if preamp == 0 && bands_ok && set == 0 {
                Ok(())
            } else {
                Err("libvlc rejected the equalizer".to_string())
            }
        }
    }

    pub fn set_equalizer(enabled: bool, preamp: f64, bands: &[f64]) -> Result<(), String> {
        if bands.len() != super::NATIVE_EQ_BANDS {
            return Err(format!(
                "equalizer expects {} bands",
                super::NATIVE_EQ_BANDS
            ));
        }
        let mut stored = [0.0f32; super::NATIVE_EQ_BANDS];
        for (index, gain) in bands.iter().enumerate() {
            stored[index] = super::clamp_eq_db(*gain);
        }
        let request = EqRequest {
            enabled,
            preamp: super::clamp_eq_db(preamp),
            bands: stored,
        };
        // Publish the curve before touching the player so `load` cannot
        // miss an update that arrived while the previous player was down.
        store_eq(request);
        let guard = PLAYER
            .lock()
            .map_err(|_| "player mutex poisoned".to_string())?;
        let Some(player) = guard.as_ref() else {
            return Ok(());
        };
        apply_equalizer(&player.media_player, request)
    }

    fn subtitle_slot() -> &'static Mutex<super::SubtitleProfileArgs> {
        static SLOT: OnceLock<Mutex<super::SubtitleProfileArgs>> = OnceLock::new();
        SLOT.get_or_init(|| Mutex::new(super::SubtitleProfileArgs::default()))
    }

    fn current_subtitle() -> super::SubtitleProfileArgs {
        subtitle_slot()
            .lock()
            .unwrap_or_else(|err| err.into_inner())
            .clone()
    }

    fn store_subtitle(profile: super::SubtitleProfileArgs) {
        *subtitle_slot()
            .lock()
            .unwrap_or_else(|err| err.into_inner()) = profile;
    }

    fn fontconfig_has_family(family: &str) -> bool {
        let key = family.trim();
        if key.is_empty()
            || key
                .chars()
                .any(|ch| ch.is_control() || matches!(ch, '"' | '\\' | '=' | ':'))
        {
            return false;
        }
        static CACHE: OnceLock<Mutex<std::collections::HashMap<String, bool>>> = OnceLock::new();
        let cache = CACHE.get_or_init(|| Mutex::new(std::collections::HashMap::new()));
        if let Some(known) = cache
            .lock()
            .unwrap_or_else(|err| err.into_inner())
            .get(key)
            .copied()
        {
            return known;
        }
        let pattern = format!(":family={key}");
        let available = std::process::Command::new("fc-list")
            .arg(&pattern)
            .arg("file")
            .output()
            .map(|output| {
                output.status.success()
                    && output
                        .stdout
                        .iter()
                        .any(|byte| !byte.is_ascii_whitespace())
            })
            .unwrap_or(false);
        cache
            .lock()
            .unwrap_or_else(|err| err.into_inner())
            .insert(key.to_string(), available);
        available
    }

    /// `libvlc_new` with the profile. A bad argv falls back to software
    /// decode alone so a font or option problem cannot stop playback.
    ///
    /// `--avcodec-hw=none` is always passed. The RV32 format callback needs
    /// a CPU picture; a hardware chroma is one swscale cannot convert, so
    /// no frame is ever published.
    fn open_instance(style: &super::SubtitleStyle) -> Option<Instance> {
        ensure_vlc_plugin_path();
        let mut args = style.libvlc_args();
        args.push("--avcodec-hw=none".to_string());
        if let Some(instance) = instance_with_args(&args) {
            return Some(instance);
        }
        instance_with_args(&["--avcodec-hw=none".to_string()])
    }

    /// Point libvlc at the system plugins when a Tauri launch from the repo
    /// has no `VLC_PLUGIN_PATH`. swscale and amem live in that directory.
    fn ensure_vlc_plugin_path() {
        let already_set = std::env::var_os("VLC_PLUGIN_PATH")
            .is_some_and(|value| !value.is_empty());
        if already_set {
            return;
        }
        let plugins = "/usr/lib/vlc/plugins";
        if std::path::Path::new(plugins).exists() {
            std::env::set_var("VLC_PLUGIN_PATH", plugins);
        }
    }

    fn instance_with_args(args: &[String]) -> Option<Instance> {
        let cstrings: Option<Vec<CString>> = args
            .iter()
            .map(|arg| CString::new(arg.as_str()).ok())
            .collect();
        let cstrings = cstrings?;
        let ptrs: Vec<*const libc::c_char> = cstrings.iter().map(|arg| arg.as_ptr()).collect();
        let ptr = unsafe { ffi::libvlc_new(ptrs.len() as i32, ptrs.as_ptr()) };
        if ptr.is_null() {
            None
        } else {
            Some(Instance { ptr })
        }
    }

    const VLC_VAR_INTEGER: i32 = 0x0030;
    const VLC_VAR_STRING: i32 = 0x0040;

    #[repr(C)]
    union VlcValue {
        i_int: i64,
        psz_string: *const libc::c_char,
    }

    #[link(name = "vlccore")]
    extern "C" {
        fn var_SetChecked(
            obj: *mut c_void,
            name: *const libc::c_char,
            expected_type: libc::c_int,
            val: VlcValue,
        ) -> libc::c_int;
    }

    fn libvlc_root(instance: &Instance) -> *mut c_void {
        // `libvlc_instance_t`'s first field is `libvlc_int_t *`, the root
        // object freetype inherits variables from. Layout from libvlc 3.0.24.
        unsafe { *(instance.ptr as *const *mut c_void) }
    }

    fn set_vlc_int(obj: *mut c_void, name: &str, value: i64) {
        let Ok(cname) = CString::new(name) else {
            return;
        };
        unsafe {
            let _ = var_SetChecked(
                obj,
                cname.as_ptr(),
                VLC_VAR_INTEGER,
                VlcValue { i_int: value },
            );
        }
    }

    fn set_vlc_string(obj: *mut c_void, name: &str, value: &str) {
        let Ok(cname) = CString::new(name) else {
            return;
        };
        let Ok(cvalue) = CString::new(value) else {
            return;
        };
        unsafe {
            let _ = var_SetChecked(
                obj,
                cname.as_ptr(),
                VLC_VAR_STRING,
                VlcValue {
                    psz_string: cvalue.as_ptr(),
                },
            );
        }
    }

    /// Push style onto the live instance and set the SPU delay.
    ///
    /// Freetype re-reads text colour, background opacity, outline thickness,
    /// and `sub-text-scale` on each render. Font, exact pixel size, outline
    /// colour, and `sub-margin` are copied when the renderer and SPU are
    /// created, which is every `load` (a new instance) and any renderer
    /// start that has not happened yet. Delay is the public 3.0 API and
    /// applies immediately; libvlc clears it on each media change.
    fn apply_subtitle_live(player: &NativePlayer, style: &super::SubtitleStyle) {
        unsafe {
            let _ = ffi::libvlc_video_set_spu_delay(player.media_player.ptr, style.delay_us);
        }
        let root = libvlc_root(&player._instance);
        if root.is_null() {
            return;
        }
        if let Some(font) = &style.font {
            set_vlc_string(root, "freetype-font", font);
        }
        set_vlc_int(root, "freetype-fontsize", style.fontsize_px as i64);
        set_vlc_int(root, "freetype-opacity", 255);
        set_vlc_int(root, "freetype-color", style.text_color as i64);
        set_vlc_int(root, "freetype-outline-opacity", style.outline_opacity as i64);
        set_vlc_int(root, "freetype-outline-color", style.outline_color as i64);
        set_vlc_int(
            root,
            "freetype-outline-thickness",
            style.outline_thickness as i64,
        );
        set_vlc_int(
            root,
            "freetype-background-opacity",
            style.background_opacity as i64,
        );
        set_vlc_int(root, "freetype-background-color", 0);
        set_vlc_int(root, "sub-text-scale", style.text_scale as i64);
        set_vlc_int(root, "sub-margin", style.margin as i64);
    }

    fn reapply_subtitle(player: &NativePlayer) {
        let profile = current_subtitle();
        let style = super::subtitle_style(&profile, fontconfig_has_family(&profile.font));
        apply_subtitle_live(player, &style);
    }

    pub fn set_subtitle_profile(profile: super::SubtitleProfileArgs) -> Result<(), String> {
        let style = super::subtitle_style(&profile, fontconfig_has_family(&profile.font));
        store_subtitle(profile);
        let guard = PLAYER
            .lock()
            .map_err(|_| "player mutex poisoned".to_string())?;
        let Some(player) = guard.as_ref() else {
            return Ok(());
        };
        apply_subtitle_live(player, &style);
        Ok(())
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
        // classification helpers stay compiled when libvlc is not linked.
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

    pub fn set_equalizer(_enabled: bool, _preamp: f64, bands: &[f64]) -> Result<(), String> {
        if bands.len() != super::NATIVE_EQ_BANDS {
            return Err(format!(
                "equalizer expects {} bands",
                super::NATIVE_EQ_BANDS
            ));
        }
        Err(unavailable())
    }

    pub fn set_subtitle_profile(_profile: super::SubtitleProfileArgs) -> Result<(), String> {
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

/// Set the playback volume, clamped to 0–200 percent.
///
/// libvlc is held at 125. Above that, the PCM tap applies `percent / 125`
/// and a tanh soft clip. 0 is silence. 100 stays unity.
#[tauri::command]
pub fn player_set_volume(percent: i32) -> Result<(), String> {
    native::set_volume(percent)
}

/// Apply or bypass the libvlc equalizer.
///
/// `bands` is the ten ISO centres (31.25 Hz … 16 kHz). `preamp` is separate.
/// `enabled` false calls `libvlc_media_player_set_equalizer(NULL)`, which
/// leaves callback PCM untouched. With the filter on, band 0 dB adds nothing
/// and a preamp of +12 dB is unity on libvlc 3.0.24.
#[tauri::command]
pub fn player_set_equalizer(enabled: bool, preamp: f64, bands: Vec<f64>) -> Result<(), String> {
    native::set_equalizer(enabled, preamp, &bands)
}

/// Style libvlc's freetype subtitles and set the SPU delay.
///
/// A font family fontconfig does not know is omitted, so libvlc keeps its
/// default face and playback still starts. HTML5 does not use this command.
#[tauri::command]
pub fn player_set_subtitle_profile(profile: SubtitleProfileArgs) -> Result<(), String> {
    native::set_subtitle_profile(profile)
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
/// into the callback picture. Styling comes from `player_set_subtitle_profile`.
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

    #[test]
    fn libvlc_volume_stops_at_125_and_mute_is_zero() {
        assert_eq!(libvlc_volume_percent(0, false), 0);
        assert_eq!(libvlc_volume_percent(100, false), 100);
        assert_eq!(libvlc_volume_percent(125, false), 125);
        assert_eq!(libvlc_volume_percent(200, false), 125);
        assert_eq!(libvlc_volume_percent(180, true), 0);
        assert_eq!(libvlc_volume_percent(250, false), 125);
    }

    #[test]
    fn native_pcm_gain_is_unity_through_125() {
        assert_eq!(native_pcm_gain(0, false), 0.0);
        assert_eq!(native_pcm_gain(100, false), 1.0);
        assert_eq!(native_pcm_gain(125, false), 1.0);
        assert_eq!(native_pcm_gain(50, true), 0.0);
        let boost = native_pcm_gain(200, false);
        assert!((boost - (200.0 / 125.0)).abs() < 1e-6);
    }

    #[test]
    fn equalizer_db_clamps_to_libvlc_range() {
        assert_eq!(clamp_eq_db(0.0), 0.0);
        assert_eq!(clamp_eq_db(12.0), 12.0);
        assert_eq!(clamp_eq_db(-20.0), -20.0);
        assert_eq!(clamp_eq_db(20.0), 20.0);
        assert_eq!(clamp_eq_db(40.0), 20.0);
        assert_eq!(clamp_eq_db(-40.0), -20.0);
        assert_eq!(clamp_eq_db(f64::NAN), 0.0);
        assert_eq!(NATIVE_EQ_BANDS, 10);
    }

    #[test]
    fn subtitle_profile_maps_onto_libvlc_freetype() {
        let mut profile = SubtitleProfileArgs::default();
        let style = subtitle_style(&profile, true);
        assert_eq!(style.font.as_deref(), Some("Inter"));
        assert_eq!(style.text_color, 0x00B8_B8B8);
        assert_eq!(style.outline_color, 0x000E_0E0E);
        assert_eq!(style.fontsize_px, 0);
        assert_eq!(style.text_scale, 100);
        assert_eq!(style.outline_thickness, 2);
        assert_eq!(style.outline_opacity, 255);
        assert_eq!(style.background_opacity, 64);
        assert_eq!(style.margin, 0);
        assert_eq!(style.delay_us, 0);
        let args = style.libvlc_args();
        assert!(args.iter().any(|arg| arg == "--freetype-font=Inter"));
        assert!(args.iter().any(|arg| arg == "--freetype-fontsize=0"));
        assert!(args.iter().any(|arg| arg == "--sub-text-scale=100"));
        assert!(args.iter().any(|arg| arg == "--sub-margin=0"));
        assert!(args.iter().any(|arg| arg == "--freetype-color=12105912"));

        profile.size_mode = "exact".to_string();
        profile.size = 36.0;
        profile.outline_width = 0.0;
        profile.background_opacity = 100.0;
        profile.vertical_position = "top".to_string();
        profile.delay = -4.0;
        profile.font = "Nope".to_string();
        let exact = subtitle_style(&profile, false);
        assert!(exact.font.is_none());
        assert_eq!(exact.fontsize_px, 36);
        assert_eq!(exact.text_scale, 100);
        assert_eq!(exact.outline_thickness, 0);
        assert_eq!(exact.outline_opacity, 0);
        assert_eq!(exact.background_opacity, 255);
        assert_eq!(exact.margin, 360);
        assert_eq!(exact.delay_us, -4_000_000);
        assert!(!exact
            .libvlc_args()
            .iter()
            .any(|arg| arg.starts_with("--freetype-font=")));

        profile.size_mode = "relative".to_string();
        profile.size = 150.0;
        profile.vertical_position = "lower-middle".to_string();
        let relative = subtitle_style(&profile, false);
        assert_eq!(relative.fontsize_px, 0);
        assert_eq!(relative.text_scale, 150);
        assert_eq!(relative.margin, 72);

        profile.vertical_position = "middle".to_string();
        assert_eq!(subtitle_style(&profile, false).margin, 180);
    }

    #[test]
    fn soft_clip_keeps_unity_and_does_not_hard_clamp() {
        assert_eq!(shape_native_sample(0.5, 1.0), 0.5);
        assert_eq!(shape_native_sample(-0.25, 1.0), -0.25);
        assert_eq!(shape_native_sample(0.8, 0.0), 0.0);
        let shaped = shape_native_sample(1.0, 200.0 / 125.0);
        assert!(shaped > 0.9 && shaped < 1.0, "{shaped}");
    }

    // HTML5-only build (`--no-default-features`): the shell must report
    // HTML5 so the frontend keeps the webview player.
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
    fn asset_urls_decode_to_filesystem_paths() {
        assert_eq!(
            classify_media_target("asset://localhost/%2Ftmp%2Fmy%20clip.mp4").unwrap(),
            MediaTarget::Path("/tmp/my clip.mp4".to_string())
        );
        assert_eq!(
            classify_media_target("http://asset.localhost/%2Fhome%2Fme%2Fa.mkv").unwrap(),
            MediaTarget::Path("/home/me/a.mkv".to_string())
        );
        assert_eq!(
            classify_media_target("https://asset.localhost/C%3A%5CVideos%5Cclip.mkv").unwrap(),
            MediaTarget::Path(r"C:\Videos\clip.mkv".to_string())
        );
        assert!(classify_media_target("asset://localhost/").is_err());
    }

    #[test]
    fn watch_keys_peel_to_the_file_path() {
        let key = "/home/davisville/Videos/OBS/2026-11-05 18-49-26.mp4:asset://localhost/%2Fhome%2Fdavisville%2FVideos%2FOBS%2F2026-11-05%2018-49-26.mp4:native";
        assert_eq!(
            classify_media_target(key).unwrap(),
            MediaTarget::Path(
                "/home/davisville/Videos/OBS/2026-11-05 18-49-26.mp4".to_string()
            )
        );
    }

    #[test]
    fn empty_files_and_directories_are_not_playable() {
        let dir = std::env::temp_dir().join("kanea-player-guard");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let empty = dir.join("empty.mp4");
        std::fs::write(&empty, b"").unwrap();
        let real = dir.join("clip.mp4");
        std::fs::write(&real, b"not-a-real-movie-but-not-empty").unwrap();
        assert!(ensure_playable_file(empty.to_str().unwrap()).is_err());
        assert!(ensure_playable_file(dir.to_str().unwrap()).is_err());
        assert!(ensure_playable_file(real.to_str().unwrap()).is_ok());
        assert!(ensure_playable_file("/tmp/kanea-does-not-exist.mp4").is_err());
        let _ = std::fs::remove_dir_all(&dir);
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
