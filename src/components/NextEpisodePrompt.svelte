<script lang="ts">
  import { currentTrack, next, player, type Track } from '../stores/player';

  /** Seconds before the end at which the up-next prompt appears. */
  const PROMPT_WINDOW_SECONDS = 20;

  export let hasMedia = false;

  /** Identity of the track the prompt state currently applies to. */
  let identity = '';
  let cancelledForIdentity = '';
  let autoAdvanced = false;

  $: identity = `${$currentTrack?.id ?? ''}:${$currentTrack?.src ?? ''}`;
  $: nextTrack = $player.queue[$player.currentIndex + 1] ?? null;
  $: duration = $player.duration;
  $: remaining = duration - $player.currentTime;
  $: remainingSeconds = Math.max(0, Math.ceil(remaining));
  $: promptVisible =
    hasMedia &&
    nextTrack !== null &&
    duration > 0 &&
    remaining > 0 &&
    remaining <= PROMPT_WINDOW_SECONDS &&
    cancelledForIdentity !== identity;

  // Reset the per-track dismissal and auto-advance guard when the media changes.
  $: resetTrackState(identity);

  // Advance once the countdown reaches zero. The player view also guards its
  // `ended` handler so this cannot advance twice for the same track.
  $: maybeAutoAdvance(hasMedia, nextTrack, duration, remaining, $player.isPlaying);

  function resetTrackState(_nextIdentity: string): void {
    cancelledForIdentity = '';
    autoAdvanced = false;
  }

  function maybeAutoAdvance(
    available: boolean,
    upcoming: Track | null,
    total: number,
    left: number,
    playing: boolean,
  ): void {
    if (autoAdvanced || !available || !upcoming || !playing) return;
    if (!Number.isFinite(total) || total <= 0) return;
    if (!Number.isFinite(left) || left > 0) return;

    autoAdvanced = true;
    next();
  }

  function playNow(): void {
    cancelledForIdentity = identity;
    autoAdvanced = true;
    next();
  }

  function cancel(): void {
    cancelledForIdentity = identity;
  }
</script>

{#if promptVisible && nextTrack}
  <div
    class="absolute bottom-20 right-4 z-30 w-72 max-w-[calc(100%-2rem)] rounded-panel border border-vlc-borderStrong bg-vlc-panel/95 p-3 text-vlc-text shadow-2xl backdrop-blur-md"
    role="status"
    aria-live="polite"
    aria-atomic="false"
  >
    <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-vlc-muted">
      Up next
    </p>
    <p class="mt-1 truncate text-[13px] font-medium leading-5 text-vlc-text" title={nextTrack.title}>
      {nextTrack.title}
    </p>
    <p class="mt-0.5 text-[11px] tabular-nums text-vlc-secondary">
      Playing in {remainingSeconds}s
    </p>

    <div class="mt-2.5 flex items-center gap-1.5">
      <button
        type="button"
        class="rounded-control bg-vlc-orange px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-vlc-orangeDark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60"
        aria-label={`Play ${nextTrack.title} now`}
        on:click={playNow}
      >
        Play now
      </button>
      <button
        type="button"
        class="rounded-control border border-vlc-border bg-vlc-raised px-2.5 py-1 text-[11px] font-medium text-vlc-secondary transition-colors hover:border-vlc-borderStrong hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60"
        on:click={cancel}
      >
        Cancel
      </button>
    </div>
  </div>
{/if}
