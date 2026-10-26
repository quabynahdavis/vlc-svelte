<script lang="ts">
  import {
    AudioLines,
    Captions,
    ChevronRight,
    Circle,
    Clapperboard,
    EyeOff,
    FolderOpen,
    ListVideo,
    LogOut,
    Play,
    PlayCircle,
    Settings,
    SkipBack,
    SkipForward,
    Square,
  } from 'lucide-svelte';
  import { onMount, tick } from 'svelte';
  import type { ComponentType } from 'svelte';

  export let x = 0;
  export let y = 0;
  export let open = false;
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
    tone?: 'accent' | 'neutral';
    children?: SubmenuItem[];
  };

  type MenuItem = ActionItem | DividerItem;

  const menuItems: MenuItem[] = [
    { id: 'play-pause', label: 'Play', shortcut: 'Space', icon: Play, tone: 'accent' },
    { id: 'stop', label: 'Stop', shortcut: 'S', icon: Square, tone: 'accent' },
    { id: 'previous-item', label: 'Previous Item', shortcut: 'P', icon: SkipBack, tone: 'accent' },
    { id: 'next-item', label: 'Next Item', shortcut: 'N', icon: SkipForward, tone: 'accent' },
    { id: 'record', label: 'Record', shortcut: 'R', icon: Circle, tone: 'accent' },
    { id: 'hide-ui', label: 'Hide UI', shortcut: 'Ctrl + \\', icon: EyeOff, tone: 'neutral' },
    { type: 'divider' },
    {
      id: 'playback',
      label: 'Playback',
      icon: PlayCircle,
      tone: 'accent',
      children: [
        { id: 'playback-speed', label: 'Speed' },
        { id: 'playback-jump-forward', label: 'Jump Forward' },
        { id: 'playback-jump-backward', label: 'Jump Backward' },
      ],
    },
    {
      id: 'video',
      label: 'Video',
      icon: Clapperboard,
      tone: 'neutral',
      children: [
        { id: 'video-fullscreen', label: 'Fullscreen' },
        { id: 'video-zoom', label: 'Zoom' },
        { id: 'video-aspect-ratio', label: 'Aspect Ratio' },
      ],
    },
    {
      id: 'audio',
      label: 'Audio',
      icon: AudioLines,
      tone: 'neutral',
      children: [
        { id: 'volume-up', label: 'Volume Up' },
        { id: 'volume-down', label: 'Volume Down' },
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
    {
      id: 'more-settings',
      label: 'More Settings',
      icon: Settings,
      tone: 'neutral',
      children: [
        { id: 'effects-compressor', label: 'Audio Effects' },
        { id: 'effects-video', label: 'Video Effects' },
        { id: 'effects-hide', label: 'Hide Effects Panel' },
      ],
    },
    {
      id: 'playlist',
      label: 'Playlist',
      icon: ListVideo,
      tone: 'neutral',
      children: [
        { id: 'playlist-add', label: 'Add to Playlist' },
        { id: 'playlist-clear', label: 'Clear Playlist' },
      ],
    },
    {
      id: 'open-media',
      label: 'Open Media',
      icon: FolderOpen,
      tone: 'neutral',
      children: [
        { id: 'open-file', label: 'Open File' },
        { id: 'open-folder', label: 'Open Folder' },
        { id: 'open-disc', label: 'Open Disc' },
        { id: 'open-network', label: 'Open Network Stream' },
      ],
    },
    { id: 'quit', label: 'Quit VLC', shortcut: 'Ctrl + Q', icon: LogOut, tone: 'neutral' },
  ];

  let menuEl: HTMLDivElement | null = null;
  let menuLeft = 8;
  let menuTop = 8;
  let viewportWidth = 1280;
  let viewportHeight = 800;
  let openSubmenu: string | null = null;
  let submenuLeft = 0;
  let submenuTop = 0;

  const MENU_WIDTH = 300;
  const SUBMENU_WIDTH = 208;
  const SUBMENU_ITEM_HEIGHT = 44;
  const SUBMENU_PADDING = 12;
  /** Keep this much room on the right before flipping the flyout to the left. */
  const SUBMENU_FLIP_THRESHOLD = 340;
  const VIEWPORT_MARGIN = 8;

  const submenuItems = new Map<string, ActionItem>();
  for (const item of menuItems) {
    if ('id' in item && item.children?.length) submenuItems.set(item.id, item);
  }

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

  /** Delegated fallback so the flyout also opens for plain mouseover events. */
  function handleRowMouseOver(event: MouseEvent): void {
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
    class="fixed z-50 w-[300px] rounded-panel border border-vlc-border bg-vlc-panel p-1.5 shadow-xl"
    style={`left: ${menuLeft}px; top: ${menuTop}px;`}
    role="menu"
    tabindex="-1"
    aria-label="VLC context menu"
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
    {#each menuItems as item, index (item.type === 'divider' ? `divider-${index}` : item.id)}
      {#if item.type === 'divider'}
        <div class="my-1 h-px bg-vlc-border" role="separator" data-menu-divider></div>
      {:else}
        <div class="relative">
          <button
            type="button"
            class="flex h-11 w-full items-center gap-3 rounded-lg px-2 text-left transition-colors hover:bg-vlc-raised focus-visible:bg-vlc-raised focus-visible:outline-none"
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
              class="flex h-5 w-5 shrink-0 items-center justify-center"
              style={`color: ${item.tone === 'accent' ? '#AB6314' : '#8F8F8F'}`}
              aria-hidden="true"
            >
              <svelte:component this={item.icon} size={20} strokeWidth={1.6} />
            </span>

            <span class="min-w-0 flex-1 truncate text-[14px] text-vlc-secondary">{item.label}</span>

            {#if item.shortcut}
              <span class="shrink-0 text-[12px] text-vlc-muted">{item.shortcut}</span>
            {/if}

            {#if item.children}
              <ChevronRight size={14} strokeWidth={2} class="shrink-0 text-vlc-muted" />
            {/if}
          </button>

          {#if item.children && openSubmenu === item.id}
            <div
              class="fixed z-10 overflow-y-auto overscroll-contain rounded-panel border border-vlc-border bg-vlc-panel p-1.5 shadow-xl"
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
                  class="flex h-11 w-full items-center justify-between gap-3 rounded-lg px-2.5 text-left text-[14px] text-vlc-secondary transition-colors hover:bg-vlc-raised focus-visible:bg-vlc-raised focus-visible:outline-none"
                  role="menuitem"
                  data-submenu-item
                  on:click={() => select(child.id)}
                >
                  <span class="truncate">{child.label}</span>
                  {#if child.shortcut}
                    <span class="shrink-0 text-[12px] text-vlc-muted">{child.shortcut}</span>
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
