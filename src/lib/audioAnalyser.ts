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
 */

const MUTE_GUARD_MS = 2000;
/** Signal sampling granularity for the mute guard (4x per second). */
const MUTE_GUARD_POLL_MS = 250;

let context: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let source: MediaElementAudioSourceNode | null = null;
/** Element the current source node belongs to (sources are one per element). */
let sourceEl: HTMLMediaElement | null = null;

/** True once the mute guard has proven the analyser dead. */
let analyserUnusable = false;
let watchFrame = 0;
let silentSince = 0;
let lastPoll = 0;

/**
 * Attach (or reuse) the analysis graph for `el` and return its analyser.
 * Returns null when Web Audio is unavailable or the element source cannot
 * be created — the panel then stays on its synthetic fallback. Safe to call
 * on every play event: the context and element source are created once.
 */
export function ensureAudioAnalyser(el: HTMLMediaElement): AnalyserNode | null {
  if (!el) return null;

  try {
    let ctx = context;
    let node = analyser;

    if (!ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return null;

      ctx = new Ctor();
      node = ctx.createAnalyser();
      node.fftSize = 2048;
      node.smoothingTimeConstant = 0.8;

      context = ctx;
      analyser = node;
    }
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
    node.connect(ctx.destination);
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
