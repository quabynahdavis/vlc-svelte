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

## 3. libvlc Migration (Prepared)

**Status**: In progress — see [02-libvlc-integration.md](02-libvlc-integration.md). Phases 0–1 are done, Phase 2 keeps the canvas frame pump (a native window embed is not the next slice), and the Phase 3 network / event / track seam has landed.  
**Reason**: HTML5 + Web Audio remains the default. The native path stays behind the `libvlc` cargo feature and the Settings → Playback toggle.

### When to Consider
- Hardware decoding required (HEVC/AV1 on low-end)
- Advanced audio (equalizer, spatial audio, audio track switching)
- Network stream protocols (RTSP, HLS, DASH)
- Blu-ray/DVD menu support

---

## Waveform Progress Bar (Reference)

**Current behavior** (`TransportBar.svelte`):
- Activates for music-library tracks and other local audio (audio extension on the id or src, or an audio/music kind or `audio/*` mime)
- Stays on the thick seek bar, with hover thumbnails, for video files even when they contain an audio stream
- Data source: existing 0..1 peaks from `waveform_get` / `waveform_generate` (`waveform.rs`, ffmpeg), session-cached
- Renders: canvas vertical bars (played = accent, unplayed = muted) in dark and light themes
- Interaction: click and drag on the same seek slider
- Fallback: thick seek bar when peaks are unavailable