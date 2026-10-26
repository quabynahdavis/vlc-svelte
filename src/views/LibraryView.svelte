<script lang="ts">
  import {
    ArrowLeft,
    ArrowUpDown,
    ChevronRight,
    Film,
    LayoutGrid,
    MoreHorizontal,
    Search,
  } from 'lucide-svelte';
</script>

<div class="flex h-full min-h-0 flex-col bg-vlc-app">
  <div class="flex h-14 shrink-0 items-center gap-3 border-b border-vlc-border/60 px-5">
    <button
      type="button"
      class="flex h-8 w-8 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-card hover:text-white"
      title="Back"
      aria-label="Go back"
    >
      <ArrowLeft size={18} strokeWidth={1.75} />
    </button>

    <nav class="flex min-w-0 items-center gap-1.5 text-[13px]" aria-label="Breadcrumb">
      <span class="truncate text-vlc-muted">Library</span>
      <ChevronRight size={13} strokeWidth={1.75} class="shrink-0 text-vlc-muted" />
      <span class="truncate text-white">Videos</span>
    </nav>

    <div class="ml-auto flex items-center gap-2">
      <span class="mr-1 text-xs text-vlc-muted">0 items</span>
      <button
        type="button"
        class="flex h-8 w-8 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-card hover:text-white"
        title="Sort"
        aria-label="Sort"
      >
        <ArrowUpDown size={16} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        class="flex h-8 w-8 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-card hover:text-white"
        title="Grid view"
        aria-label="Grid view"
      >
        <LayoutGrid size={16} strokeWidth={1.75} />
      </button>
      <label class="relative hidden md:block">
        <Search
          size={14}
          strokeWidth={1.75}
          class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-vlc-muted"
        />
        <input
          type="search"
          placeholder="Search"
          aria-label="Search videos"
          class="h-9 w-40 rounded-input border border-vlc-border bg-vlc-card pl-8 pr-3 text-xs text-white outline-none transition-colors placeholder:text-vlc-muted focus:border-vlc-orange/60"
        />
      </label>
      <button
        type="button"
        class="flex h-8 w-8 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-card hover:text-white"
        title="More"
        aria-label="More options"
      >
        <MoreHorizontal size={18} strokeWidth={1.75} />
      </button>
    </div>
  </div>

  <div class="min-h-0 flex-1 overflow-y-auto p-5">
    <div
      class="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 rounded-panel border border-dashed border-vlc-border bg-vlc-panel/40 px-6 text-center"
    >
      <div
        class="flex h-12 w-12 items-center justify-center rounded-panel border border-vlc-border bg-vlc-card text-vlc-muted"
      >
        <Film size={22} strokeWidth={1.5} />
      </div>
      <p class="text-sm font-medium text-vlc-secondary">Your video library is empty</p>
      <p class="text-xs text-vlc-muted">Media you add will show up here.</p>
    </div>
  </div>
</div>
