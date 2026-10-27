<script lang="ts">
  import type { ComponentType } from 'svelte';
  import { HardDrive, Play, Radio, Trash2 } from 'lucide-svelte';
  import {
    recentItems,
    type RecentItemType,
    type RecentMediaItem,
  } from '../lib/mock';
  import {
    recentActiveTab,
    recentFilterType,
    recentSearch,
  } from '../stores/recent';
  import { recentViewMode, type ViewMode } from '../stores/viewModes';
  import FuzzySearch from '../components/FuzzySearch.svelte';
  import ViewModeToggle from '../components/ViewModeToggle.svelte';

  type RecentTab = 'media' | 'devices' | 'network';

  interface RecentGroup {
    label: string;
    items: RecentMediaItem[];
  }

  const recentTabs: { id: RecentTab; label: string }[] = [
    { id: 'media', label: 'Media' },
    { id: 'devices', label: 'Devices' },
    { id: 'network', label: 'Network' },
  ];

  const typeLabels: Record<RecentItemType, string> = {
    media: 'Media',
    device: 'Device',
    network: 'Network',
  };

  const typeIcons: Record<RecentItemType, ComponentType> = {
    media: Play,
    device: HardDrive,
    network: Radio,
  };

  let query = '';
  let searchKey = 0;

  function handleSearch(e: CustomEvent<string>) {
    query = e.detail;
    recentSearch.set(query);
  }

  $: filter = $recentFilterType;

  /** Newest first, always, so grouping is deterministic regardless of source order. */
  $: historyItems = [...recentItems].sort((a, b) => b.timestamp - a.timestamp);

  $: filtered = historyItems.filter(item => {
    const matchesQuery = !query || item.title.toLowerCase().includes(query) || item.source.toLowerCase().includes(query);
    const matchesType = !filter || item.type === filter;
    const matchesTab = $recentActiveTab === 'media' ? item.type === 'media' : $recentActiveTab === 'devices' ? item.type === 'device' : item.type === 'network';
    return matchesQuery && matchesType && matchesTab;
  });

  function formatTimestamp(ts: number) {
    const d = new Date(ts);
    const now = Date.now();
    const diff = now - ts;
    const days = Math.floor(diff / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return d.toLocaleDateString();
  }

  function formatClock(ts: number) {
    return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  function isoDate(ts: number) {
    return new Date(ts).toISOString();
  }

  /**
   * The recent mock feed has no playback position. Derive a stable resume point
   * from the item id so progress bars do not jump between renders. Items with
   * no duration (devices) intentionally show no progress.
   */
  function resumeProgress(item: RecentMediaItem): number {
    if (!item.duration || item.duration <= 0) return 0;
    let hash = 0;
    for (let i = 0; i < item.id.length; i += 1) {
      hash = (hash * 31 + item.id.charCodeAt(i)) % 997;
    }
    return 0.2 + (hash % 65) / 100;
  }

  function itemAriaLabel(item: RecentMediaItem): string {
    const parts = [
      `${typeLabels[item.type]}: ${item.title}`,
      `from ${item.source}`,
      formatTimestamp(item.timestamp),
    ];
    const progress = Math.round(resumeProgress(item) * 100);
    if (progress > 0) parts.push(`${progress}% watched`);
    return parts.join(', ');
  }

  function dayKey(ts: number): string {
    const date = new Date(ts);
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  }

  function groupByDay(items: RecentMediaItem[]): RecentGroup[] {
    const groups: RecentGroup[] = [];
    let currentKey: string | null = null;
    let currentGroup: RecentMediaItem[] = [];

    for (const item of items) {
      const key = dayKey(item.timestamp);
      if (key !== currentKey) {
        if (currentGroup.length > 0) {
          groups.push({ label: formatTimestamp(currentGroup[0].timestamp), items: currentGroup });
        }
        currentKey = key;
        currentGroup = [item];
      } else {
        currentGroup.push(item);
      }
    }

    if (currentGroup.length > 0) {
      groups.push({ label: formatTimestamp(currentGroup[0].timestamp), items: currentGroup });
    }

    return groups;
  }

  $: groups = groupByDay(filtered);

  function setViewMode(mode: ViewMode) {
    recentViewMode.set(mode);
  }

  function clearHistory() {
    recentSearch.set('');
    recentFilterType.set(null);
    query = '';
    searchKey += 1;
  }
</script>

<div class="flex h-full min-h-0 flex-col bg-vlc-app">
  <header class="flex h-16 shrink-0 items-center gap-3 border-b border-vlc-border px-6">
    <nav class="flex shrink-0 gap-2" aria-label="Recent categories">
      {#each recentTabs as tab (tab.id)}
        <button
          type="button"
          class="rounded-control px-3 py-1.5 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60 focus-visible:ring-offset-1 focus-visible:ring-offset-vlc-app { $recentActiveTab === tab.id ? 'bg-vlc-card text-vlc-text' : 'text-vlc-secondary hover:bg-vlc-card hover:text-vlc-text' }"
          aria-pressed={$recentActiveTab === tab.id}
          on:click={() => recentActiveTab.set(tab.id)}
        >
          {tab.label}
        </button>
      {/each}
    </nav>

    <div class="ml-auto flex min-w-0 items-center gap-2">
      <span class="mr-1 hidden whitespace-nowrap text-xs text-vlc-muted md:inline" aria-live="polite">
        {filtered.length} items
      </span>
      <div class="w-44 shrink lg:w-56">
        {#key searchKey}
          <FuzzySearch placeholder="Search…" on:search={handleSearch} />
        {/key}
      </div>
      <ViewModeToggle
        value={$recentViewMode}
        onChange={setViewMode}
        label="Recent view mode"
      />
      <button
        type="button"
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-card hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60 focus-visible:ring-offset-1 focus-visible:ring-offset-vlc-app"
        title="Clear history"
        aria-label="Clear history and filters"
        on:click={clearHistory}
      >
        <Trash2 size={16} aria-hidden="true" />
      </button>
    </div>
  </header>

  <div class="min-h-0 flex-1 overflow-y-auto p-6">
    {#if groups.length === 0}
      <div class="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 px-6 text-center">
        <p class="text-sm font-medium text-vlc-secondary">No items</p>
        <p class="text-xs text-vlc-muted">Nothing matches this tab, search, or filter.</p>
        <button
          type="button"
          class="mt-2 rounded-control border border-vlc-border bg-vlc-card px-3 py-1.5 text-xs text-vlc-secondary transition-colors hover:border-vlc-borderStrong hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60 focus-visible:ring-offset-1 focus-visible:ring-offset-vlc-app"
          on:click={clearHistory}
        >
          Clear filters
        </button>
      </div>
    {:else}
      {#each groups as group, groupIndex (`${group.label}-${groupIndex}`)}
        <section class="{$recentViewMode === 'compact' ? 'mb-3' : 'mb-5'}" aria-labelledby={`recent-group-${groupIndex}`}>
          <h2
            id={`recent-group-${groupIndex}`}
            class="font-medium uppercase tracking-wide text-vlc-muted {$recentViewMode === 'compact' ? 'mb-1 text-[10px]' : 'mb-2 text-[11px]'}"
          >
            {group.label}
          </h2>

          {#if $recentViewMode === 'grid'}
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {#each group.items as it (it.id)}
                {@const progress = Math.round(resumeProgress(it) * 100)}
                <button
                  type="button"
                  class="group flex h-full w-full flex-col rounded-panel border border-vlc-border bg-vlc-card p-3 text-left transition-colors hover:border-vlc-borderStrong hover:bg-vlc-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60 focus-visible:ring-offset-1 focus-visible:ring-offset-vlc-app"
                  aria-label={itemAriaLabel(it)}
                  title={it.title}
                >
                  <div class="flex min-w-0 items-start gap-3">
                    <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-vlc-border bg-vlc-panel text-vlc-secondary transition-colors group-hover:text-vlc-text">
                      <svelte:component this={typeIcons[it.type]} size={16} strokeWidth={1.75} aria-hidden="true" />
                    </span>
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-[13px] font-medium text-vlc-text">{it.title}</span>
                      <span class="mt-0.5 block truncate text-xs text-vlc-secondary">{it.source}</span>
                    </span>
                  </div>

                  <div class="mt-auto flex items-center justify-between gap-2 pt-3 text-[11px] text-vlc-muted">
                    <span class="rounded-full border border-vlc-border bg-vlc-panel px-2 py-0.5 text-[10px] uppercase tracking-wide text-vlc-secondary">
                      {typeLabels[it.type]}
                    </span>
                    <time class="shrink-0" datetime={isoDate(it.timestamp)}>
                      {formatTimestamp(it.timestamp)} · {formatClock(it.timestamp)}
                    </time>
                  </div>

                  {#if progress > 0}
                    <div class="mt-2" aria-hidden="true">
                      <div class="flex items-center justify-between text-[10px] text-vlc-muted">
                        <span>Progress</span>
                        <span>{progress}%</span>
                      </div>
                      <div class="mt-1 h-1 overflow-hidden rounded-full bg-vlc-raised">
                        <div class="h-full rounded-full bg-vlc-orange" style={`width: ${progress}%`}></div>
                      </div>
                    </div>
                  {/if}
                </button>
              {/each}
            </div>
          {:else if $recentViewMode === 'list'}
            <ul class="space-y-1">
              {#each group.items as it (it.id)}
                <li>
                  <button
                    type="button"
                    class="flex w-full items-center gap-3 rounded-control px-3 py-2 text-left text-[13px] text-vlc-secondary transition-colors hover:bg-vlc-card hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60 focus-visible:ring-offset-1 focus-visible:ring-offset-vlc-app"
                    aria-label={itemAriaLabel(it)}
                    title={it.title}
                  >
                    <span class="flex w-8 shrink-0 justify-center text-vlc-muted">
                      <svelte:component this={typeIcons[it.type]} size={15} strokeWidth={1.75} aria-hidden="true" />
                    </span>
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-vlc-text">{it.title}</span>
                      <span class="block truncate text-xs text-vlc-muted">{it.source}</span>
                    </span>
                    <span class="hidden shrink-0 text-xs text-vlc-muted sm:block">{typeLabels[it.type]}</span>
                    <time class="w-20 shrink-0 text-right text-xs text-vlc-muted" datetime={isoDate(it.timestamp)}>
                      {formatClock(it.timestamp)}
                    </time>
                  </button>
                </li>
              {/each}
            </ul>
          {:else}
            <ul class="space-y-px">
              {#each group.items as it (it.id)}
                <li>
                  <button
                    type="button"
                    class="flex h-8 w-full items-center gap-2 rounded-input px-2 text-left text-xs text-vlc-secondary transition-colors hover:bg-vlc-card hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60 focus-visible:ring-offset-1 focus-visible:ring-offset-vlc-app"
                    aria-label={itemAriaLabel(it)}
                    title={it.title}
                  >
                    <span class="shrink-0 text-vlc-muted">
                      <svelte:component this={typeIcons[it.type]} size={13} strokeWidth={1.75} aria-hidden="true" />
                    </span>
                    <span class="min-w-0 flex-1 truncate text-vlc-text">{it.title}</span>
                    <time class="shrink-0 text-[11px] text-vlc-muted" datetime={isoDate(it.timestamp)}>
                      {formatClock(it.timestamp)}
                    </time>
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </section>
      {/each}
    {/if}
  </div>
</div>
