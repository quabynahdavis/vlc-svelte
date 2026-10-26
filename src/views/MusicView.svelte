<script lang="ts">
  import { ArrowLeft, ArrowUpDown, ChevronRight, LayoutGrid, LayoutList, Search } from 'lucide-svelte';
  import { artists } from '../lib/mock';
  import { musicBreadcrumb, selectedArtistId, selectedAlbumId, musicViewMode, musicSort } from '../stores/music';
  import FuzzySearch from '../components/FuzzySearch.svelte';

  let localBreadcrumb = $musicBreadcrumb;
  $: localBreadcrumb = $musicBreadcrumb;

  let query = '';
  function handleSearch(e: CustomEvent<string>) {
    query = e.detail;
  }

  $: artist = $selectedArtistId ? artists.find(a => a.id === $selectedArtistId) : null;
  $: album = $selectedAlbumId && artist ? artist.albums.find(al => al.id === $selectedAlbumId) : null;

  $: isArtistView = !!$selectedArtistId && !$selectedAlbumId;
  $: isAlbumView = !!$selectedArtistId && !!$selectedAlbumId;

  $: filteredArtists = artists.filter(item => item.name.toLowerCase().includes(query));
  $: filteredAlbums = artist ? artist.albums.filter(al => !query || al.title.toLowerCase().includes(query) || al.year.toString().includes(query)) : [];
  $: filteredTracks = album ? album.tracks.filter(t => !query || t.title.toLowerCase().includes(query)) : [];

  function goBack() {
    if ($selectedAlbumId) {
      selectedAlbumId.set(null);
      musicBreadcrumb.set([...$musicBreadcrumb].slice(0, -1));
    } else if ($selectedArtistId) {
      selectedArtistId.set(null);
      selectedAlbumId.set(null);
      musicBreadcrumb.set(['Videos', 'Music']);
    }
  }

  function selectArtist(a) {
    selectedArtistId.set(a.id);
    selectedAlbumId.set(null);
    musicBreadcrumb.set(['Videos', 'Music', a.name]);
  }

  function selectAlbum(al) {
    if (!artist) return;
    selectedAlbumId.set(al.id);
    musicBreadcrumb.set(['Videos', 'Music', artist.name, al.title]);
  }

  function formatDuration(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  function toggleView() {
    musicViewMode.set($musicViewMode === 'grid' ? 'list' : 'grid');
  }
</script>

<div class="flex h-full min-h-0 flex-col bg-vlc-app">
  <header class="flex h-16 shrink-0 items-center gap-3 border-b border-vlc-border px-6">
    <button
      type="button"
      class="flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/50"
      title="Back"
      aria-label="Go back"
      on:click={goBack}
    >
      <ArrowLeft size={18} strokeWidth={1.75} />
    </button>

    <nav class="flex min-w-0 items-center gap-2 text-[13px] leading-none" aria-label="Breadcrumb">
      {#each localBreadcrumb as crumb, i}
        {#if i > 0}
          <ChevronRight size={14} strokeWidth={1.75} class="shrink-0 text-vlc-muted" aria-hidden="true" />
        {/if}
        <span class="min-w-0 truncate whitespace-nowrap" class:text-white={i === localBreadcrumb.length - 1} class:text-vlc-secondary={i !== localBreadcrumb.length - 1}>{crumb}</span>
      {/each}
    </nav>

    <div class="ml-auto flex shrink-0 items-center gap-2">
      <span class="mr-2 whitespace-nowrap text-xs text-vlc-muted" aria-live="polite">
        {isAlbumView ? filteredTracks.length : isArtistView ? filteredAlbums.length : filteredArtists.length} items
      </span>
      <div class="w-60">
        <FuzzySearch placeholder="Search…" on:search={handleSearch} />
      </div>
      <button class="flex h-8 w-8 items-center justify-center rounded-control text-vlc-secondary hover:bg-vlc-card hover:text-white" title="Sort">
        <ArrowUpDown size={16} strokeWidth={1.75} />
      </button>
      <button class="flex h-8 w-8 items-center justify-center rounded-control text-vlc-secondary hover:bg-vlc-card hover:text-white" title="Toggle view" on:click={toggleView}>
        {#if $musicViewMode === 'grid'}
          <LayoutList size={16} strokeWidth={1.75} />
        {:else}
          <LayoutGrid size={16} strokeWidth={1.75} />
        {/if}
      </button>
    </div>
  </header>

  <div class="min-h-0 flex-1 overflow-y-auto">
    {#if !isArtistView && !isAlbumView}
      <div class="grid grid-cols-2 gap-x-5 gap-y-7 p-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {#each filteredArtists as a}
          <button class="group block w-full text-left focus:outline-none" on:click={() => selectArtist(a)}>
            <div class="relative aspect-square w-full overflow-hidden rounded-lg border border-vlc-border bg-vlc-card transition group-hover:border-vlc-borderStrong">
              <div class="flex h-full w-full items-center justify-center text-vlc-muted">🎤</div>
            </div>
            <div class="mt-2.5 truncate text-[11px] leading-4 text-vlc-secondary">{a.name}</div>
            <div class="text-[11px] text-vlc-muted">{a.albumCount} albums</div>
          </button>
        {/each}
      </div>
    {:else if isArtistView && artist}
      <div class="grid grid-cols-2 gap-x-5 gap-y-7 p-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {#each filteredAlbums as al}
          <button class="group block w-full text-left focus:outline-none" on:click={() => selectAlbum(al)}>
            <div class="relative aspect-square w-full overflow-hidden rounded-lg border border-vlc-border bg-vlc-card transition group-hover:border-vlc-borderStrong">
              <div class="flex h-full w-full items-center justify-center text-vlc-muted">💿</div>
            </div>
            <div class="mt-2.5 truncate text-[11px] leading-4 text-vlc-secondary">{al.title}</div>
            <div class="text-[11px] text-vlc-muted">{al.year} • {al.trackCount} tracks</div>
          </button>
        {/each}
      </div>
    {:else if isAlbumView && album}
      <div class="px-6 py-4">
        <div class="flex items-center gap-4">
          <div class="h-24 w-24 shrink-0 rounded-lg border border-vlc-border bg-vlc-card flex items-center justify-center text-3xl">💿</div>
          <div>
            <div class="text-[17px] font-medium text-white">{album.title}</div>
            <div class="text-[13px] text-vlc-secondary">{artist?.name} • {album.year}</div>
          </div>
        </div>
      </div>
      <div class="border-t border-vlc-border">
        <div class="grid grid-cols-[36px_1fr_120px_90px] items-center gap-3 px-6 py-2 text-[11px] uppercase tracking-wide text-vlc-muted">
          <span>#</span><span>Title</span><span>Artist</span><span>Duration</span>
        </div>
        {#each filteredTracks as t}
          <div class="grid grid-cols-[36px_1fr_120px_90px] items-center gap-3 px-6 py-2 text-[13px] text-vlc-secondary hover:bg-vlc-card rounded-control">
            <span class="text-vlc-muted">{t.trackNumber}</span>
            <span class="truncate text-white">{t.title}</span>
            <span class="truncate">{artist?.name}</span>
            <span class="text-vlc-muted">{formatDuration(t.durationSeconds)}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
