<script lang="ts">
  import { ArrowLeft, ChevronRight, Search } from 'lucide-svelte';
  import { networkCategories, radioStations, podcastShows, podcastEpisodes } from '../lib/mock';
  import { networkSelectedCategory, networkPath } from '../stores/network';
  import FuzzySearch from '../components/FuzzySearch.svelte';

  $: category = $networkSelectedCategory;
  let query = '';
  function handleSearch(e: CustomEvent<string>) {
    query = e.detail;
  }

  $: filteredStations = radioStations.filter(item => item.name.toLowerCase().includes(query));

  $: shows = podcastShows;
  $: selectedShowId = $networkPath[1];

  $: showEpisodes = selectedShowId ? podcastEpisodes.filter(e => e.showId === selectedShowId) : [];
  $: filteredShowEpisodes = showEpisodes.filter(e => !query || e.title.toLowerCase().includes(query));

  function selectCategory(cat: string) {
    networkSelectedCategory.set(cat);
    networkPath.set([]);
  }

  function goBack() {
    if ($networkPath.length > 0) {
      networkPath.set($networkPath.slice(0, -1));
    }
  }

  function openShow(showId: string) {
    const show = podcastShows.find(s => s.id === showId);
    if (!show) return;
    networkPath.set([category, show.title]);
  }

  function formatDuration(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  $: breadcrumb = ['Network', category, ...$networkPath];
</script>

<div class="flex h-full bg-vlc-app">
  <aside class="w-[200px] shrink-0 border-r border-vlc-border bg-vlc-panel flex flex-col">
    <div class="px-3 py-3 border-b border-vlc-border">
      <div class="text-[13px] font-medium text-white">Categories</div>
    </div>
    <div class="overflow-y-auto py-2">
      {#each networkCategories as cat}
        <button class="w-full text-left px-3 py-2 text-[13px] rounded-control { $networkSelectedCategory === cat ? 'bg-vlc-card text-white' : 'text-vlc-secondary hover:bg-vlc-card hover:text-white' }" on:click={() => selectCategory(cat)}>
          {cat}
        </button>
      {/each}
    </div>
  </aside>

  <div class="flex min-w-0 flex-1 flex-col">
    <header class="flex h-16 shrink-0 items-center gap-3 border-b border-vlc-border px-6">
      <button class="flex h-8 w-8 items-center justify-center rounded-control text-vlc-secondary hover:bg-vlc-raised hover:text-white" on:click={goBack} aria-label="Back">
        <ArrowLeft size={18} strokeWidth={1.75} />
      </button>
      <nav class="flex min-w-0 items-center gap-2 text-[13px]">
        {#each breadcrumb as crumb, i}
          {#if i > 0}<ChevronRight size={14} class="text-vlc-muted" />{/if}
          <span class="{i === breadcrumb.length -1 ? 'text-white' : 'text-vlc-secondary'} truncate">{crumb}</span>
        {/each}
      </nav>
      <div class="ml-auto flex items-center gap-3 w-56">
        <FuzzySearch placeholder="Search…" on:search={handleSearch} />
      </div>
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto">
      {#if category === 'Internet Radio'}
        <div class="px-6 py-4">
          <div class="grid grid-cols-[1fr_120px_80px_80px] gap-3 px-2 py-2 text-[11px] uppercase text-vlc-muted">Name <span class="text-right">Genre</span><span class="text-right">Bitrate</span><span class="text-right">Country</span></div>
          {#each filteredStations as s}
            <div class="grid grid-cols-[1fr_120px_80px_80px] items-center gap-3 px-6 py-2 border-t border-vlc-border/30 text-[13px] text-vlc-secondary hover:bg-vlc-card rounded-control">
              <span class="truncate text-white">{s.name}</span>
              <span class="text-right truncate">{s.genre}</span>
              <span class="text-right">{s.bitrate} kbps</span>
              <span class="text-right">{s.country}</span>
            </div>
          {/each}
        </div>
      {:else if category === 'Podcasts'}
        {#if !$networkPath.length}
          <div class="p-6 grid gap-3">
            {#each shows as show}
              <button class="text-left rounded-panel border border-vlc-border bg-vlc-card px-4 py-3 hover:border-vlc-borderStrong" on:click={() => openShow(show.id)}>
                <div class="text-[15px] text-white">{show.title}</div>
                <div class="text-xs text-vlc-secondary">{show.author} • {show.episodeCount} episodes</div>
              </button>
            {/each}
          </div>
        {:else if selectedShowId}
          <div class="px-6 py-4">
            <div class="text-[17px] font-medium text-white mb-3">Episodes</div>
            <div class="grid grid-cols-[1fr_120px_80px] gap-3 px-2 py-2 text-[11px] uppercase text-vlc-muted">Title <span class="text-right">Published</span><span class="text-right">Duration</span></div>
            {#each filteredShowEpisodes as ep}
              <div class="grid grid-cols-[1fr_120px_80px] items-center gap-3 px-6 py-2 border-t border-vlc-border/30 text-[13px] text-vlc-secondary hover:bg-vlc-card rounded-control">
                <span class="truncate text-white">{ep.title}</span>
                <span class="text-right">{ep.published}</span>
                <span class="text-right">{formatDuration(ep.durationSeconds)}</span>
              </div>
            {/each}
          </div>
        {/if}
      {:else if category === 'Local Network'}
        <div class="p-6">
          <div class="rounded-panel border border-vlc-border bg-vlc-card p-4">
            <div class="text-[15px] text-white mb-3">UPnP/DLNA Browser</div>
            <div class="text-xs text-vlc-secondary space-y-1">
              <div>Server A</div>
              <div class="pl-4">└ Music</div>
              <div class="pl-8">└ Artist_01</div>
              <div class="pl-8">└ Track_01.mp3</div>
              <div class="pl-4">└ Movies</div>
            </div>
          </div>
        </div>
      {:else}
        <div class="flex h-full items-center justify-center text-vlc-muted">No content for {category} yet</div>
      {/if}
    </div>
  </div>
</div>
