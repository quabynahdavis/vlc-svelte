<script lang="ts">
  import { get } from 'svelte/store';
  import { onMount } from 'svelte';
  import {
    AudioLines,
    Captions,
    ListVideo,
    Maximize,
    Minimize,
    Pause,
    Play,
    RotateCcw,
    RotateCw,
    Settings,
    SkipBack,
    SkipForward,
    Volume2,
    VolumeX,
  } from 'lucide-svelte';
  import {
    currentTrack,
    next as nextTrack,
    player,
    prev as prevTrack,
    seek,
    setVolume,
    toggle,
    toggleMute,
  } from '../stores/player';
  import type { PlayerState, Track } from '../stores/player';
  import { isAudioFile } from '../lib/audio';
  import { waveformGenerate, waveformGet } from '../lib/audioMeta';
  import { toggleFullscreen } from '../lib/gestures';
  import { layout } from '../stores/layout';
  import { dockMode, openDock } from '../stores/ui';

  export let videoEl: HTMLVideoElement | null = null;
  export let mediaAvailable = false;
  export let bufferedRatio = 0;
  export let fullscreenTarget: HTMLElement | null = null;
  export let onSettings: () => void = () => {};

  const PREVIEW_WIDTH = 160;
  const PREVIEW_HEIGHT = 90;
  const PREVIEW_CARD_HALF_WIDTH = 65;
  const PREVIEW_SEEK_THROTTLE_MS = 80;
  const NEXT_PROMPT_WINDOW_SECONDS = 20;
  const VOLUME_STEP = 5;
  // Keep in sync with the volume control's w-[92px] class (cone gradient sizing).
  const VOLUME_TRACK_WIDTH = 92;

  let seekTrack: HTMLDivElement | null = null;
  let volumeTrack: HTMLDivElement | null = null;
  let previewVideo: HTMLVideoElement | null = null;
  let previewCanvas: HTMLCanvasElement | null = null;
  let scrubbing = false;
  let volumeDragging = false;
  let isFullscreen = false;

  // ── Waveform seekbar (audio tracks only) ────────────────────────────────
  // Audio detection: Phase 4 guarantees `MusicTrack.id === file path`, so a
  // track whose id carries an audio extension is a music track. Video ids
  // are media keys of video files (video extensions) or http(s) streams, so
  // the same extension check never fires for them — video/stream/src-less
  // tracks keep the plain bar below.
  const WAVEFORM_BUCKETS = 800;
  const WAVEFORM_BAR_WIDTH = 2;
  const WAVEFORM_BAR_GAP = 2;

  /** Session cache: resolved peaks per track path (survives track switches). */
  const waveformCache = new Map<string, number[]>();

  let waveCanvas: HTMLCanvasElement | null = null;
  /** Peaks of the current audio track, or null while resolving/unavailable. */
  let wavePeaks: number[] | null = null;
  /** Path the current peaks belong to; guards against stale async fills. */
  let wavePeaksKey = '';
  /** Incremented on every track change; stale resolves are dropped. */
  let waveLoadToken = 0;

  let previewVisible = false;
  let previewFrameReady = false;
  let previewX = 0;
  let previewTime = 0;
  let previewSource = '';
  let previewSeekTarget = 0;
  let previewSeekTimer: ReturnType<typeof setTimeout> | null = null;
  let previewPendingTime: number | null = null;
  let promptLocked = false;
  let promptLockedVisible = false;

  $: duration =
    Number.isFinite($player.duration) && $player.duration > 0 ? $player.duration : 0;
  $: elapsed =
    Number.isFinite($player.currentTime) && $player.currentTime > 0
      ? Math.min($player.currentTime, duration || $player.currentTime)
      : 0;
  $: progressPct = duration > 0 ? clamp((elapsed / duration) * 100, 0, 100) : 0;
  $: bufferedPct = duration > 0 ? clamp(bufferedRatio * 100, 0, 100) : 0;
  $: volumeMuted = $player.muted || $player.volume === 0;
  $: remaining = duration > 0 ? duration - elapsed : Number.POSITIVE_INFINITY;
  $: nextQueueItem = resolveNextItem($player);
  $: nextPromptEligible =
    mediaAvailable &&
    duration > 0 &&
    remaining <= NEXT_PROMPT_WINDOW_SECONDS &&
    hasNextItem($player);
  // Freeze the prompt while scrubbing so the seek track cannot resize under the
  // pointer (which would remap the drag position).
  $: showNextPrompt = promptLocked ? promptLockedVisible : nextPromptEligible;
  $: nextPromptLabel =
    nextQueueItem && nextQueueItem.title
      ? `Next episode: ${nextQueueItem.title}`
      : 'Next episode';
  $: if ((!mediaAvailable || duration <= 0) && previewVisible) hidePreview();
  $: hasDockControls =
    $layout.playerControls.audio ||
    $layout.playerControls.subtitles ||
    $layout.playerControls.settings ||
    $layout.playerControls.fullscreen ||
    $layout.playerControls.queue;

  $: currentTrackPath = $currentTrack?.id ?? '';
  $: isAudioTrack = isAudioFile(currentTrackPath);
  $: resolveWavePeaks(isAudioTrack, currentTrackPath);
  // Waveform strip only once peaks exist; before that (resolving, or the
  // Rust pipeline returned nothing) the plain bar stays — no layout jump.
  $: waveActive = isAudioTrack && wavePeaks !== null && wavePeaks.length > 0;
  // Redraw whenever the playhead moves (timeupdate, scrubbing) or peaks load.
  $: if (waveCanvas && waveActive) drawWaveCanvas(elapsed, duration);

  /**
   * Resolve peaks for the current audio track: session cache → persisted
   * row (`waveform_get`) → fresh decode (`waveform_generate`, which itself
   * persists). While resolving or when nothing can be produced, `wavePeaks`
   * stays null and the plain bar is kept.
   */
  async function resolveWavePeaks(audio: boolean, path: string): Promise<void> {
    if (!audio || !path) {
      waveLoadToken += 1;
      wavePeaks = null;
      wavePeaksKey = '';
      return;
    }

    if (wavePeaksKey === path) return;
    wavePeaksKey = path;

    const token = ++waveLoadToken;
    const cached = waveformCache.get(path);
    if (cached) {
      wavePeaks = cached;
      return;
    }
    wavePeaks = null;

    const stored = await waveformGet(path);
    let peaks = stored && stored.length > 0 ? stored : null;
    if (!peaks) {
      const generated = await waveformGenerate(path, WAVEFORM_BUCKETS);
      peaks = generated && generated.length > 0 ? generated : null;
    }

    if (token !== waveLoadToken) return; // the track changed while resolving
    if (peaks) {
      waveformCache.set(path, peaks);
      wavePeaks = peaks;
    }
  }

  /** DPR-aware backing-store sizing for the waveform strip. */
  function resizeWaveCanvas(canvas: HTMLCanvasElement): void {
    const bounds = canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(bounds.width * dpr));
    const height = Math.max(1, Math.round(bounds.height * dpr));

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  /**
   * Colors resolve from CSS so the strip follows the app theme: the accent
   * custom property wins, otherwise the canvas' `text-vlc-orange` colour;
   * unplayed bars reuse the seekbar's muted border token.
   */
  function waveColorsOf(canvas: HTMLCanvasElement): { accent: string; muted: string } {
    const styles = getComputedStyle(canvas);
    const accent = styles.getPropertyValue('--vlc-accent').trim() || styles.color;
    const border = styles.getPropertyValue('--border-rgb').trim();
    return {
      accent,
      muted: border ? `rgb(${border} / 0.9)` : 'rgba(128, 128, 128, 0.9)',
    };
  }

  /** Thin centered bars; the played head is the accent, the rest muted. */
  function drawWaveCanvas(currentTime = 0, totalDuration = 0): void {
    const canvas = waveCanvas;
    const peaks = wavePeaks;
    if (!canvas || !peaks || peaks.length === 0) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);

    const slot = WAVEFORM_BAR_WIDTH + WAVEFORM_BAR_GAP;
    const barCount = Math.max(1, Math.floor(width / slot));
    const { accent, muted } = waveColorsOf(canvas);
    const progress = totalDuration > 0 ? clamp(currentTime / totalDuration, 0, 1) : 0;
    // Playhead bucket boundary: bars strictly before it count as played.
    const playedBars = Math.floor(progress * barCount);

    for (let index = 0; index < barCount; index += 1) {
      const peak =
        peaks[Math.min(peaks.length - 1, Math.floor((index / barCount) * peaks.length))] ?? 0;
      const barHeight = Math.max(1, peak * height);
      const x = index * slot;

      context.fillStyle = index < playedBars ? accent : muted;
      context.fillRect(x, (height - barHeight) / 2, WAVEFORM_BAR_WIDTH, barHeight);
    }
  }

  /** Svelte action: attach the resize observer for the waveform strip. */
  function waveformCanvasAction(node: HTMLCanvasElement): { destroy(): void } {
    const observer = new ResizeObserver(() => {
      resizeWaveCanvas(node);
      drawWaveCanvas(elapsed, duration);
    });
    observer.observe(node.parentElement ?? node);
    resizeWaveCanvas(node);
    drawWaveCanvas(elapsed, duration);

    return {
      destroy() {
        observer.disconnect();
      },
    };
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  function pad(value: number): string {
    return String(value).padStart(2, '0');
  }

  function formatTime(value: number): string {
    const total = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }

  function hasNextItem(state: PlayerState): boolean {
    if (state.queue.length <= 1 || state.currentIndex < 0) return false;
    if (state.shuffle) return true;
    if (state.currentIndex + 1 < state.queue.length) return true;
    return state.repeat === 'all';
  }

  function resolveNextItem(state: PlayerState): Track | null {
    if (!hasNextItem(state) || state.shuffle) return null;

    const index =
      state.currentIndex + 1 < state.queue.length ? state.currentIndex + 1 : 0;
    return state.queue[index] ?? null;
  }

  function togglePlay(): void {
    // The player store is the single source of truth; PlayerView syncs the element.
    toggle();
  }

  function goPrevious(): void {
    const before = get(player);
    prevTrack();
    const after = get(player);

    // Restarting the first item does not remount the <video>.
    if (videoEl && after.currentIndex === before.currentIndex) {
      videoEl.currentTime = 0;
    }
  }

  function goNext(): void {
    const before = get(player);
    nextTrack();
    const after = get(player);

    if (videoEl && after.currentIndex === before.currentIndex && !after.isPlaying) {
      videoEl.pause();
    }
  }

  /** VLC-style ±10 second jumps flanking the play button. */
  function skipBackward10(): void {
    nudgeTime(-10);
  }

  function skipForward10(): void {
    nudgeTime(10);
  }

  function applyVolume(value: number): void {
    const next = Math.round(clamp(value, 0, 200));
    setVolume(next);

    if (videoEl) {
      // The element itself stays within [0, 1]; the PlayerView GainNode
      // supplies the >100% boost, so capping here avoids IndexSizeError.
      videoEl.volume = clamp(next / 100, 0, 1);
      videoEl.muted = next === 0;
    }
  }

  function handleMute(): void {
    const willMute = !$player.muted;
    toggleMute();

    if (videoEl) videoEl.muted = willMute;
  }

  function applySeekTime(time: number): void {
    if (duration <= 0) return;

    const target = clamp(time, 0, duration);

    if (videoEl && mediaAvailable) {
      try {
        videoEl.currentTime = target;
      } catch (error) {
        console.warn('Seek failed.', error);
      }
    }

    seek(target);
  }

  function seekRatioFromPointer(event: PointerEvent): number {
    if (!seekTrack) return 0;
    const bounds = seekTrack.getBoundingClientRect();
    if (bounds.width <= 0) return 0;
    return clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
  }

  function updatePreviewAtPointer(event: PointerEvent): void {
    if (!mediaAvailable || duration <= 0 || !seekTrack) {
      hidePreview();
      return;
    }

    const bounds = seekTrack.getBoundingClientRect();
    if (bounds.width <= 0) return;

    const ratio = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
    const half = Math.min(PREVIEW_CARD_HALF_WIDTH, bounds.width / 2);

    previewTime = ratio * duration;
    previewX = clamp(ratio * bounds.width, half, bounds.width - half);
    previewVisible = true;

    // Waveform mode: the timestamp card is enough — audio files are never
    // decoded into the hover preview element.
    if (waveActive) return;
    schedulePreviewSeek(previewTime);
  }

  function ensurePreviewSource(): boolean {
    const el = previewVideo;
    const source = videoEl?.currentSrc || videoEl?.src || '';

    if (!el || !source) {
      previewFrameReady = false;
      return false;
    }

    if (source !== previewSource) {
      previewSource = source;
      previewFrameReady = false;
      previewPendingTime = null;
      el.muted = true;
      el.src = source;
      el.load();
    }

    return true;
  }

  function schedulePreviewSeek(time: number): void {
    previewSeekTarget = time;

    if (previewSeekTimer !== null) return;

    previewSeekTimer = setTimeout(() => {
      previewSeekTimer = null;
      seekPreviewVideo(previewSeekTarget);
    }, PREVIEW_SEEK_THROTTLE_MS);
  }

  function seekPreviewVideo(time: number): void {
    if (!ensurePreviewSource()) {
      previewFrameReady = false;
      return;
    }

    const el = previewVideo;
    if (!el) return;

    // Metadata is required before currentTime can be assigned; remember the
    // latest target and apply it from loadedmetadata.
    if (el.readyState < 1) {
      previewPendingTime = time;
      return;
    }

    const upperBound =
      Number.isFinite(el.duration) && el.duration > 0
        ? Math.max(0, el.duration - 0.05)
        : time;

    try {
      el.currentTime = clamp(time, 0, upperBound);
    } catch {
      // Remote streams and formats without seek support simply keep the label.
      previewFrameReady = false;
    }
  }

  function handlePreviewLoadedMetadata(): void {
    if (previewPendingTime !== null) {
      const target = previewPendingTime;
      previewPendingTime = null;
      seekPreviewVideo(target);
      return;
    }

    if (previewVisible) seekPreviewVideo(previewSeekTarget);
  }

  function drawPreviewFrame(): void {
    const el = previewVideo;
    const canvas = previewCanvas;

    if (!el || !canvas || el.readyState < 2 || el.videoWidth <= 0 || el.videoHeight <= 0) {
      return;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      previewFrameReady = false;
      return;
    }

    try {
      const targetRatio = PREVIEW_WIDTH / PREVIEW_HEIGHT;
      const sourceRatio = el.videoWidth / el.videoHeight;

      let sx = 0;
      let sy = 0;
      let sw = el.videoWidth;
      let sh = el.videoHeight;

      // Cover-crop into the 16:9 card so portrait or ultrawide media still fills it.
      if (sourceRatio > targetRatio) {
        sw = el.videoHeight * targetRatio;
        sx = (el.videoWidth - sw) / 2;
      } else {
        sh = el.videoWidth / targetRatio;
        sy = (el.videoHeight - sh) / 2;
      }

      context.clearRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
      context.drawImage(el, sx, sy, sw, sh, 0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
      previewFrameReady = true;
    } catch {
      // Cross-origin frames taint the canvas; fall back to the time-only card.
      previewFrameReady = false;
    }
  }

  function handlePreviewError(): void {
    previewFrameReady = false;
    previewPendingTime = null;
  }

  function hidePreview(): void {
    previewVisible = false;

    if (previewSeekTimer !== null) {
      clearTimeout(previewSeekTimer);
      previewSeekTimer = null;
    }
  }

  function handleWindowBlur(): void {
    hidePreview();
    scrubbing = false;
    promptLocked = false;
  }

  function handleSeekPointerMove(event: PointerEvent): void {
    updatePreviewAtPointer(event);

    if (!scrubbing) return;
    applySeekTime(seekRatioFromPointer(event) * duration);
  }

  function handleSeekLeave(): void {
    if (scrubbing) return;
    hidePreview();
  }

  function handleSeekBlur(): void {
    hidePreview();
  }

  function startScrub(event: PointerEvent): void {
    if (event.button !== 0 || duration <= 0) return;

    event.preventDefault();
    updatePreviewAtPointer(event);
    promptLockedVisible = showNextPrompt;
    promptLocked = true;
    scrubbing = true;
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture?.(event.pointerId);
    applySeekTime(seekRatioFromPointer(event) * duration);
  }

  function endScrub(event: PointerEvent): void {
    if (!scrubbing) return;

    applySeekTime(seekRatioFromPointer(event) * duration);
    scrubbing = false;
    promptLocked = false;

    const target = event.currentTarget as HTMLElement;
    if (target.hasPointerCapture?.(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }

    const bounds = seekTrack?.getBoundingClientRect();
    const inside =
      bounds && event.clientX >= bounds.left && event.clientX <= bounds.right;
    if (!inside) hidePreview();
  }

  function cancelScrub(): void {
    scrubbing = false;
    promptLocked = false;
    hidePreview();
  }

  function nudgeTime(seconds: number): void {
    if (duration <= 0) return;

    const base = videoEl && Number.isFinite(videoEl.currentTime)
      ? videoEl.currentTime
      : $player.currentTime;
    applySeekTime(base + seconds);
  }

  function handleSeekKeydown(event: KeyboardEvent): void {
    const handled = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
    if (!handled.includes(event.key)) return;

    event.preventDefault();
    event.stopPropagation();

    if (event.key === 'Home') {
      applySeekTime(0);
      return;
    }

    if (event.key === 'End') {
      applySeekTime(duration);
      return;
    }

    nudgeTime(event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -5 : 5);
  }

  function volumeRatioFromPointer(event: PointerEvent): number {
    if (!volumeTrack) return 0;
    const bounds = volumeTrack.getBoundingClientRect();
    if (bounds.width <= 0) return 0;
    return clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
  }

  function startVolumeDrag(event: PointerEvent): void {
    if (event.button !== 0) return;

    event.preventDefault();
    volumeDragging = true;
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture?.(event.pointerId);
    applyVolume(volumeRatioFromPointer(event) * 200);
  }

  function moveVolumeDrag(event: PointerEvent): void {
    if (!volumeDragging) return;
    applyVolume(volumeRatioFromPointer(event) * 200);
  }

  function endVolumeDrag(event: PointerEvent): void {
    if (!volumeDragging) return;

    applyVolume(volumeRatioFromPointer(event) * 200);
    volumeDragging = false;

    const target = event.currentTarget as HTMLElement;
    if (target.hasPointerCapture?.(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }
  }

  function cancelVolumeDrag(): void {
    volumeDragging = false;
  }

  function handleVolumeKeydown(event: KeyboardEvent): void {
    const handled = [
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'Home',
      'End',
    ];
    if (!handled.includes(event.key)) return;

    event.preventDefault();
    event.stopPropagation();

    if (event.key === 'Home') {
      applyVolume(0);
      return;
    }

    if (event.key === 'End') {
      applyVolume(200);
      return;
    }

    const delta =
      event.key === 'ArrowUp' || event.key === 'ArrowRight'
        ? VOLUME_STEP
        : -VOLUME_STEP;
    applyVolume($player.volume + delta);
  }

  function toggleStageFullscreen(): void {
    toggleFullscreen(fullscreenTarget ?? videoEl?.parentElement ?? null);
  }

  function syncFullscreen(): void {
    isFullscreen = Boolean(document.fullscreenElement);
  }

  function isEditableTarget(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    if (!element) return false;

    return (
      element.tagName === 'INPUT' ||
      element.tagName === 'TEXTAREA' ||
      element.tagName === 'SELECT' ||
      element.isContentEditable
    );
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    if (isEditableTarget(event.target)) return;

    const target = event.target as HTMLElement | null;
    if (event.key.startsWith('Arrow') && target?.closest('[data-player-slider]')) return;

    switch (event.key) {
      case ' ':
      case 'Spacebar':
        event.preventDefault();
        void togglePlay();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        nudgeTime(-5);
        break;
      case 'ArrowRight':
        event.preventDefault();
        nudgeTime(5);
        break;
      case 'ArrowUp':
        event.preventDefault();
        applyVolume($player.volume + 5);
        break;
      case 'ArrowDown':
        event.preventDefault();
        applyVolume($player.volume - 5);
        break;
      case 'm':
      case 'M':
        event.preventDefault();
        handleMute();
        break;
      case 'f':
      case 'F':
        event.preventDefault();
        toggleStageFullscreen();
        break;
      default:
        break;
    }
  }

  onMount(() => {
    document.addEventListener('fullscreenchange', syncFullscreen);
    window.addEventListener('keydown', handleKeydown);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen);
      window.removeEventListener('keydown', handleKeydown);
      window.removeEventListener('blur', handleWindowBlur);

      if (previewSeekTimer !== null) {
        clearTimeout(previewSeekTimer);
        previewSeekTimer = null;
      }
    };
  });
</script>

<footer
  class="flex h-[52px] shrink-0 items-center gap-2 border-t border-vlc-border bg-vlc-app px-3"
  aria-label="Player controls"
>
  <!-- Off-screen media element used only to render hover thumbnails. -->
  <!-- svelte-ignore a11y-media-has-caption -->
  <video
    bind:this={previewVideo}
    class="pointer-events-none fixed left-[-9999px] top-0 h-px w-px opacity-0"
    muted
    preload="auto"
    playsinline
    aria-hidden="true"
    tabindex="-1"
    on:loadedmetadata={handlePreviewLoadedMetadata}
    on:loadeddata={drawPreviewFrame}
    on:seeked={drawPreviewFrame}
    on:error={handlePreviewError}
  ></video>

  <div class="flex shrink-0 items-center gap-1">
    <button
      type="button"
      class="flex h-8 w-8 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
      title="Previous"
      aria-label="Previous"
      on:click={goPrevious}
    >
      <SkipBack size={16} strokeWidth={1.75} aria-hidden="true" />
    </button>

    <button
      type="button"
      class="flex h-8 w-8 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
      title="Back 10 seconds"
      aria-label="Back 10 seconds"
      on:click={skipBackward10}
    >
      <span class="relative flex items-center justify-center">
        <RotateCcw size={16} strokeWidth={1.75} aria-hidden="true" />
        <span
          class="pointer-events-none absolute text-[7px] font-semibold leading-none tabular-nums"
          aria-hidden="true"
        >
          10
        </span>
      </span>
    </button>

    <button
      type="button"
      class="flex h-9 w-10 items-center justify-center rounded-control bg-vlc-orange text-white transition-[filter,background-color] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vlc-orange"
      title={$player.isPlaying ? 'Pause' : 'Play'}
      aria-label={$player.isPlaying ? 'Pause' : 'Play'}
      on:click={() => void togglePlay()}
    >
      {#if $player.isPlaying}
        <Pause size={18} fill="currentColor" strokeWidth={1.5} aria-hidden="true" />
      {:else}
        <Play size={18} fill="currentColor" strokeWidth={1.5} class="ml-0.5" aria-hidden="true" />
      {/if}
    </button>

    <button
      type="button"
      class="flex h-8 w-8 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
      title="Forward 10 seconds"
      aria-label="Forward 10 seconds"
      on:click={skipForward10}
    >
      <span class="relative flex items-center justify-center">
        <RotateCw size={16} strokeWidth={1.75} aria-hidden="true" />
        <span
          class="pointer-events-none absolute text-[7px] font-semibold leading-none tabular-nums"
          aria-hidden="true"
        >
          10
        </span>
      </span>
    </button>

    <button
      type="button"
      class="flex h-8 w-8 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
      title="Next"
      aria-label="Next"
      on:click={goNext}
    >
      <SkipForward size={16} strokeWidth={1.75} aria-hidden="true" />
    </button>
  </div>

  <span
    class="w-[58px] shrink-0 text-[11px] font-mono tabular-nums text-vlc-secondary"
    aria-label="Elapsed time"
  >
    {formatTime(elapsed)}
  </span>

  <div
    bind:this={seekTrack}
    class="group relative flex h-5 min-w-0 flex-1 cursor-pointer touch-none items-center"
    role="slider"
    tabindex="0"
    aria-label="Seek"
    aria-valuemin="0"
    aria-valuemax={Math.floor(duration)}
    aria-valuenow={Math.floor(elapsed)}
    aria-valuetext={formatTime(elapsed)}
    data-player-slider
    on:pointerdown={startScrub}
    on:pointermove={handleSeekPointerMove}
    on:pointerup={endScrub}
    on:pointercancel={cancelScrub}
    on:pointerleave={handleSeekLeave}
    on:blur={handleSeekBlur}
    on:keydown={handleSeekKeydown}
  >
    {#if waveActive}
      <!-- Audio tracks: SoundCloud-style peak strip. Click/drag/keyboard
           seeking and the hover timestamp card are the bar's own handlers
           (seekTrack below), reused unchanged. -->
      <canvas
        bind:this={waveCanvas}
        use:waveformCanvasAction
        class="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 text-vlc-orange transition-[height] duration-150 group-hover:h-2 group-focus-visible:h-2"
        aria-hidden="true"
      ></canvas>
    {:else}
      <div
        class="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-vlc-border transition-[height] duration-150 group-hover:h-2 group-focus-visible:h-2"
        aria-hidden="true"
      >
        {#if bufferedPct > 0}
          <div
            class="absolute inset-y-0 left-0 bg-vlc-borderStrong"
            style={`width: ${bufferedPct}%`}
          ></div>
        {/if}
        <div
          class="absolute inset-y-0 left-0 rounded-full bg-vlc-orange"
          style={`width: ${progressPct}%`}
        ></div>
      </div>
    {/if}

    <span
      class="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-vlc-text opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
      class:opacity-100={scrubbing}
      style={`left: ${progressPct}%; box-shadow: 0 0 0 3px rgb(var(--accent-rgb) / 0.18);`}
      aria-hidden="true"
    ></span>

    <div
      class="pointer-events-none absolute bottom-full z-50 mb-2 w-[128px] -translate-x-1/2 rounded-md border border-vlc-borderStrong bg-vlc-panel/95 p-1 shadow-lg backdrop-blur-sm"
      class:hidden={!previewVisible}
      style={`left: ${previewX}px;`}
      aria-hidden="true"
    >
      <div
        class="aspect-video w-full overflow-hidden rounded-[3px] bg-black"
        class:hidden={!previewFrameReady}
      >
        <canvas
          bind:this={previewCanvas}
          width={PREVIEW_WIDTH}
          height={PREVIEW_HEIGHT}
          class="h-full w-full object-cover"
        ></canvas>
      </div>
      <div
        class="px-0.5 pt-1 text-center font-mono text-[10px] tabular-nums text-vlc-secondary"
      >
        {formatTime(previewTime)}
      </div>
    </div>
  </div>

  <span
    class="w-[58px] shrink-0 text-right text-[11px] font-mono tabular-nums text-vlc-secondary"
    aria-label="Duration"
  >
    {formatTime(duration)}
  </span>

  {#if showNextPrompt}
    <button
      type="button"
      class="ml-1 flex h-6 shrink-0 items-center gap-1 rounded-control border border-vlc-orange/40 px-2 text-[10px] font-medium text-vlc-orangeText transition-colors hover:bg-vlc-orange/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
      title={nextPromptLabel}
      aria-label={nextPromptLabel}
      on:click={goNext}
    >
      <SkipForward size={12} strokeWidth={2} aria-hidden="true" />
      <span>Next</span>
    </button>
  {/if}

  {#if $layout.playerControls.volume}
  <div class="ml-1 flex shrink-0 items-center gap-1">
    <button
      type="button"
      class="flex h-8 w-8 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
      title={volumeMuted ? 'Unmute' : 'Mute'}
      aria-label={volumeMuted ? 'Unmute' : 'Mute'}
      on:click={handleMute}
    >
      {#if volumeMuted}
        <VolumeX size={17} strokeWidth={1.75} aria-hidden="true" />
      {:else}
        <Volume2 size={17} strokeWidth={1.75} aria-hidden="true" />
      {/if}
    </button>

    <div
      class="group relative flex h-5 w-[92px] shrink-0 cursor-pointer touch-none select-none items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
      role="slider"
      tabindex="0"
      aria-label="Volume"
      aria-valuemin="0"
      aria-valuemax="200"
      aria-valuenow={$player.volume}
      aria-valuetext={volumeMuted ? 'Muted' : `${$player.volume}%`}
      title={`Volume ${$player.volume}%`}
      data-player-slider
      on:pointerdown={startVolumeDrag}
      on:pointermove={moveVolumeDrag}
      on:pointerup={endVolumeDrag}
      on:pointercancel={cancelVolumeDrag}
      on:keydown={handleVolumeKeydown}
    >
      <div bind:this={volumeTrack} class="absolute inset-0" aria-hidden="true">
        <div class="absolute inset-0 [clip-path:polygon(0_0,0_100%,100%_0)]">
          <!-- Dim green silhouette keeps the cone shape visible below full boost. -->
          <div class="absolute inset-0 bg-[#3fd35f]/20 transition-colors group-hover:bg-[#3fd35f]/30 group-focus-visible:bg-[#3fd35f]/30"></div>
          <!-- VLC-style boost cone: green through 100%, lime across the
               100–200% zone. The gradient is sized to the full track so the
               colour zones stay fixed while the fill width grows. -->
          <div
            class="absolute inset-y-0 left-0"
            style={`width: ${$player.volume / 2}%; background: linear-gradient(to right, #22b14a 0%, #3fd35f 50%, #a3e635 100%); background-size: ${VOLUME_TRACK_WIDTH}px 100%;`}
          ></div>
        </div>
      </div>
    </div>
  </div>
  {/if}

  {#if hasDockControls}
    <div class="mx-1 h-4 w-px shrink-0 bg-vlc-border" aria-hidden="true"></div>
  {/if}

  <div class="flex shrink-0 items-center gap-0.5">
    {#if $layout.playerControls.audio}
    <button
      type="button"
      class="flex h-8 w-8 items-center justify-center rounded-control transition-colors hover:bg-vlc-raised hover:text-vlc-text"
      class:text-vlc-orangeText={$dockMode === 'audio'}
      class:text-vlc-secondary={$dockMode !== 'audio'}
      class:bg-vlc-card={$dockMode === 'audio'}
      title="Audio"
      aria-label="Open audio dock"
      aria-pressed={$dockMode === 'audio'}
      on:click={() => openDock('audio')}
    >
      <AudioLines size={18} strokeWidth={1.6} />
    </button>
    {/if}
    {#if $layout.playerControls.subtitles}
    <button
      type="button"
      class="flex h-8 w-8 items-center justify-center rounded-control transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
      class:text-vlc-orangeText={$dockMode === 'subtitles'}
      class:text-vlc-secondary={$dockMode !== 'subtitles'}
      class:bg-vlc-card={$dockMode === 'subtitles'}
      title="Subtitles"
      aria-label="Open subtitles dock"
      aria-pressed={$dockMode === 'subtitles'}
      on:click={() => openDock('subtitles')}
    >
      <Captions size={18} strokeWidth={1.6} aria-hidden="true" />
    </button>
    {/if}
    {#if $layout.playerControls.settings}
    <button
      type="button"
      class="flex h-8 w-8 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
      title="Settings"
      aria-label="Open settings"
      on:click={onSettings}
    >
      <Settings size={18} strokeWidth={1.6} aria-hidden="true" />
    </button>
    {/if}
    {#if $layout.playerControls.fullscreen}
    <button
      type="button"
      class="flex h-8 w-8 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
      title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
      aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
      on:click={toggleStageFullscreen}
    >
      {#if isFullscreen}
        <Minimize size={18} strokeWidth={1.6} aria-hidden="true" />
      {:else}
        <Maximize size={18} strokeWidth={1.6} aria-hidden="true" />
      {/if}
    </button>
    {/if}
    {#if $layout.playerControls.queue}
    <button
      type="button"
      class="flex h-8 w-8 items-center justify-center rounded-control transition-colors hover:bg-vlc-raised hover:text-vlc-text"
      class:text-vlc-orangeText={$dockMode === 'queue'}
      class:text-vlc-secondary={$dockMode !== 'queue'}
      class:bg-vlc-card={$dockMode === 'queue'}
      title="Playing queue"
      aria-label="Open playing queue"
      aria-pressed={$dockMode === 'queue'}
      on:click={() => openDock('queue')}
    >
      <ListVideo size={18} strokeWidth={1.6} />
    </button>
    {/if}
  </div>
</footer>
