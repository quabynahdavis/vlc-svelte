<script lang="ts">
  import {
    ArrowRightLeft,
    AudioLines,
    Captions,
    ChevronRight,
    Clapperboard,
    Clock,
    Copy,
    Disc3,
    EyeOff,
    File,
    Folder,
    FolderMinus,
    FolderOpen,
    History,
    Info,
    Keyboard,
    Link,
    ListMusic,
    ListPlus,
    LogOut,
    MonitorPlay,
    Play,
    Puzzle,
    Radio,
    RefreshCw,
    Settings,
    SkipBack,
    SkipForward,
    Square,
    Trash2,
    Upload,
    Wand2,
    X,
  } from 'lucide-svelte';
  import { onMount, tick } from 'svelte';
  import type { ComponentType } from 'svelte';
  import { currentContext, contextItemId } from '../stores/ui';
  import { settings } from '../stores/settings';
  import { watchLater } from '../stores/watchLater';
  import { musicTracks } from '../stores/musicLibrary';
  import { history, type HistoryEntry } from '../stores/history';

  export let x = 0;
  export let y = 0;
  export let open = false;
  /** Right-click menus stay short; the title-bar menu shows the full tree. */
  export let compact = false;
  export let onClose: () => void = () => {};
  export let onAction: (id: string) => void = () => {};

  type SubmenuItem = {
    id: string;
    label: string;
    shortcut?: string;
  };

  type DividerItem = {
    type: 'divider';
  };

  type ActionItem = {
    type?: 'item';
    id: string;
    label: string;
    shortcut?: string;
    icon: ComponentType;
    tone?: 'accent' | 'neutral' | 'orange';
    children?: SubmenuItem[];
  };

  type MenuItem = ActionItem | DividerItem;

  /**
   * Title-bar "…" menu, mirroring VLC's classic main menu: an Open group, a
   * divider, then the Tools group. Recent entries come from the history store.
   */
  function buildAppMenu(historyEntries: HistoryEntry[]): MenuItem[] {
    const recentChildren: SubmenuItem[] = historyEntries
      .slice()
      .sort((a, b) => b.lastPlayedAt - a.lastPlayedAt)
      .slice(0, 8)
      .map((entry) => ({ id: `history-play:${entry.id}`, label: entry.title }));
    recentChildren.push({ id: 'clear-history', label: 'Clear History' });

    return [
      { id: 'open-file', label: 'Open File(s)', shortcut: 'Ctrl + O', icon: File, tone: 'neutral' },
      {
        id: 'open-folder',
        label: 'Open Folder(s)',
        shortcut: 'Ctrl + F',
        icon: Folder,
        tone: 'neutral',
      },
      { id: 'open-disc', label: 'Open Disc', shortcut: 'Ctrl + D', icon: Disc3, tone: 'neutral' },
      {
        id: 'open-network',
        label: 'Open Network Stream',
        shortcut: 'Ctrl + N',
        icon: Radio,
        tone: 'neutral',
      },
      {
        id: 'open-capture',
        label: 'Open Capture Device',
        shortcut: 'Ctrl + C',
        icon: MonitorPlay,
        tone: 'neutral',
      },
      {
        id: 'open-clipboard',
        label: 'Open from Clipboard',
        shortcut: 'Ctrl + V',
        icon: Link,
        tone: 'neutral',
      },
      {
        id: 'convert',
        label: 'Convert',
        shortcut: 'Ctrl + R',
        icon: ArrowRightLeft,
        tone: 'neutral',
      },
      { id: 'stream', label: 'Stream', shortcut: 'Ctrl + S', icon: Upload, tone: 'neutral' },
      {
        id: 'open-recent',
        label: 'Open Recent',
        icon: History,
        tone: 'neutral',
        children: recentChildren,
      },
      { type: 'divider' },
      {
        id: 'customize-player',
        label: 'Customize Player',
        icon: Wand2,
        tone: 'orange',
      },
      {
        id: 'plugins',
        label: 'Plugins & Extensions',
        icon: Puzzle,
        tone: 'orange',
        children: [
          { id: 'plugins-extensions', label: 'Extensions' },
          { id: 'plugins-effects', label: 'Effects' },
        ],
      },
      { id: 'settings', label: 'Settings', shortcut: 'Ctrl + P', icon: Settings, tone: 'orange' },
      {
        id: 'about-vlc',
        label: 'About VLC',
        shortcut: 'Shift + F1',
        icon: Info,
        tone: 'orange',
      },
      { type: 'divider' },
      { id: 'quit', label: 'Quit Kanea', shortcut: 'Ctrl + Q', icon: LogOut, tone: 'neutral' },
    ];
  }

  /**
   * Right-click menu: fast, short and focused on playback plus Hide UI. The
   * VLC-style Open/Tools tree stays in the title-bar menu.
   */
  const compactMenuItems: MenuItem[] = [
    { id: 'play-pause', label: 'Play', shortcut: 'Space', icon: Play, tone: 'accent' },
    { id: 'stop', label: 'Stop', shortcut: 'S', icon: Square, tone: 'accent' },
    { id: 'previous-item', label: 'Previous Item', shortcut: 'P', icon: SkipBack, tone: 'accent' },
    { id: 'next-item', label: 'Next Item', shortcut: 'N', icon: SkipForward, tone: 'accent' },
    { id: 'hide-ui', label: 'Hide UI', shortcut: 'Ctrl + \\', icon: EyeOff, tone: 'neutral' },
    { type: 'divider' },
    {
      id: 'video',
      label: 'Video',
      icon: Clapperboard,
      tone: 'neutral',
      children: [{ id: 'video-fullscreen', label: 'Fullscreen' }],
    },
    {
      id: 'audio',
      label: 'Audio',
      icon: AudioLines,
      tone: 'neutral',
      children: [
        { id: 'audio-mute', label: 'Mute' },
        { id: 'audio-track', label: 'Audio Track' },
      ],
    },
    {
      id: 'subtitle',
      label: 'Subtitle',
      icon: Captions,
      tone: 'neutral',
      children: [
        { id: 'subtitle-add-file', label: 'Add Subtitle File' },
        { id: 'subtitle-track', label: 'Subtitle Track' },
        { id: 'subtitle-delay', label: 'Subtitle Delay' },
      ],
    },
    { type: 'divider' },
    { id: 'keyboard-shortcuts', label: 'Keyboard Shortcuts', icon: Keyboard, tone: 'neutral' },
    { id: 'settings', label: 'Settings', shortcut: 'Ctrl + P', icon: Settings, tone: 'neutral' },
    { id: 'quit', label: 'Quit Kanea', shortcut: 'Ctrl + Q', icon: LogOut, tone: 'neutral' },
  ];

  let menuEl: HTMLDivElement | null = null;
  let menuLeft = 8;
  let menuTop = 8;
  let viewportWidth = 1280;
  let viewportHeight = 800;
  let openSubmenu: string | null = null;
  let submenuLeft = 0;
  let submenuTop = 0;

  const MENU_WIDTH = 350;
  const SUBMENU_WIDTH = 260;
  const SUBMENU_ITEM_HEIGHT = 40;
  const SUBMENU_PADDING = 12;
  /** Keep this much room on the right before flipping the flyout to the left. */
  const SUBMENU_FLIP_THRESHOLD = 340;
  const VIEWPORT_MARGIN = 8;

  /** Normalized path key: trailing separators stripped, case folded. */
  function pathKey(path: string): string {
    return path.replace(/[\\/]+$/, '').toLowerCase();
  }

  /**
   * True when the right-clicked folder is one of the configured library roots
   * (Settings > Library) or music roots (Settings > Music Library). Only
   * configured roots can be rescanned or removed; subfolders and
   * import-derived groups get the shorter menu.
   */
  $: contextFolderIsRoot = (() => {
    const id = $contextItemId;
    if (!id) return false;
    const isVideoRoot = $settings.libraryFolders.some((folder) => pathKey(folder) === pathKey(id));
    const isMusicRoot = $settings.musicLibraryFolders.some(
      (folder) => pathKey(folder) === pathKey(id),
    );
    return isVideoRoot || isMusicRoot;
  })();

  /**
   * True when the right-clicked media item is a music-library track. Music has
   * no Watch Later list (playlists fill that role), so the toggle is hidden.
   */
  $: contextMediaIsMusic = (() => {
    const id = $contextItemId;
    if (!id) return false;
    return $musicTracks.some((track) => track.id === id);
  })();

  /** Watch-later membership of the right-clicked media item (drives the toggle label). */
  $: contextMediaInWatchLater = (() => {
    const id = $contextItemId;
    if (!id) return false;
    return $watchLater.some((entry) => entry.mediaKey === id && entry.type === 'video');
  })();

  // Substitute menu based on UI context – global, folder, media, or a
  // player-view library entry. Every action is handled in App.svelte.
  $: activeMenuItems = (() => {
    const ctx = $currentContext;
    // Global: the VLC-style title-bar menu (compact shows the short right-click list).
    if (ctx === 'global') return compact ? compactMenuItems : buildAppMenu($history);

    // Folder context – navigate, refresh and manage this library folder.
    if (ctx === 'folder') {
      const items: MenuItem[] = [
        { id: 'folder-open', label: 'Open', icon: FolderOpen, tone: 'accent' },
      ];
      if (contextFolderIsRoot) {
        items.push({ id: 'folder-rescan', label: 'Rescan', icon: RefreshCw, tone: 'neutral' });
      }
      items.push({ type: 'divider' });
      items.push({ id: 'folder-copy-path', label: 'Copy Path', icon: Copy, tone: 'neutral' });
      if (contextFolderIsRoot) {
        items.push({
          id: 'folder-remove',
          label: 'Remove from Library',
          icon: FolderMinus,
          tone: 'neutral',
        });
      }
      return items;
    }

    // Media context – play, queue and collection actions for this item.
    if (ctx === 'media') {
      const items: MenuItem[] = [
        { id: 'media-play', label: 'Play', icon: Play, tone: 'accent' },
        { type: 'divider' },
        { id: 'media-add-to-queue', label: 'Add to Queue', icon: ListMusic, tone: 'neutral' },
        { id: 'media-add-to-playlist', label: 'Add to Playlist', icon: ListPlus, tone: 'neutral' },
      ];
      // Watch Later is a video-only collection; music tracks use playlists.
      if (!contextMediaIsMusic) {
        items.push({
          id: 'media-toggle-watch-later',
          label: contextMediaInWatchLater ? 'Remove from Watch Later' : 'Add to Watch Later',
          icon: Clock,
          tone: 'neutral',
        });
      }
      items.push({ type: 'divider' });
      items.push({ id: 'media-show-info', label: 'Show Info', icon: Info, tone: 'neutral' });
      return items;
    }

    // Watch Later tab of the player-view library overlay.
    if (ctx === 'watchLater') {
      const items: MenuItem[] = [
        { id: 'watchlater-play', label: 'Play', icon: Play, tone: 'accent' },
        { id: 'watchlater-add-to-playlist', label: 'Add to Playlist', icon: ListPlus, tone: 'neutral' },
        { id: 'watchlater-remove', label: 'Remove from Watch Later', icon: X, tone: 'neutral' },
      ];
      return items;
    }

    // History tab of the player-view library overlay.
    if (ctx === 'history') {
      const items: MenuItem[] = [
        { id: 'history-play', label: 'Play', icon: Play, tone: 'accent' },
        { id: 'history-add-to-watch-later', label: 'Add to Watch Later', icon: Clock, tone: 'neutral' },
        { id: 'history-remove', label: 'Remove from History', icon: Trash2, tone: 'neutral' },
      ];
      return items;
    }

    // Bookmarks tab of the player-view library overlay.
    if (ctx === 'bookmark') {
      const items: MenuItem[] = [
        { id: 'bookmark-play', label: 'Play', icon: Play, tone: 'accent' },
        { id: 'bookmark-remove', label: 'Remove Bookmark', icon: Trash2, tone: 'neutral' },
      ];
      return items;
    }

    return compact ? compactMenuItems : buildAppMenu($history);
  })();
  $: submenuItems = new Map(
    activeMenuItems
      .filter((item): item is ActionItem => 'id' in item && Boolean(item.children?.length))
      .map((item) => [item.id, item]),
  );

  $: if (open) {
    // Track these values so the menu repositions when it is reopened elsewhere.
    x;
    y;
    viewportWidth;
    viewportHeight;
    void reposition();
  }

  $: if (!open) {
    openSubmenu = null;
  }

  async function reposition(): Promise<void> {
    await tick();

    const width = menuEl?.offsetWidth || MENU_WIDTH;
    const height = menuEl?.offsetHeight || 0;
    const maxLeft = Math.max(VIEWPORT_MARGIN, viewportWidth - width - VIEWPORT_MARGIN);
    const maxTop = Math.max(VIEWPORT_MARGIN, viewportHeight - height - VIEWPORT_MARGIN);

    menuLeft = Math.min(Math.max(VIEWPORT_MARGIN, x), maxLeft);
    menuTop = Math.min(Math.max(VIEWPORT_MARGIN, y), maxTop);
    // Flyouts are anchored to viewport coordinates, so drop them when the menu moves.
    openSubmenu = null;
  }

  function updateViewport(): void {
    if (typeof window === 'undefined') return;
    viewportWidth = window.innerWidth;
    viewportHeight = window.innerHeight;
  }

  /**
   * Open the flyout for a row, anchored to the row's viewport rectangle.
   * Fixed positioning keeps the flyout out of the menu's scroll/clip box, and
   * the horizontal side flips when the row sits close to the right edge.
   */
  function openSubmenuForRow(row: HTMLElement | null): void {
    const id = row?.dataset.itemId;
    const item = id ? submenuItems.get(id) : undefined;

    if (!row || !item) {
      openSubmenu = null;
      return;
    }

    const rect = row.getBoundingClientRect();
    const estimatedHeight = item.children!.length * SUBMENU_ITEM_HEIGHT + SUBMENU_PADDING;
    const flip = viewportWidth - rect.right < SUBMENU_FLIP_THRESHOLD;
    const lowestTop = viewportHeight - estimatedHeight - VIEWPORT_MARGIN;

    submenuTop = Math.max(VIEWPORT_MARGIN, Math.min(rect.top, lowestTop));
    submenuLeft = flip
      ? Math.max(VIEWPORT_MARGIN, rect.left - SUBMENU_WIDTH + 2)
      : rect.right - 2;
    openSubmenu = item.id;
  }

  /** Delegated fallback so the flyout also opens for plain mouseover/focus events. */
  function handleRowMouseOver(event: MouseEvent | FocusEvent): void {
    const target = event.target as HTMLElement | null;
    const row = target?.closest?.('[data-menu-item]') as HTMLElement | null;

    if (!row || !menuEl?.contains(row)) return;
    if (row.dataset.itemId === openSubmenu) return;

    openSubmenuForRow(row);
  }

  function handleRowEnter(event: Event): void {
    openSubmenuForRow(event.currentTarget as HTMLElement);
  }

  function handleRowClick(item: ActionItem, event: MouseEvent): void {
    handleItemClick(item, event.currentTarget as HTMLElement);
  }

  function handleRowClickWrapper(item: ActionItem): (event: MouseEvent) => void {
    return (event: MouseEvent) => handleItemClick(item, event.currentTarget as HTMLElement);
  }

  function handleItemClick(item: ActionItem, row: HTMLElement | null): void {
    if (item.children?.length) {
      if (openSubmenu === item.id) {
        openSubmenu = null;
        return;
      }

      openSubmenuForRow(row);
      return;
    }

    select(item.id);
  }

  function select(id: string): void {
    onAction(id);
    onClose();
  }

  function handleMenuLeave(e: MouseEvent): void {
    const submenu = document.querySelector('[data-context-submenu]');
    const related = e.relatedTarget as Node | null;
    if (!submenu || !related || submenu.contains(related)) return;
    openSubmenu = null;
  }

  function handleSubmenuLeave(e: MouseEvent): void {
    const menu = document.querySelector('[data-context-menu]');
    const related = e.relatedTarget as Node | null;
    if (!menu || !related || menu.contains(related)) return;
    openSubmenu = null;
  }

  onMount(() => {
    updateViewport();

    function handleKeydown(event: KeyboardEvent): void {
      if (!open) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    }

    function handlePointerDown(event: PointerEvent): void {
      if (!open) return;

      const target = event.target as Node | null;
      if (target && menuEl?.contains(target)) return;

      onClose();
    }

    function handleResize(): void {
      updateViewport();
    }

    window.addEventListener('keydown', handleKeydown, true);
    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('keydown', handleKeydown, true);
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('resize', handleResize);
    };
  });
</script>

{#if open}
  <div
    bind:this={menuEl}
    class="fixed z-50 w-[350px] rounded-[10px] border border-vlc-border bg-vlc-panel py-1.5 shadow-2xl"
    style={`left: ${menuLeft}px; top: ${menuTop}px;`}
    role="menu"
    tabindex="-1"
    aria-label="Kanea context menu"
    data-context-menu
    on:contextmenu={(event) => {
      event.preventDefault();
      event.stopPropagation();
    }}
    on:mouseover={handleRowMouseOver}
    on:focus={handleRowMouseOver}
    on:mouseleave={handleMenuLeave}
    on:scroll={() => (openSubmenu = null)}
  >
    {#each activeMenuItems as item, index (item.type === 'divider' ? `divider-${index}` : item.id)}
      {#if item.type === 'divider'}
        <div class="my-1.5 mx-3 h-px bg-vlc-border" role="separator" data-menu-divider></div>
      {:else}
        <div class="relative">
          <button
            type="button"
            class="mx-1 flex h-10 items-center gap-3 rounded-md px-3 text-left transition-colors hover:bg-vlc-raised focus-visible:bg-vlc-raised focus-visible:outline-none"
            role="menuitem"
            aria-haspopup={item.children ? 'menu' : undefined}
            aria-expanded={item.children ? openSubmenu === item.id : undefined}
            data-menu-item
            data-item-id={item.id}
            data-has-children={item.children ? 'true' : 'false'}
            on:click={handleRowClickWrapper(item)}
            on:mouseenter={handleRowEnter}
            on:pointerenter={handleRowEnter}
            on:focus={handleRowEnter}
          >
            <span
              class={`flex h-5 w-5 shrink-0 items-center justify-center ${item.tone === 'accent' ? 'text-vlc-orangeText' : item.tone === 'orange' ? 'text-vlc-orange' : 'text-vlc-secondary'}`}
              aria-hidden="true"
            >
              <svelte:component this={item.icon} size={16} strokeWidth={1.6} />
            </span>

            <span class="min-w-0 flex-1 truncate text-[13px] text-vlc-text">{item.label}</span>

            {#if item.shortcut}
              <span class="ml-auto shrink-0 text-[12px] text-vlc-secondary tabular-nums">{item.shortcut}</span>
            {/if}

            {#if item.children}
              <ChevronRight size={14} strokeWidth={2} class="shrink-0 text-vlc-muted" />
            {/if}
          </button>

          {#if item.children && openSubmenu === item.id}
            <div
              class="fixed z-10 overflow-y-auto overscroll-contain rounded-[10px] border border-vlc-border bg-vlc-panel py-1.5 shadow-2xl"
              style={`top: ${submenuTop}px; left: ${submenuLeft}px; width: ${SUBMENU_WIDTH}px; max-height: ${
                viewportHeight - submenuTop - VIEWPORT_MARGIN
              }px;`}
              role="menu"
              tabindex="-1"
              aria-label={`${item.label} submenu`}
              data-context-submenu
              on:mouseleave={handleSubmenuLeave}
            >
              {#each item.children as child (child.id)}
                <button
                  type="button"
                  class="mx-1 flex h-10 w-[calc(100%-0.5rem)] items-center justify-between gap-3 rounded-md px-3 text-left text-[13px] text-vlc-text transition-colors hover:bg-vlc-raised focus-visible:bg-vlc-raised focus-visible:outline-none"
                  role="menuitem"
                  data-submenu-item
                  on:click={() => select(child.id)}
                >
                  <span class="truncate">{child.label}</span>
                  {#if child.shortcut}
                    <span class="shrink-0 text-[12px] text-vlc-secondary tabular-nums">{child.shortcut}</span>
                  {/if}
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    {/each}
  </div>
{/if}

<style>
  /* Keep all rows reachable on short viewports without changing the menu at normal sizes. */
  @media (max-height: 656px) {
    [data-context-menu] {
      max-height: calc(100vh - 16px);
      overflow-y: auto;
      overscroll-behavior: contain;
    }
  }
</style>
