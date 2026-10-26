<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import {
    ArrowDownUp,
    ArrowLeft,
    Ellipsis,
    ExternalLink,
    LayoutGrid,
    ListMusic,
    Plus,
    Search,
  X,
} from 'lucide-svelte';

  type Playlist = {
    id: string;
    name: string;
  };

  const dispatch = createEventDispatcher<{ back: void; close: void }>();

  const playlists: Playlist[] = [
    { id: 'cool-songs', name: 'Cool Songs' },
    { id: 'anime-to-watch', name: 'Anime to Watch' },
  ];

  let activePlaylist = 'cool-songs';
</script>

<aside
  class="flex h-full w-[300px] shrink-0 flex-col border-r border-vlc-border bg-vlc-panel"
  aria-label="Playlists"
>
  <header class="flex h-11 shrink-0 items-center gap-2 border-b border-vlc-border px-3">
    <button
      type="button"
      class="flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-card hover:text-white"
      title="Back"
      aria-label="Back"
      on:click={() => dispatch('back')}
    >
      <ArrowLeft size={16} strokeWidth={1.75} />
    </button>

    <h2 class="min-w-0 flex-1 truncate text-[13px] font-medium text-vlc-text">Playlists</h2>

    <div class="flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        class="flex h-7 w-7 items-center justify-center rounded-control text-vlc-muted transition-colors hover:bg-vlc-card hover:text-white"
        title="More options"
        aria-label="More options"
      >
        <Ellipsis size={18} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        class="flex h-7 w-7 items-center justify-center rounded-control text-vlc-muted transition-colors hover:bg-vlc-card hover:text-white"
        title="Open in new window"
        aria-label="Open in new window"
      >
        <ExternalLink size={16} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        class="flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-vlc-muted transition-colors hover:bg-vlc-card hover:text-white"
        title="Close playlist"
        aria-label="Close playlist"
        on:click={() => dispatch('close')}
      >
        <X size={16} strokeWidth={1.75} />
      </button>
    </div>
  </header>

  <div class="flex h-10 shrink-0 items-center justify-between border-b border-vlc-border px-4">
    <span class="text-[11px] text-vlc-secondary">{playlists.length} items</span>

    <div class="flex items-center gap-3">
      <button
        type="button"
        class="flex h-6 w-6 items-center justify-center rounded-control text-vlc-muted transition-colors hover:text-white"
        title="Sort"
        aria-label="Sort playlists"
      >
        <ArrowDownUp size={18} strokeWidth={1.6} />
      </button>
      <button
        type="button"
        class="flex h-6 w-6 items-center justify-center rounded-control text-vlc-muted transition-colors hover:text-white"
        title="Grid view"
        aria-label="Grid view"
      >
        <LayoutGrid size={18} strokeWidth={1.6} />
      </button>
      <button
        type="button"
        class="flex h-6 w-6 items-center justify-center rounded-control text-vlc-muted transition-colors hover:text-white"
        title="Search playlists"
        aria-label="Search playlists"
      >
        <Search size={18} strokeWidth={1.6} />
      </button>
    </div>
  </div>

  <div class="min-h-0 flex-1 overflow-y-auto px-2 py-2">
    <button
      type="button"
      class="flex h-9 w-full items-center gap-3 rounded-control px-3 text-left text-[13px] text-vlc-secondary transition-colors hover:bg-vlc-card hover:text-white"
    >
      <Plus size={16} strokeWidth={1.75} class="shrink-0 text-vlc-muted" />
      <span class="truncate">Create playlist</span>
    </button>

    <div class="mx-1 my-2 h-px bg-vlc-border" aria-hidden="true"></div>

    <div class="space-y-0.5">
      {#each playlists as playlist (playlist.id)}
        <button
          type="button"
          class="flex h-9 w-full items-center gap-3 rounded-control px-3 text-left text-[13px] transition-colors"
          class:bg-vlc-card={activePlaylist === playlist.id}
          class:text-white={activePlaylist === playlist.id}
          class:text-vlc-secondary={activePlaylist !== playlist.id}
          class:hover:bg-vlc-card={activePlaylist !== playlist.id}
          class:hover:text-white={activePlaylist !== playlist.id}
          aria-current={activePlaylist === playlist.id ? 'true' : undefined}
          on:click={() => (activePlaylist = playlist.id)}
        >
          <ListMusic size={16} strokeWidth={1.75} class="shrink-0" />
          <span class="truncate">{playlist.name}</span>
        </button>
      {/each}
    </div>
  </div>
</aside>
