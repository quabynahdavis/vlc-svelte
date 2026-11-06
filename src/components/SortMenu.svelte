<script lang="ts">
  import { tick } from 'svelte';
  import { ArrowDown, ArrowUp, ArrowUpDown, Check } from 'lucide-svelte';

  interface SortOption {
    key: string;
    label: string;
  }

  /** Sort axes offered in the menu. */
  export let options: SortOption[] = [];
  /** Active sort key from `options`. */
  export let value = '';
  export let onValueChange: (key: string) => void = () => {};
  /**
   * Sort direction shown as the trailing menu item, exactly like the library
   * toolbar sorter. Leave `null` when the values already encode direction
   * (e.g. Newest / Oldest) and no separate axis is needed.
   */
  export let direction: 'asc' | 'desc' | null = null;
  export let onToggleDirection: () => void = () => {};
  /** Accessible base name for the trigger and menu. */
  export let label = 'Sort';

  let sortOpen = false;
  let sortRoot: HTMLDivElement;
  let sortMenu: HTMLDivElement;
  const menuId = `sort-menu-${Math.random().toString(36).slice(2, 10)}`;

  const directionLabels: Record<'asc' | 'desc', string> = {
    asc: 'Ascending',
    desc: 'Descending',
  };

  $: activeSortLabel = options.find((option) => option.key === value)?.label ?? label;
  $: directionLabel = direction === null ? '' : directionLabels[direction];

  async function toggleSortMenu() {
    sortOpen = !sortOpen;
    if (!sortOpen) return;

    await tick();
    sortMenu?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  }

  function closeSortMenu(refocus = false) {
    sortOpen = false;
    if (!refocus) return;

    requestAnimationFrame(() => {
      sortRoot?.querySelector<HTMLElement>('[data-sort-trigger]')?.focus();
    });
  }

  function selectSortKey(key: string) {
    onValueChange(key);
    closeSortMenu(true);
  }

  function toggleDirection() {
    onToggleDirection();
    closeSortMenu(true);
  }

  function handleWindowPointer(event: MouseEvent) {
    if (!sortOpen) return;
    const target = event.target;
    if (target instanceof Node && sortRoot?.contains(target)) return;
    sortOpen = false;
  }

  function handleWindowKeydown(event: KeyboardEvent) {
    if (!sortOpen || event.key !== 'Escape') return;
    event.preventDefault();
    closeSortMenu(true);
  }

  function handleSortMenuKeydown(event: KeyboardEvent) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;

    const items = Array.from(sortMenu?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? []);
    if (items.length === 0) return;

    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    let nextIndex = 0;

    if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % items.length;
    else if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + items.length) % items.length;
    else if (event.key === 'End') nextIndex = items.length - 1;

    items[nextIndex]?.focus();
  }

  function handleSortFocusOut(event: FocusEvent) {
    if (!sortOpen) return;
    const next = event.relatedTarget;
    if (next instanceof Node && sortRoot?.contains(next)) return;
    sortOpen = false;
  }
</script>

<svelte:window on:click={handleWindowPointer} on:keydown={handleWindowKeydown} />

<div class="relative" bind:this={sortRoot} on:focusout={handleSortFocusOut}>
  <button
    type="button"
    data-sort-trigger
    class="flex h-8 items-center gap-1.5 rounded-control px-2 text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/50"
    title={`${activeSortLabel}${directionLabel ? ` (${directionLabel.toLowerCase()})` : ''}`}
    aria-label={`${label}, currently ${activeSortLabel}${directionLabel ? `, ${directionLabel.toLowerCase()}` : ''}`}
    aria-haspopup="menu"
    aria-expanded={sortOpen}
    aria-controls={sortOpen ? menuId : undefined}
    on:click={toggleSortMenu}
  >
    <ArrowUpDown size={16} strokeWidth={1.75} aria-hidden="true" />
    <span class="whitespace-nowrap text-xs">{activeSortLabel}</span>
    {#if direction !== null}
      {#if direction === 'asc'}
        <ArrowUp size={12} strokeWidth={2} aria-hidden="true" />
      {:else}
        <ArrowDown size={12} strokeWidth={2} aria-hidden="true" />
      {/if}
    {/if}
  </button>

  {#if sortOpen}
    <div
      id={menuId}
      bind:this={sortMenu}
      role="menu"
      tabindex="-1"
      aria-label={`${label} by`}
      class="absolute right-0 top-full z-30 mt-1 w-44 rounded-control border border-vlc-borderStrong bg-vlc-panel p-1 shadow-2xl"
      on:keydown={handleSortMenuKeydown}
    >
      <p class="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-vlc-muted">
        Sort by
      </p>

      {#each options as option (option.key)}
        <button
          type="button"
          role="menuitemradio"
          aria-checked={value === option.key}
          tabindex="-1"
          class="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/50 {value === option.key
            ? 'bg-vlc-raised text-vlc-text'
            : 'text-vlc-secondary hover:bg-vlc-raised hover:text-vlc-text'}"
          on:click={() => selectSortKey(option.key)}
        >
          <Check
            size={13}
            strokeWidth={2}
            class={value === option.key ? 'text-vlc-orangeText' : 'text-transparent'}
            aria-hidden="true"
          />
          <span class="flex-1">{option.label}</span>
        </button>
      {/each}

      {#if direction !== null}
        <div class="my-1 h-px bg-vlc-border" role="separator"></div>

        <button
          type="button"
          role="menuitemcheckbox"
          aria-checked={direction === 'desc'}
          tabindex="-1"
          class="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-xs text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/50"
          title="Toggle direction"
          on:click={toggleDirection}
        >
          <Check
            size={13}
            strokeWidth={2}
            class={direction === 'desc' ? 'text-vlc-orangeText' : 'text-transparent'}
            aria-hidden="true"
          />
          <span class="flex-1">{directionLabels[direction]}</span>
          {#if direction === 'desc'}
            <ArrowDown size={12} strokeWidth={2} aria-hidden="true" />
          {:else}
            <ArrowUp size={12} strokeWidth={2} aria-hidden="true" />
          {/if}
        </button>
      {/if}
    </div>
  {/if}
</div>
