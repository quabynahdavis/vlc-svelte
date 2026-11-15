//! Feature-flagged native media backend (libvlc) behind a stable IPC seam.
//!
//! Playback in the shell is currently HTML5: TransportBar/PlayerView drive
//! webview `<audio>` / `<video>` elements. This module prepares an eventual
//! switch to libvlc WITHOUT taking it. Every command below exists in both
//! builds so the frontend contract never changes, but the native half only
//! compiles with `--features libvlc`, which requires system libvlc 3.x dev
//! packages. The default build therefore stays on HTML5 and the commands
//! answer with a descriptive error instead of failing to link.
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
//! The frontend seam is `src/lib/playerBackend.ts`; it treats every native
//! call as OPTIONAL and keeps HTML5 as the default path until the native
//! backend actually ships.
//!
//! Rendering: this scaffold is AUDIO-ONLY on purpose. The open decision —
//! embed a native child window vs. libvlc video callbacks rendered into the
//! webview — will be detailed in docs/en/plans/02-libvlc-integration.md, so
//! no window-embedding code lives here yet. Video surface selection is the
//! next phase.

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

// NOTE: compiled only with --features libvlc; requires system libvlc 3.x.
#[cfg(feature = "libvlc")]
mod native {
    use std::sync::Mutex;

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

    /// Run `f` against the loaded player, or fail if nothing was loaded.
    fn with_player<T>(f: impl FnOnce(&NativePlayer) -> T) -> Result<T, String> {
        let guard = PLAYER
            .lock()
            .map_err(|_| "player mutex poisoned".to_string())?;
        let player = guard.as_ref().ok_or("no media loaded")?;
        Ok(f(player))
    }

    pub fn load(path: &str) -> Result<(), String> {
        // Scaffold behaviour: a fresh libvlc instance per load. Instance
        // pooling/reuse is deferred until the rendering decision lands.
        let instance = Instance::new().ok_or("libvlc init failed")?;
        let media = Media::new_path(&instance, path).ok_or("libvlc failed to open media")?;
        let media_player = MediaPlayer::new(&instance).ok_or("libvlc media player init failed")?;
        media_player.set_media(&media);
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
