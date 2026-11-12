# Player Enhancements Plan

## 1. 200% Volume via Web Audio API (HTML5)

**Status**: Planned  
**Target**: All platforms (Linux, macOS, Windows)  
**Backend**: HTML5 `<video>` + `AudioContext` + `GainNode`

### Implementation

#### Store (`src/stores/player.ts`)
- Raise volume ceiling: `clamp(volume, 0, 100)` → `clamp(volume, 0, 200)`
- `setVolume(200)` → gain value `2.0`

#### PlayerView (`src/views/PlayerView.svelte`)
```typescript
let audioCtx: AudioContext | null = null;
let gainNode: GainNode | null = null;

function hookAudioAnalyser(): void {
  if (!videoEl || audioCtx) return;
  
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const source = audioCtx.createMediaElementSource(videoEl);
  gainNode = audioCtx.createGain();
  
  source.connect(gainNode).connect(audioCtx.destination);
}

// Reactive sync
$: if (gainNode) gainNode.gain.value = $player.muted ? 0 : $player.volume / 100;
```

#### TransportBar (`src/components/TransportBar.svelte`)
- Update volume HUD display: `0–200%`
- Update volume slider/bar max

#### Gestures (`src/lib/gestures.ts`)
- Wheel volume step max: `100` → `200`

---

## 2. Subtitle Rendering (Current)

**Status**: Working  
**Backend**: HTML5 `<track>` elements + WebVTT  
**Location**: `RightDock.svelte` → `SubtitleDockPanel.svelte`

No changes needed for 200% volume — audio routing doesn't affect subtitle track.

---

## 3. Future: libvlc Migration (Deferred)

**Status**: Not planned for now  
**Reason**: HTML5 + Web Audio covers 200% volume and subtitle rendering for current needs.

### When to Consider
- Hardware decoding required (HEVC/AV1 on low-end)
- Advanced audio (equalizer, spatial audio, audio track switching)
- Network stream protocols (RTSP, HLS, DASH)
- Blu-ray/DVD menu support

### Architecture If Needed
- New `src-tauri/src/player.rs` with `libvlc` crate
- Tauri commands: `player_load`, `player_play`, `player_seek`, `player_set_volume(0-200)`
- Frontend: Replace `<video>` with `div#vlc-container`, route all playback via `invoke`

---

## Waveform Progress Bar (Reference)

**Current behavior** (`TransportBar.svelte`):
- Activates **only for audio tracks** (detected by extension: mp3, flac, m4a, ogg, opus, wav)
- Data source: `waveform_peaks` Rust command → `waveform.rs` → ffmpeg/audiowaveform extraction
- Renders: Canvas vertical bars (played = accent, unplayed = muted)
- Interaction: Click/drag to seek
- Fallback: Standard linear seekbar for video or when peaks unavailable