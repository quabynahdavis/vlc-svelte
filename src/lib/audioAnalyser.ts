/**
 * Real audio analysis for the dock visualizer.
 *
 * Two Web Audio quirks shape this module:
 *
 * 1. Once a media element is wired through `createMediaElementSource`, ALL of
 *    its audio flows through the graph — nothing reaches the speakers unless
 *    the graph ends at `ctx.destination`. The source is therefore created at
 *    most once per element (a second `createMediaElementSource` for the same
 *    element throws), and the chain is always source → analyser →
 *    destination.
 * 2. Autoplay policy suspends AudioContexts created without a user gesture,
 *    so the context is created lazily on first play and `resume()`d on every
 *    play event afterwards.
 *
 * A mute guard watches the analyser while the element is playing: if it
 * reports all-zero data for more than two seconds at volume > 0 (a host
 * where element sources never carry data), the analyser is marked unusable
 * and the visualizer panel falls back to its synthetic animation. The graph
 * stays connected so audio keeps flowing either way.
 *
 * Native playback does not use the media element. libvlc's audio callbacks
 * replace the normal output, and `startNativePcmPlayback` plays the
 * `vlcaudio://` chunks through GainNode → AnalyserNode → destination.
 */

const MUTE_GUARD_MS = 2000;
/** Signal sampling granularity for the mute guard (4x per second). */
const MUTE_GUARD_POLL_MS = 250;

let context: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let source: MediaElementAudioSourceNode | null = null;
/** Element the current source node belongs to (sources are one per element). */
let sourceEl: HTMLMediaElement | null = null;
/** `analyser → destination` is already connected. A second connect() throws. */
let analyserToDestination = false;

/** True once the mute guard has proven the analyser dead. */
let analyserUnusable = false;
let watchFrame = 0;
let silentSince = 0;
let lastPoll = 0;

const NATIVE_PCM_URL = 'vlcaudio://localhost/pcm';
/** Header: seq u64, generation u32, rate u32, channels u32, frames u32. */
const NATIVE_PCM_HEADER_BYTES = 24;
/** Keep this much scheduled audio. Longer than this, leave the ring alone. */
const NATIVE_PCM_MAX_LEAD_SEC = 0.12;
/** First buffer after an underrun starts this far ahead of `currentTime`. */
const NATIVE_PCM_START_LEAD_SEC = 0.04;

let nativeActive = false;
let nativePlaying = false;
let nativeAudible = true;
let nativeGain: GainNode | null = null;
let nativeRaf = 0;
let nativeFetchInFlight = false;
let nativeEpoch = 0;
let nativeNextTime = 0;
let nativeGeneration = -1;
let nativeScheduled: AudioBufferSourceNode[] = [];

function audioContextCtor(): typeof AudioContext | null {
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ??
    null
  );
}

/** Create the shared context and analyser once. Does not attach a source. */
function ensureGraph(): boolean {
  if (context && analyser) return true;

  const Ctor = audioContextCtor();
  if (!Ctor) return false;

  const ctx = new Ctor();
  const node = ctx.createAnalyser();
  node.fftSize = 2048;
  node.smoothingTimeConstant = 0.8;
  context = ctx;
  analyser = node;
  return true;
}

function connectAnalyserToDestination(): void {
  if (!context || !analyser || analyserToDestination) return;
  analyser.connect(context.destination);
  analyserToDestination = true;
}

/**
 * Attach (or reuse) the analysis graph for `el` and return its analyser.
 * Returns null when Web Audio is unavailable or the element source cannot
 * be created — the panel then stays on its synthetic fallback. Safe to call
 * on every play event: the context and element source are created once.
 */
export function ensureAudioAnalyser(el: HTMLMediaElement): AnalyserNode | null {
  if (!el) return null;

  try {
    if (!ensureGraph()) return null;
    const ctx = context;
    const node = analyser;
    if (!node || !ctx) return null;

    // At most one source per element: creating a second for the same element
    // throws, and the old element's source must stay routed (see detach).
    if (sourceEl !== el) {
      if (source) {
        try {
          source.disconnect();
        } catch {
          // Already torn down; nothing to do.
        }
        source = null;
      }
      sourceEl = el;
      source = ctx.createMediaElementSource(el);
      source.connect(node);
    }

    // The graph must end at destination or the element goes fully silent.
    connectAnalyserToDestination();
    startMuteGuard(el);
    return node;
  } catch (error) {
    console.warn('Audio analyser could not be attached.', error);
    return null;
  }
}

/**
 * Resume the (autoplay-suspended) context. Wired into the player's play
 * event; a no-op when no context exists yet.
 */
export async function resumeAudioAnalyser(): Promise<void> {
  if (!context || context.state === 'running') return;

  try {
    await context.resume();
  } catch (error) {
    console.warn('Audio context could not be resumed.', error);
  }
}

/** The live analyser, or null before the first play gesture. */
export function getAudioAnalyser(): AnalyserNode | null {
  return analyser;
}

/** True when the mute guard has proven the analyser reports only zeros. */
export function isAudioAnalyserUsable(): boolean {
  return analyser !== null && !analyserUnusable;
}

/**
 * Best-effort teardown of the panel-side analysis state. The element's
 * source node is deliberately left routed to `ctx.destination` — undoing the
 * graph would permanently mute the element (a routed element can never be
 * un-routed), so "detaching" only stops the mute guard and clears flags.
 */
export function detachAudioAnalyser(): void {
  stopMuteGuard();
  analyserUnusable = false;
}

/** Watch the analyser for a dead feed while the element is actually playing. */
function startMuteGuard(el: HTMLMediaElement): void {
  stopMuteGuard();
  analyserUnusable = false;
  silentSince = 0;
  lastPoll = 0;
  if (!analyser) return;

  const scratch = new Uint8Array(analyser.frequencyBinCount);

  const step = (now: number): void => {
    watchFrame = requestAnimationFrame(step);

    if (
      el.paused ||
      el.muted ||
      el.volume <= 0 ||
      !analyser ||
      analyserUnusable
    ) {
      silentSince = 0;
      return;
    }
    if (now - lastPoll < MUTE_GUARD_POLL_MS) return;
    lastPoll = now;

    analyser.getByteFrequencyData(scratch);
    const hasSignal = scratch.some((value) => value > 0);
    if (hasSignal) {
      silentSince = 0;
      return;
    }

    if (silentSince === 0) {
      silentSince = now;
    } else if (now - silentSince > MUTE_GUARD_MS) {
      // Keep the graph connected (audio keeps flowing); the panel reads
      // `isAudioAnalyserUsable()` and falls back to its synthetic bars.
      analyserUnusable = true;
      stopMuteGuard();
    }
  };

  watchFrame = requestAnimationFrame(step);
}

function stopMuteGuard(): void {
  if (watchFrame) {
    cancelAnimationFrame(watchFrame);
    watchFrame = 0;
  }
}

/**
 * Native playback plays libvlc's PCM through this graph
 * (GainNode → AnalyserNode → destination) instead of the media element.
 * HTML5 keeps `createMediaElementSource`. The two sources can share the
 * analyser; native mode leaves the element without a src.
 *
 * The gain node is only a mute/0% switch. Levels from 1–200% are already
 * in the samples (libvlc up to 125, tanh soft clip above that).
 */
export function setNativePcmAudible(audible: boolean): void {
  nativeAudible = audible;
  if (nativeGain) nativeGain.gain.value = audible ? 1 : 0;
}

function ensureNativeGain(): GainNode | null {
  if (!ensureGraph() || !context || !analyser) return null;
  if (!nativeGain) {
    nativeGain = context.createGain();
    nativeGain.connect(analyser);
  }
  nativeGain.gain.value = nativeAudible ? 1 : 0;
  connectAnalyserToDestination();
  return nativeGain;
}

function stopNativeSources(): void {
  for (const node of nativeScheduled) {
    try {
      node.onended = null;
      node.stop();
    } catch {
      // Already stopped or not yet started.
    }
    try {
      node.disconnect();
    } catch {
      // Already disconnected.
    }
  }
  nativeScheduled = [];
  nativeNextTime = 0;
}

function dropEndedSource(node: AudioBufferSourceNode): void {
  const index = nativeScheduled.indexOf(node);
  if (index >= 0) nativeScheduled.splice(index, 1);
}

function scheduleNativePcm(samples: Float32Array, frames: number, rate: number): void {
  const gain = ensureNativeGain();
  const ctx = context;
  if (!gain || !ctx || frames <= 0 || !nativePlaying) return;

  const now = ctx.currentTime;
  if (nativeNextTime < now + 0.005) {
    nativeNextTime = now + NATIVE_PCM_START_LEAD_SEC;
  }

  const buffer = ctx.createBuffer(2, frames, rate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  for (let index = 0; index < frames; index += 1) {
    left[index] = samples[index * 2] ?? 0;
    right[index] = samples[index * 2 + 1] ?? 0;
  }

  const node = ctx.createBufferSource();
  node.buffer = buffer;
  node.connect(gain);
  node.onended = () => dropEndedSource(node);
  node.start(nativeNextTime);
  nativeNextTime += frames / rate;
  nativeScheduled.push(node);
}

function parseNativePcm(buffer: ArrayBuffer): {
  generation: number;
  rate: number;
  frames: number;
  samples: Float32Array;
} | null {
  if (buffer.byteLength < NATIVE_PCM_HEADER_BYTES) return null;
  const view = new DataView(buffer);
  const generation = view.getUint32(8, true);
  const rate = view.getUint32(12, true);
  const channels = view.getUint32(16, true);
  const frames = view.getUint32(20, true);
  if (channels !== 2 || rate < 8000 || rate > 192000 || frames === 0) return null;
  const sampleCount = frames * channels;
  const bytes = sampleCount * 4;
  if (buffer.byteLength < NATIVE_PCM_HEADER_BYTES + bytes) return null;
  const samples = new Float32Array(sampleCount);
  samples.set(new Float32Array(buffer, NATIVE_PCM_HEADER_BYTES, sampleCount));
  return { generation, rate, frames, samples };
}

async function pullNativePcm(epoch: number): Promise<void> {
  const response = await fetch(NATIVE_PCM_URL);
  if (epoch !== nativeEpoch || !nativeActive || !nativePlaying) return;
  if (!response.ok || response.status === 204) return;

  const body = await response.arrayBuffer();
  if (epoch !== nativeEpoch || !nativeActive || !nativePlaying) return;
  const chunk = parseNativePcm(body);
  if (!chunk) return;

  if (nativeGeneration !== chunk.generation) {
    stopNativeSources();
    nativeGeneration = chunk.generation;
  }
  scheduleNativePcm(chunk.samples, chunk.frames, chunk.rate);
  const ctx = context;
  if (ctx && ctx.state === 'suspended') {
    void ctx.resume().catch(() => {
      // Autoplay can still be suspended; the next play gesture resumes it.
    });
  }
}

function nativePcmTick(): void {
  nativeRaf = requestAnimationFrame(nativePcmTick);
  if (!nativeActive || !nativePlaying || nativeFetchInFlight) return;

  const ctx = context;
  if (ctx && nativeNextTime > ctx.currentTime + NATIVE_PCM_MAX_LEAD_SEC) return;

  nativeFetchInFlight = true;
  const epoch = nativeEpoch;
  void pullNativePcm(epoch)
    .catch(() => {
      // Browser preview, or the scheme is gone during teardown.
    })
    .finally(() => {
      if (epoch === nativeEpoch) nativeFetchInFlight = false;
    });
}

/**
 * Start polling `vlcaudio://` and playing the chunks. Idempotent.
 * No-op outside a native playback session; call `stopNativePcmPlayback`
 * when leaving native mode.
 */
export function startNativePcmPlayback(): void {
  if (nativeActive) return;
  nativeActive = true;
  nativeEpoch += 1;
  nativeGeneration = -1;
  nativeNextTime = 0;
  ensureNativeGain();
  if (context && context.state === 'suspended') {
    void context.resume().catch(() => {
      // Resumed again from the player once a gesture has landed.
    });
  }
  if (!nativeRaf) nativeRaf = requestAnimationFrame(nativePcmTick);
}

/** Drop scheduled native buffers. The next chunk starts a fresh timeline. */
export function resetNativePcmSchedule(): void {
  nativeEpoch += 1;
  nativeFetchInFlight = false;
  nativeGeneration = -1;
  stopNativeSources();
}

/**
 * Pause or resume the native graph. Pausing stops buffers already queued
 * in the webview so mute/pause are not waiting on the ring to drain.
 */
export function setNativePcmPlaying(playing: boolean): void {
  if (playing) {
    // Play is a user gesture often enough to unstick autoplay suspension.
    // Resume even when the flag is already true (the context may be new).
    void resumeAudioAnalyser();
  }
  if (nativePlaying === playing) return;
  nativePlaying = playing;
  if (!playing) {
    nativeEpoch += 1;
    nativeFetchInFlight = false;
    stopNativeSources();
  }
}

/** Tear the native PCM graph down. HTML5's media-element source stays. */
export function stopNativePcmPlayback(): void {
  if (!nativeActive && nativeScheduled.length === 0 && !nativeRaf) return;
  nativeActive = false;
  nativePlaying = false;
  nativeEpoch += 1;
  nativeFetchInFlight = false;
  nativeGeneration = -1;
  if (nativeRaf) {
    cancelAnimationFrame(nativeRaf);
    nativeRaf = 0;
  }
  stopNativeSources();
  if (nativeGain) {
    try {
      nativeGain.disconnect();
    } catch {
      // Already disconnected.
    }
    nativeGain = null;
  }
}
