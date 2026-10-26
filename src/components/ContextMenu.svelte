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

  const MENU_WIDTH = 300;
  const VIEWPORT_MARGIN = 8;

  $: flipSubmenu =
    openSubmenu !== null && menuLeft + MENU_WIDTH + 214 > viewportWidth - VIEWPORT_MARGIN;

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
  }

  function updateViewport(): void {
    if (typeof window === 'undefined') return;
    viewportWidth = window.innerWidth;
    viewportHeight = window.innerHeight;
  }

  function handleHover(item: ActionItem): void {
    openSubmenu = item.children ? item.id : null;
  }

  function handleItemClick(item: ActionItem): void {
    if (item.children?.length) {
      openSubmenu = openSubmenu === item.id ? null : item.id;
      return;
    }

    select(item.id);
  }

  function select(id: string): void {
    onAction(id);
    onClose();
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
    class="fixed z-50 w-[300px] rounded-panel border border-[#262626] bg-[#181818] p-1.5 shadow-xl"
    style={`left: ${menuLeft}px; top: ${menuTop}px;`}
    role="menu"
    tabindex="-1"
    aria-label="VLC context menu"
    data-context-menu
    on:contextmenu={(event) => {
      event.preventDefault();
      event.stopPropagation();
    }}
    on:mouseleave={() => (openSubmenu = null)}
  >
    {#each menuItems as item, index (item.type === 'divider' ? `divider-${index}` : item.id)}
      {#if item.type === 'divider'}
        <div class="my-1 h-px bg-[#262626]" role="separator" data-menu-divider></div>
      {:else}
        <div class="relative">
          <button
            type="button"
            class="flex h-11 w-full items-center gap-3 rounded-lg px-2 text-left transition-colors hover:bg-[#232323] focus-visible:bg-[#232323] focus-visible:outline-none"
            role="menuitem"
            aria-haspopup={item.children ? 'menu' : undefined}
            aria-expanded={item.children ? openSubmenu === item.id : undefined}
            data-menu-item
            on:click={() => handleItemClick(item)}
            on:mouseenter={() => handleHover(item)}
            on:focus={() => handleHover(item)}
          >
            <span
              class="flex h-5 w-5 shrink-0 items-center justify-center"
              style={`color: ${item.tone === 'accent' ? '#AB6314' : '#8F8F8F'}`}
              aria-hidden="true"
            >
              <svelte:component this={item.icon} size={20} strokeWidth={1.6} />
            </span>

            <span class="min-w-0 flex-1 truncate text-[14px] text-[#B8B8B8]">{item.label}</span>

            {#if item.shortcut}
              <span class="shrink-0 text-[12px] text-[#6B6B6B]">{item.shortcut}</span>
            {/if}

            {#if item.children}
              <ChevronRight size={14} strokeWidth={2} class="shrink-0 text-[#6B6B6B]" />
            {/if}
          </button>

          {#if item.children && openSubmenu === item.id}
            <div
              class="absolute top-0 z-10 w-[208px] rounded-panel border border-[#262626] bg-[#181818] p-1.5 shadow-xl"
              style={flipSubmenu
                ? 'right: calc(100% - 1px);'
                : 'left: calc(100% - 1px);'}
              role="menu"
              tabindex="-1"
              aria-label={`${item.label} submenu`}
              data-context-submenu
            >
              {#each item.children as child (child.id)}
                <button
                  type="button"
                  class="flex h-9 w-full items-center justify-between gap-3 rounded-md px-2.5 text-left text-[13px] text-[#B8B8B8] transition-colors hover:bg-[#232323] focus-visible:bg-[#232323] focus-visible:outline-none"
                  role="menuitem"
                  data-submenu-item
                  on:click={() => select(child.id)}
                >
                  <span class="truncate">{child.label}</span>
                  {#if child.shortcut}
                    <span class="shrink-0 text-[12px] text-[#6B6B6B]">{child.shortcut}</span>
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
