<script lang="ts">
  import { ListMusic } from 'lucide-svelte';
  import { isTrackDrag, readTrackDrag } from '../../lib/dragTrack';
  import { addToQueue, playAt, player } from '../../stores/player';

  let dragActive = false;

  function pad(value: number): string {
    return String(value).padStart(2, '0');
  }

  function formatDuration(value: number): string {
    if (!Number.isFinite(value) || value <= 0) return '--:--';

    const total = Math.floor(value);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;

    return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
  }

  function handleDragOver(event: DragEvent): void {
    if (!isTrackDrag(event)) {
      dragActive = false;
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    dragActive = true;
  }

  function handleDragLeave(event: DragEvent): void {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget instanceof Node && event.currentTarget.contains(next)) {
      return;
    }
    dragActive = false;
  }

  function handleDrop(event: DragEvent): void {
    if (!isTrackDrag(event)) {
      dragActive = false;
      return;
    }
    event.preventDefault();
    dragActive = false;

    const track = readTrackDrag(event);
    if (track) addToQueue(track);
  }
</script>

<div
  class="flex min-h-full flex-col"
  data-queue-panel
  on:dragover={handleDragOver}
  on:dragleave={handleDragLeave}
  on:drop={handleDrop}
>
  {#if dragActive}
    <div
      class="pointer-events-none sticky top-0 z-10 mx-2 mb-2 flex items-center justify-center gap-1.5 rounded-control border border-dashed border-vlc-orange/60 bg-vlc-panel/95 px-2 py-2 text-[11px] text-vlc-orangeText shadow-sm"
      role="status"
    >
      <ListMusic size={13} strokeWidth={2} aria-hidden="true" />
      Drop to add to the queue
    </div>
  {/if}
  {#if $player.queue.length === 0}
    <div class="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <ListMusic size={28} strokeWidth={1.4} class="text-vlc-muted/60" aria-hidden="true" />
      <p class="text-[13px] leading-5 text-vlc-muted">Queue is empty</p>
    </div>
  {:else}
    <ul class="py-1" aria-label="Playing queue">
      {#each $player.queue as track, index (track.id)}
        {@const active = $player.currentIndex === index}
        <li>
          <button
            type="button"
            class="relative flex h-12 w-full items-center gap-3 px-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-vlc-orange/40"
            class:bg-vlc-raised={active}
            class:hover:bg-vlc-panelAlt={!active}
            aria-current={active ? 'true' : undefined}
            data-queue-item
            on:click={() => playAt(index)}
          >
            {#if active}
              <span
                class="absolute inset-y-0 left-0 w-[2px] bg-vlc-orange"
                aria-hidden="true"
              ></span>
            {/if}

            <span
              class="w-5 shrink-0 text-[11px] tabular-nums"
              class:text-vlc-orangeText={active}
              class:text-vlc-muted={!active}
            >
              {pad(index + 1)}
            </span>

            <span
              class="min-w-0 flex-1 truncate text-[13px] leading-5"
              class:text-vlc-orangeText={active}
              class:text-vlc-secondary={!active}
            >
              {track.title}
            </span>

            <span
              class="shrink-0 font-mono text-[11px] tabular-nums"
              class:text-vlc-secondary={active}
              class:text-vlc-muted={!active}
            >
              {formatDuration(track.duration)}
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>
