<script lang="ts">
  import { ArrowLeft, ChevronRight, Clock, Globe, Podcast, Radio } from 'lucide-svelte';
  import {
    networkCategories,
    podcastEpisodes,
    podcastShows,
    radioStations,
    type PodcastEpisode,
    type PodcastShow,
    type RadioStation,
  } from '../lib/mock';
  import { networkSelectedCategory, networkPath } from '../stores/network';
  import { networkViewMode, type ViewMode } from '../stores/viewModes';
  import FuzzySearch from '../components/FuzzySearch.svelte';
  import ViewModeToggle from '../components/ViewModeToggle.svelte';

  $: category = $networkSelectedCategory;

  let query = '';
  let searchKey = 0;
  let selectedStationId: string | null = null;
  let selectedEpisodeId: string | null = null;

  function handleSearch(e: CustomEvent<string>) {
    query = e.detail;
  }

  function clearSearch() {
    query = '';
    searchKey += 1;
  }

  $: filteredStations = radioStations.filter(
    (item) => !query || item.name.toLowerCase().includes(query),
  );

  $: filteredShows = podcastShows.filter(
    (show) =>
      !query ||
      show.title.toLowerCase().includes(query) ||
      show.author.toLowerCase().includes(query),
  );

  /** The path stores the selected show id so episodes resolve reliably. */
  $: selectedShow = $networkPath[0]
    ? podcastShows.find((show) => show.id === $networkPath[0]) ?? null
    : null;

  $: showEpisodes = selectedShow
    ? podcastEpisodes.filter((episode) => episode.showId === selectedShow.id)
    : [];

  $: filteredShowEpisodes = showEpisodes.filter(
    (episode) => !query || episode.title.toLowerCase().includes(query),
  );

  $: breadcrumb = ['Network', category, ...(selectedShow ? [selectedShow.title] : [])];

  $: visibleCount =
    category === 'Internet Radio'
      ? filteredStations.length
      : category === 'Podcasts'
        ? selectedShow
          ? filteredShowEpisodes.length
          : filteredShows.length
        : 0;

  $: showCount = category === 'Internet Radio' || category === 'Podcasts';

  function selectCategory(cat: string) {
    networkSelectedCategory.set(cat);
    networkPath.set([]);
    selectedStationId = null;
    selectedEpisodeId = null;
    clearSearch();
  }

  function goBack() {
    if ($networkPath.length > 0) {
      networkPath.set($networkPath.slice(0, -1));
    }
  }

  function openShow(showId: string) {
    const show = podcastShows.find((entry) => entry.id === showId);
    if (!show) return;
    networkPath.set([show.id]);
    selectedEpisodeId = null;
    clearSearch();
  }

  function selectStation(id: string) {
    selectedStationId = selectedStationId === id ? null : id;
  }

  function selectEpisode(id: string) {
    selectedEpisodeId = selectedEpisodeId === id ? null : id;
  }

  function setViewMode(mode: ViewMode) {
    networkViewMode.set(mode);
  }

  function formatDuration(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  function formatPublished(iso: string) {
    const date = new Date(`${iso}T00:00:00`);
    return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString();
  }

  function stationLabel(station: RadioStation) {
    return `Select ${station.name}, ${station.genre}, ${station.bitrate} kbps, ${station.country}`;
  }

  function showLabel(show: PodcastShow) {
    return `Open ${show.title} by ${show.author}, ${show.episodeCount} episodes`;
  }

  function episodeLabel(episode: PodcastEpisode) {
    return `Select ${episode.title}, published ${episode.published}, ${formatDuration(episode.durationSeconds)}`;
  }

  const focusRing =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60 focus-visible:ring-offset-1 focus-visible:ring-offset-vlc-app';
</script>

<div class="flex h-full bg-vlc-app">
  <aside class="flex w-[200px] shrink-0 flex-col border-r border-vlc-border bg-vlc-panel">
    <div class="border-b border-vlc-border px-3 py-3">
      <div class="text-[13px] font-medium text-vlc-text">Categories</div>
    </div>
    <nav class="overflow-y-auto py-2" aria-label="Network categories">
      {#each networkCategories as cat (cat)}
        <button
          type="button"
          class="w-full rounded-control px-3 py-2 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60 focus-visible:ring-offset-1 focus-visible:ring-offset-vlc-panel { $networkSelectedCategory === cat ? 'bg-vlc-raised text-vlc-text' : 'text-vlc-secondary hover:bg-vlc-raised hover:text-vlc-text' }"
          aria-current={$networkSelectedCategory === cat ? 'page' : undefined}
          on:click={() => selectCategory(cat)}
        >
          {cat}
        </button>
      {/each}
    </nav>
  </aside>

  <div class="flex min-w-0 flex-1 flex-col">
    <header class="flex h-16 shrink-0 items-center gap-3 border-b border-vlc-border px-6">
      <button
        type="button"
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60 focus-visible:ring-offset-1 focus-visible:ring-offset-vlc-app"
        title="Back"
        aria-label="Go back"
        on:click={goBack}
      >
        <ArrowLeft size={18} strokeWidth={1.75} aria-hidden="true" />
      </button>

      <nav class="flex min-w-0 flex-1 items-center gap-2 text-[13px]" aria-label="Breadcrumb">
        {#each breadcrumb as crumb, i (i)}
          {#if i > 0}
            <ChevronRight size={14} strokeWidth={1.75} class="shrink-0 text-vlc-muted" aria-hidden="true" />
          {/if}
          <span
            class="min-w-0 truncate whitespace-nowrap"
            class:text-vlc-text={i === breadcrumb.length - 1}
            class:text-vlc-secondary={i !== breadcrumb.length - 1}
            aria-current={i === breadcrumb.length - 1 ? 'page' : undefined}
          >
            {crumb}
          </span>
        {/each}
      </nav>

      <div class="flex shrink-0 items-center gap-2">
        {#if showCount}
          <span class="mr-1 hidden whitespace-nowrap text-xs text-vlc-muted xl:inline" aria-live="polite">
            {visibleCount} items
          </span>
        {/if}
        <div class="w-40 shrink xl:w-56">
          {#key searchKey}
            <FuzzySearch placeholder="Search…" on:search={handleSearch} />
          {/key}
        </div>
        <ViewModeToggle
          value={$networkViewMode}
          onChange={setViewMode}
          label="Network view mode"
        />
      </div>
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto">
      {#if category === 'Internet Radio'}
        <section aria-label="Internet radio stations">
          {#if $networkViewMode === 'grid'}
            <div class="grid grid-cols-1 gap-3 p-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {#each filteredStations as s (s.id)}
                <button
                  type="button"
                  class="group flex h-full min-h-[108px] flex-col rounded-panel border p-4 text-left transition-colors {focusRing} {selectedStationId === s.id
                    ? 'border-vlc-orange/60 bg-vlc-raised ring-1 ring-vlc-orange/30'
                    : 'border-vlc-border bg-vlc-card hover:border-vlc-borderStrong hover:bg-vlc-raised'}"
                  aria-label={stationLabel(s)}
                  aria-pressed={selectedStationId === s.id}
                  on:click={() => selectStation(s.id)}
                >
                  <div class="flex min-w-0 items-start gap-3">
                    <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-control border border-vlc-border bg-vlc-panel text-vlc-secondary transition-colors group-hover:text-vlc-text">
                      <Radio size={18} strokeWidth={1.75} aria-hidden="true" />
                    </span>
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-sm font-medium text-vlc-text">{s.name}</span>
                      <span class="mt-0.5 block truncate text-xs text-vlc-secondary">{s.genre}</span>
                    </span>
                  </div>
                  <div class="mt-auto flex items-center justify-between gap-2 pt-3 text-[11px] text-vlc-muted">
                    <span>{s.bitrate} kbps</span>
                    <span class="inline-flex items-center gap-1">
                      <Globe size={12} strokeWidth={1.75} aria-hidden="true" />
                      {s.country}
                    </span>
                  </div>
                </button>
              {/each}
            </div>
          {:else if $networkViewMode === 'list'}
            <div class="px-6 py-4">
              <div
                class="grid grid-cols-[1fr_120px_80px_80px] gap-3 px-3 py-2 text-[11px] uppercase tracking-wide text-vlc-muted"
                aria-hidden="true"
              >
                <span>Name</span>
                <span class="text-right">Genre</span>
                <span class="text-right">Bitrate</span>
                <span class="text-right">Country</span>
              </div>
              <ul>
                {#each filteredStations as s (s.id)}
                  <li>
                    <button
                      type="button"
                      class="grid w-full grid-cols-[1fr_120px_80px_80px] items-center gap-3 rounded-control border-t border-vlc-border/30 px-3 py-2 text-left text-[13px] text-vlc-secondary transition-colors {focusRing} {selectedStationId === s.id
                        ? 'bg-vlc-raised text-vlc-text ring-1 ring-inset ring-vlc-orange/50'
                        : 'hover:bg-vlc-card hover:text-vlc-text'}"
                      aria-label={stationLabel(s)}
                      aria-pressed={selectedStationId === s.id}
                      on:click={() => selectStation(s.id)}
                    >
                      <span class="truncate text-vlc-text">{s.name}</span>
                      <span class="truncate text-right">{s.genre}</span>
                      <span class="text-right">{s.bitrate} kbps</span>
                      <span class="text-right">{s.country}</span>
                    </button>
                  </li>
                {/each}
              </ul>
            </div>
          {:else}
            <div class="px-6 py-3">
              <ul class="space-y-px">
                {#each filteredStations as s (s.id)}
                  <li>
                    <button
                      type="button"
                      class="grid h-7 w-full grid-cols-[1fr_110px_70px] items-center gap-3 rounded-input px-2 text-left text-xs text-vlc-secondary transition-colors {focusRing} {selectedStationId === s.id
                        ? 'bg-vlc-raised text-vlc-text ring-1 ring-inset ring-vlc-orange/40'
                        : 'hover:bg-vlc-card hover:text-vlc-text'}"
                      aria-label={stationLabel(s)}
                      aria-pressed={selectedStationId === s.id}
                      on:click={() => selectStation(s.id)}
                    >
                      <span class="truncate text-vlc-text">{s.name}</span>
                      <span class="truncate text-right">{s.genre}</span>
                      <span class="text-right text-vlc-muted">{s.bitrate}k</span>
                    </button>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}

          {#if filteredStations.length === 0}
            <div class="px-6 py-10 text-center text-sm text-vlc-muted">
              No stations match your search.
            </div>
          {/if}
        </section>
      {:else if category === 'Podcasts'}
        {#if !$networkPath.length}
          <section aria-label="Podcast shows">
            {#if $networkViewMode === 'grid'}
              <div class="grid grid-cols-1 gap-3 p-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {#each filteredShows as show (show.id)}
                  <button
                    type="button"
                    class="group flex h-full min-h-[120px] flex-col rounded-panel border border-vlc-border bg-vlc-card p-4 text-left transition-colors hover:border-vlc-borderStrong hover:bg-vlc-raised {focusRing}"
                    aria-label={showLabel(show)}
                    on:click={() => openShow(show.id)}
                  >
                    <div class="flex min-w-0 items-start gap-3">
                      <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-control border border-vlc-border bg-vlc-panel text-vlc-secondary transition-colors group-hover:text-vlc-text">
                        <Podcast size={18} strokeWidth={1.75} aria-hidden="true" />
                      </span>
                      <span class="min-w-0 flex-1">
                        <span class="block truncate text-[15px] font-medium text-vlc-text">{show.title}</span>
                        <span class="mt-0.5 block truncate text-xs text-vlc-secondary">{show.author}</span>
                      </span>
                    </div>
                    <div class="mt-auto pt-3 text-[11px] text-vlc-muted">
                      {show.episodeCount} episodes
                    </div>
                  </button>
                {/each}
              </div>
            {:else if $networkViewMode === 'list'}
              <div class="p-6">
                <div class="overflow-hidden rounded-panel border border-vlc-border">
                  <div
                    class="grid grid-cols-[1fr_180px_100px] gap-3 border-b border-vlc-border bg-vlc-panel px-4 py-2 text-[11px] uppercase tracking-wide text-vlc-muted"
                    aria-hidden="true"
                  >
                    <span>Show</span>
                    <span>Author</span>
                    <span class="text-right">Episodes</span>
                  </div>
                  <ul>
                    {#each filteredShows as show (show.id)}
                      <li>
                        <button
                          type="button"
                          class="grid w-full grid-cols-[1fr_180px_100px] items-center gap-3 px-4 py-2 text-left text-[13px] text-vlc-secondary transition-colors hover:bg-vlc-card hover:text-vlc-text {focusRing}"
                          aria-label={showLabel(show)}
                          on:click={() => openShow(show.id)}
                        >
                          <span class="truncate text-vlc-text">{show.title}</span>
                          <span class="truncate">{show.author}</span>
                          <span class="text-right">{show.episodeCount}</span>
                        </button>
                      </li>
                    {/each}
                  </ul>
                </div>
              </div>
            {:else}
              <div class="p-6">
                <ul class="space-y-px">
                  {#each filteredShows as show (show.id)}
                    <li>
                      <button
                        type="button"
                        class="grid h-8 w-full grid-cols-[1fr_150px_70px] items-center gap-3 rounded-input px-2 text-left text-xs text-vlc-secondary transition-colors hover:bg-vlc-card hover:text-vlc-text {focusRing}"
                        aria-label={showLabel(show)}
                        on:click={() => openShow(show.id)}
                      >
                        <span class="truncate text-vlc-text">{show.title}</span>
                        <span class="truncate">{show.author}</span>
                        <span class="text-right text-vlc-muted">{show.episodeCount} ep</span>
                      </button>
                    </li>
                  {/each}
                </ul>
              </div>
            {/if}

            {#if filteredShows.length === 0}
              <div class="px-6 pb-10 text-center text-sm text-vlc-muted">
                No shows match your search.
              </div>
            {/if}
          </section>
        {:else if selectedShow}
          <section aria-label={`${selectedShow.title} episodes`}>
            <div class="px-6 pt-4">
              <h1 class="text-[17px] font-medium text-vlc-text">{selectedShow.title}</h1>
              <p class="mt-0.5 text-xs text-vlc-secondary">
                {selectedShow.author} · {selectedShow.episodeCount} episodes
              </p>
            </div>

            {#if $networkViewMode === 'grid'}
              <div class="grid grid-cols-1 gap-3 p-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {#each filteredShowEpisodes as ep (ep.id)}
                  <button
                    type="button"
                    class="group flex h-full min-h-[108px] flex-col rounded-panel border p-4 text-left transition-colors {focusRing} {selectedEpisodeId === ep.id
                      ? 'border-vlc-orange/60 bg-vlc-raised ring-1 ring-vlc-orange/30'
                      : 'border-vlc-border bg-vlc-card hover:border-vlc-borderStrong hover:bg-vlc-raised'}"
                    aria-label={episodeLabel(ep)}
                    aria-pressed={selectedEpisodeId === ep.id}
                    on:click={() => selectEpisode(ep.id)}
                  >
                    <div class="flex min-w-0 items-start gap-3">
                      <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-vlc-border bg-vlc-panel text-vlc-secondary transition-colors group-hover:text-vlc-text">
                        <Podcast size={16} strokeWidth={1.75} aria-hidden="true" />
                      </span>
                      <span class="line-clamp-2 min-w-0 flex-1 text-[13px] font-medium text-vlc-text">{ep.title}</span>
                    </div>
                    <div class="mt-auto flex items-center justify-between gap-2 pt-3 text-[11px] text-vlc-muted">
                      <span>{formatPublished(ep.published)}</span>
                      <span class="inline-flex items-center gap-1">
                        <Clock size={12} strokeWidth={1.75} aria-hidden="true" />
                        {formatDuration(ep.durationSeconds)}
                      </span>
                    </div>
                  </button>
                {/each}
              </div>
            {:else if $networkViewMode === 'list'}
              <div class="px-6 py-4">
                <div
                  class="grid grid-cols-[1fr_120px_80px] gap-3 px-3 py-2 text-[11px] uppercase tracking-wide text-vlc-muted"
                  aria-hidden="true"
                >
                  <span>Title</span>
                  <span class="text-right">Published</span>
                  <span class="text-right">Duration</span>
                </div>
                <ul>
                  {#each filteredShowEpisodes as ep (ep.id)}
                    <li>
                      <button
                        type="button"
                        class="grid w-full grid-cols-[1fr_120px_80px] items-center gap-3 rounded-control border-t border-vlc-border/30 px-3 py-2 text-left text-[13px] text-vlc-secondary transition-colors {focusRing} {selectedEpisodeId === ep.id
                          ? 'bg-vlc-raised text-vlc-text ring-1 ring-inset ring-vlc-orange/50'
                          : 'hover:bg-vlc-card hover:text-vlc-text'}"
                        aria-label={episodeLabel(ep)}
                        aria-pressed={selectedEpisodeId === ep.id}
                        on:click={() => selectEpisode(ep.id)}
                      >
                        <span class="truncate text-vlc-text">{ep.title}</span>
                        <span class="text-right">{ep.published}</span>
                        <span class="text-right">{formatDuration(ep.durationSeconds)}</span>
                      </button>
                    </li>
                  {/each}
                </ul>
              </div>
            {:else}
              <div class="px-6 py-3">
                <ul class="space-y-px">
                  {#each filteredShowEpisodes as ep (ep.id)}
                    <li>
                      <button
                        type="button"
                        class="grid h-7 w-full grid-cols-[1fr_70px] items-center gap-3 rounded-input px-2 text-left text-xs text-vlc-secondary transition-colors {focusRing} {selectedEpisodeId === ep.id
                          ? 'bg-vlc-raised text-vlc-text ring-1 ring-inset ring-vlc-orange/40'
                          : 'hover:bg-vlc-card hover:text-vlc-text'}"
                        aria-label={episodeLabel(ep)}
                        aria-pressed={selectedEpisodeId === ep.id}
                        on:click={() => selectEpisode(ep.id)}
                      >
                        <span class="truncate text-vlc-text">{ep.title}</span>
                        <span class="text-right text-vlc-muted">{formatDuration(ep.durationSeconds)}</span>
                      </button>
                    </li>
                  {/each}
                </ul>
              </div>
            {/if}

            {#if filteredShowEpisodes.length === 0}
              <div class="px-6 pb-10 text-center text-sm text-vlc-muted">
                No episodes match your search.
              </div>
            {/if}
          </section>
        {/if}
      {:else if category === 'Local Network'}
        <div class="p-6">
          <div class="rounded-panel border border-vlc-border bg-vlc-card p-4">
            <div class="mb-3 text-[15px] text-vlc-text">UPnP/DLNA Browser</div>
            <div class="space-y-1 text-xs text-vlc-secondary">
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
