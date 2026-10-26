<script lang="ts">
  import { Trash2, Search } from 'lucide-svelte';
  import { recentItems } from '../lib/mock';
  import { recentActiveTab, recentSearch, recentFilterType } from '../stores/recent';
  import FuzzySearch from '../components/FuzzySearch.svelte';

  let query = '';
  function handleSearch(e: CustomEvent<string>) {
    query = e.detail;
  }

  $: filter = $recentFilterType;

  $: historyItems = recentItems;

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

  function groupByDay(items) {
    const groups = [];
    let currentLabel = '';
    let currentGroup = [];
    for (const it of items) {
      const label = formatTimestamp(it.timestamp);
      if (label !== currentLabel) {
        if (currentGroup.length) groups.push({ label: currentLabel, items: currentGroup });
        currentLabel = label;
        currentGroup = [it];
      } else {
        currentGroup.push(it);
      }
    }
    if (currentGroup.length) groups.push({ label: currentLabel, items: currentGroup });
    return groups;
  }

  $: groups = groupByDay(filtered);

  function clearHistory() {
    recentSearch.set('');
    recentFilterType.set(null);
    query = '';
  }
</script>

<div class="flex h-full min-h-0 flex-col bg-vlc-app">
  <header class="flex h-16 shrink-0 items-center gap-3 border-b border-vlc-border px-6">
    <nav class="flex gap-2">
      {#each ['media','devices','network'] as tab}
        <button class="px-3 py-1.5 rounded-control text-[13px] { $recentActiveTab === tab ? 'bg-vlc-card text-white' : 'text-vlc-secondary hover:bg-vlc-card' }" on:click={() => recentActiveTab.set(tab)}>{tab[0].toUpperCase() + tab.slice(1)}</button>
      {/each}
    </nav>
    <div class="ml-auto flex items-center gap-2">
      <div class="w-56">
        <FuzzySearch placeholder="Search…" on:search={handleSearch} />
      </div>
      <button class="flex h-8 w-8 items-center justify-center rounded-control text-vlc-secondary hover:bg-vlc-card" title="Clear history" on:click={clearHistory}>
        <Trash2 size={16} />
      </button>
    </div>
  </header>

  <div class="min-h-0 flex-1 overflow-y-auto p-6">
    {#if groups.length === 0}
      <div class="text-vlc-muted text-sm">No items</div>
    {:else}
      {#each groups as group}
        <div class="mb-4">
          <div class="text-[11px] uppercase text-vlc-muted mb-2">{group.label}</div>
          <div class="space-y-1">
            {#each group.items as it}
              <div class="flex items-center gap-3 px-3 py-2 rounded-control hover:bg-vlc-card text-[13px] text-vlc-secondary">
                <div class="w-8 text-center text-vlc-muted">{it.type === 'media' ? '▶' : it.type === 'device' ? '💾' : '📡'}</div>
                <div class="min-w-0 flex-1">
                  <div class="truncate text-white">{it.title}</div>
                  <div class="truncate text-xs">{it.source}</div>
                </div>
                <div class="text-xs text-vlc-muted">{new Date(it.timestamp).toLocaleTimeString()}</div>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>
