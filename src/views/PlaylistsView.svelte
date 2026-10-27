<script lang="ts">
  import { ArrowLeft, Plus, MoreHorizontal, GripVertical, Search } from 'lucide-svelte';
  import { DEMO_MEDIA_SRC, playlists } from '../lib/mock';
  import { playlistsSelectedId, playlistsSort } from '../stores/playlists';
  import { navigate } from '../stores/navigation';
  import { setQueue, type Track } from '../stores/player';
  import FuzzySearch from '../components/FuzzySearch.svelte';

  $: sort = $playlistsSort;
  $: selected = $playlistsSelectedId;

  let query = '';
  function handleSearch(e: CustomEvent<string>) {
    query = e.detail;
  }

  $: filtered = playlists.filter(item => item.name.toLowerCase().includes(query));

  function formatDuration(s: number) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h) return `${h}h ${m}m`;
    return `${m}m`;
  }

  function openPlaylist(id: string) {
    playlistsSelectedId.set(id);
  }

  function closePlaylist() {
    playlistsSelectedId.set(null);
  }

  function handleTrackContext(e: MouseEvent, playlistId: string, trackId: string) {
    e.preventDefault();
  }

  /** Queue the open playlist through the shared demo clip and jump to the player. */
  function playPlaylistTrack(index: number) {
    if (!activePlaylist) return;

    const tracks: Track[] = activePlaylist.tracks.map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      duration: t.durationSeconds,
      src: DEMO_MEDIA_SRC,
    }));

    setQueue(tracks, index);
    navigate('home');
  }

  $: activePlaylist = playlists.find(p => p.id === selected);
</script>

<div class="flex h-full bg-vlc-app">
  <aside class="w-[200px] shrink-0 border-r border-vlc-border bg-vlc-panel flex flex-col">
    <header class="flex h-11 items-center gap-2 border-b border-vlc-border px-3">
      <button class="flex h-7 w-7 items-center justify-center rounded-control text-vlc-secondary hover:bg-vlc-card" on:click={closePlaylist} aria-label="Back">
        <ArrowLeft size={16} strokeWidth={1.75} />
      </button>
      <h2 class="min-w-0 flex-1 truncate text-[13px] font-medium text-white">Playlists</h2>
      <button class="flex h-7 w-7 items-center justify-center rounded-control text-vlc-secondary hover:bg-vlc-card" title="Create Playlist" on:click={() => {}}>
        <Plus size={16} strokeWidth={1.75} />
      </button>
    </header>

    <div class="flex-1 overflow-y-auto px-2 py-2">
      <div class="space-y-0.5">
        {#each filtered as pl}
          <button class="flex h-9 w-full items-center gap-3 rounded-control px-3 text-left text-[13px] {selected === pl.id ? 'bg-vlc-card text-white' : 'text-vlc-secondary hover:bg-vlc-card hover:text-white' }" on:click={() => openPlaylist(pl.id)}>
            <span class="shrink-0">📋</span>
            <span class="truncate">{pl.name}</span>
          </button>
        {/each}
      </div>
    </div>
  </aside>

  <div class="flex min-w-0 flex-1 flex-col">
    {#if !selected}
      <div class="flex h-full items-center justify-center text-vlc-muted">Select a playlist or create new</div>
    {:else}
      <header class="flex h-16 shrink-0 items-center gap-3 border-b border-vlc-border px-6">
        <button class="flex h-8 w-8 items-center justify-center rounded-control text-vlc-secondary hover:bg-vlc-raised" on:click={closePlaylist}>
          <ArrowLeft size={18} strokeWidth={1.75} />
        </button>
        <nav class="flex min-w-0 items-center gap-2 text-[13px]">
          <span class="text-vlc-secondary">Playlists</span>
          <span class="text-vlc-muted">/</span>
          <span class="text-white truncate">{activePlaylist?.name}</span>
        </nav>
        <div class="ml-auto flex items-center gap-2">
          <div class="w-56">
            <FuzzySearch placeholder="Search…" on:search={handleSearch} />
          </div>
          <button class="flex h-8 w-8 items-center justify-center rounded-control text-vlc-secondary hover:bg-vlc-card" title="Sort">
            <span class="text-xs">Sort: {sort}</span>
          </button>
        </div>
      </header>

      <div class="min-h-0 flex-1 overflow-y-auto">
        <div class="border-t border-vlc-border">
          <div class="grid grid-cols-[36px_1fr_120px_100px_40px] items-center gap-3 px-6 py-2 text-[11px] uppercase text-vlc-muted">#<span>Title</span><span class="text-right">Artist</span><span class="text-right">Duration</span><span></span></div>
          {#each activePlaylist?.tracks ?? [] as track, i (track.id)}
            <div
              class="grid grid-cols-[36px_1fr_120px_100px_40px] items-center gap-3 rounded-control border-t border-vlc-border/30 px-6 py-2 text-[13px] text-vlc-secondary hover:bg-vlc-card"
              role="button"
              tabindex="0"
              aria-label={`Play ${track.title}`}
              on:click={() => playPlaylistTrack(i)}
              on:keydown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  playPlaylistTrack(i);
                }
              }}
            >
              <span class="text-vlc-muted">{i + 1}</span>
              <span class="truncate text-white">{track.title}</span>
              <span class="truncate">{track.artist}</span>
              <span class="text-right text-vlc-muted">{formatDuration(track.durationSeconds)}</span>
              <button class="flex h-6 w-6 items-center justify-center text-vlc-muted hover:text-white" on:click|stopPropagation={(e) => handleTrackContext(e, activePlaylist?.id ?? '', track.id)} on:contextmenu={(e) => handleTrackContext(e, activePlaylist?.id ?? '', track.id)}>
                <GripVertical size={14} strokeWidth={1.75} />
              </button>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>
