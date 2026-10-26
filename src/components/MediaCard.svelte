<script lang="ts">
  import type { MediaItem } from '../lib/mock';

  export let item: MediaItem;
  export let onSelect: (item: MediaItem) => void = () => {};

  $: progress = Math.min(Math.max(item.progress, 0), 1);
  $: hasProgress = progress > 0;
  $: progressPercent = `${progress * 100}%`;
</script>

<button
  type="button"
  class="group block w-full cursor-pointer text-left focus:outline-none"
  aria-label={`Open ${item.title}`}
  title={item.title}
  on:click={() => onSelect(item)}
>
  <div
    class="relative aspect-video w-full overflow-hidden rounded-lg border border-vlc-border bg-[linear-gradient(180deg,#1A1A1A_0%,#0F0F0F_100%)] transition-[border-color,filter] duration-150 group-hover:border-[#3A3A3A] group-hover:brightness-105 group-focus-visible:border-vlc-orange/70 group-focus-visible:ring-1 group-focus-visible:ring-vlc-orange/50"
  >
    {#if item.thumbnailPath}
      <img
        src={item.thumbnailPath}
        alt=""
        class="h-full w-full object-cover"
        loading="lazy"
        draggable="false"
      />
    {:else}
      <div class="flex h-full w-full items-center justify-center" aria-hidden="true">
        <svg
          viewBox="0 0 24 24"
          class="h-9 w-9 text-white opacity-[0.18]"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M9 6.4v11.2L18.8 12 9 6.4Z" />
        </svg>
      </div>
    {/if}

    {#if hasProgress}
      <div class="absolute inset-x-0 bottom-0 h-[2px] bg-black/40" aria-hidden="true">
        <div class="h-full bg-vlc-orange" style={`width: ${progressPercent}`}></div>
      </div>
    {/if}
  </div>

  <div class="mt-2.5 truncate text-[11px] leading-4 text-vlc-secondary">
    {item.title}
  </div>
</button>
