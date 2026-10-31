<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { AlertTriangle, GripVertical, Keyboard, RotateCcw, Search, X } from 'lucide-svelte';
  import {
    DEFAULT_HOTKEYS,
    resetHotkeysToDefault,
    settings,
    updateHotkey,
  } from '../../stores/settings';

  export let onClose: () => void = () => {};
  /** Element to focus when the window closes (usually the button that opened it). */
  export let returnFocus: HTMLElement | null = null;

  const STORAGE_KEY = 'vlc.hotkeys.window.v1';
  const MARGIN = 12;
  const WINDOW_WIDTH = 620;

  interface StoredPosition {
    x: number;
    y: number;
  }

  interface HotkeyRow {
    action: string;
    shortcut: string;
    index: number;
  }

  const GROUPS: Array<{ label: string; actions: string[] }> = [
    { label: 'Playback', actions: ['Play / Pause', 'Stop', 'Mute'] },
    {
      label: 'Navigation',
      actions: [
        'Previous',
        'Next',
        'Seek Forward 5s',
        'Seek Backward 5s',
        'Seek Forward 60s',
        'Seek Backward 60s',
      ],
    },
    { label: 'Audio', actions: ['Volume Up', 'Volume Down'] },
    { label: 'View', actions: ['Fullscreen'] },
  ];
  const OTHER_GROUP = 'Other actions';
  const GROUP_ORDER = [...GROUPS.map((group) => group.label), OTHER_GROUP];

  let windowEl: HTMLDivElement | null = null;
  let headerEl: HTMLElement | null = null;
  let searchInput: HTMLInputElement | null = null;

  let query = '';
  let recordingIndex: number | null = null;
  let captureError = '';

  let position: StoredPosition = defaultPosition();
  let dragging = false;
  let dragPointerId: number | null = null;
  let dragOffset: StoredPosition = { x: 0, y: 0 };

  function defaultPosition(): StoredPosition {
    if (typeof window === 'undefined') return { x: 48, y: 48 };
    const width = window.innerWidth;
    const height = window.innerHeight;
    return {
      x: Math.max(MARGIN, Math.round((width - Math.min(WINDOW_WIDTH, width - MARGIN * 2)) / 2)),
      y: Math.max(MARGIN, Math.round(height * 0.12)),
    };
  }

  function clampPosition(x: number, y: number): StoredPosition {
    if (typeof window === 'undefined') return { x, y };

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.min(WINDOW_WIDTH, viewportWidth - MARGIN * 2);
    const height = Math.min(windowEl?.offsetHeight ?? 520, viewportHeight - MARGIN * 2);

    return {
      x: Math.min(Math.max(MARGIN, x), Math.max(MARGIN, viewportWidth - width - MARGIN)),
      y: Math.min(Math.max(MARGIN, y), Math.max(MARGIN, viewportHeight - height - MARGIN)),
    };
  }

  function readStoredPosition(): StoredPosition | null {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed !== 'object' || parsed === null) return null;
      const candidate = parsed as Partial<StoredPosition>;
      if (
        typeof candidate.x !== 'number' ||
        !Number.isFinite(candidate.x) ||
        typeof candidate.y !== 'number' ||
        !Number.isFinite(candidate.y)
      ) {
        return null;
      }
      return { x: candidate.x, y: candidate.y };
    } catch {
      return null;
    }
  }

  function persistPosition(): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(position));
    } catch {
      // Position is a convenience only; keep working without storage.
    }
  }

  function close(): void {
    onClose();
  }

  function restoreFocus(): void {
    if (returnFocus?.isConnected) {
      returnFocus.focus();
      return;
    }
    const fallback = document.querySelector<HTMLElement>('[data-hotkeys-return-fallback]');
    fallback?.focus();
  }

  function normalizeShortcut(shortcut: string): string {
    return shortcut.replace(/\s+/g, '').toLowerCase();
  }

  function groupFor(action: string): string {
    return GROUPS.find((group) => group.actions.includes(action))?.label ?? OTHER_GROUP;
  }

  function defaultShortcutFor(action: string): string | null {
    const match = DEFAULT_HOTKEYS.find((hotkey) => hotkey.action === action);
    return match ? match.shortcut : null;
  }

  function keyLabel(key: string): string {
    const labels: Record<string, string> = {
      ' ': 'Space',
      ArrowUp: '↑',
      ArrowDown: '↓',
      ArrowLeft: '←',
      ArrowRight: '→',
      Escape: 'Esc',
      PageUp: 'Page Up',
      PageDown: 'Page Down',
      Backspace: 'Backspace',
      Delete: 'Delete',
    };
    if (labels[key]) return labels[key];
    return key.length === 1 ? key.toUpperCase() : key;
  }

  function formatShortcut(event: KeyboardEvent): string {
    const parts: string[] = [];
    if (event.ctrlKey) parts.push('Ctrl');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');
    if (event.metaKey) parts.push('Meta');
    parts.push(keyLabel(event.key));
    return parts.join('+');
  }

  function startRecording(index: number): void {
    recordingIndex = index;
    captureError = '';
  }

  function cancelRecording(): void {
    recordingIndex = null;
    captureError = '';
  }

  function finishRecording(): void {
    recordingIndex = null;
    captureError = '';
  }

  function handleRecordKey(event: KeyboardEvent): void {
    if (recordingIndex === null) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      cancelRecording();
      return;
    }

    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault();
      event.stopPropagation();
      updateHotkey(recordingIndex, '');
      finishRecording();
      return;
    }

    // Tab keeps its normal focus behaviour; just stop recording.
    if (event.key === 'Tab') {
      cancelRecording();
      return;
    }

    if (['Control', 'Shift', 'Alt', 'Meta', 'CapsLock'].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const isLetterOrNumber = /^[a-z0-9]$/i.test(event.key);
    const hasModifier = event.ctrlKey || event.altKey || event.metaKey;

    if (isLetterOrNumber && !hasModifier) {
      captureError = 'Add Ctrl, Alt, or Meta to use a letter or number.';
      return;
    }

    const shortcut = formatShortcut(event);
    if (!shortcut) return;

    updateHotkey(recordingIndex, shortcut);
    finishRecording();
  }

  function handleKeydownCapture(event: KeyboardEvent): void {
    if (recordingIndex !== null) {
      handleRecordKey(event);
      return;
    }

    if (event.key !== 'Escape') return;

    // Only own Escape when focus is actually inside the floating window.
    const target = event.target;
    if (!(target instanceof Node) || !windowEl?.contains(target)) return;

    event.preventDefault();
    // Keep the settings modal (if it is open behind us) from closing too.
    event.stopPropagation();
    close();
  }

  function handlePointerDownOutside(event: PointerEvent): void {
    if (recordingIndex === null) return;
    const target = event.target;
    if (target instanceof Node && windowEl?.contains(target)) return;
    cancelRecording();
  }

  function handleDragStart(event: PointerEvent): void {
    if (event.button !== 0) return;

    const target = event.target as HTMLElement | null;
    const isHandle = Boolean(target?.closest('[data-drag-handle]'));
    if (!isHandle && target?.closest('button')) return;

    dragging = true;
    dragPointerId = event.pointerId;
    dragOffset = { x: event.clientX - position.x, y: event.clientY - position.y };
    headerEl?.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function handlePointerMove(event: PointerEvent): void {
    if (!dragging) return;
    position = clampPosition(event.clientX - dragOffset.x, event.clientY - dragOffset.y);
  }

  function handlePointerUp(event: PointerEvent): void {
    if (!dragging) return;
    dragging = false;
    if (dragPointerId !== null && headerEl?.hasPointerCapture?.(dragPointerId)) {
      headerEl.releasePointerCapture(dragPointerId);
    }
    dragPointerId = null;
    position = clampPosition(position.x, position.y);
    persistPosition();
    void event;
  }

  function handleMoveKeydown(event: KeyboardEvent): void {
    const step = event.shiftKey ? 48 : 16;
    let dx = 0;
    let dy = 0;

    if (event.key === 'ArrowLeft') dx = -step;
    else if (event.key === 'ArrowRight') dx = step;
    else if (event.key === 'ArrowUp') dy = -step;
    else if (event.key === 'ArrowDown') dy = step;
    else if (event.key === 'Home') {
      event.preventDefault();
      position = defaultPosition();
      persistPosition();
      return;
    } else {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    position = clampPosition(position.x + dx, position.y + dy);
    persistPosition();
  }

  function resetPosition(): void {
    position = defaultPosition();
    persistPosition();
  }

  function resetRow(index: number): void {
    const action = $settings.hotkeys[index]?.action;
    if (!action) return;
    updateHotkey(index, defaultShortcutFor(action) ?? '');
    cancelRecording();
  }

  function resetAll(): void {
    resetHotkeysToDefault();
    cancelRecording();
  }

  function handleResize(): void {
    position = clampPosition(position.x, position.y);
    persistPosition();
  }

  onMount(() => {
    const stored = readStoredPosition();
    if (stored) position = clampPosition(stored.x, stored.y);

    document.addEventListener('keydown', handleKeydownCapture, true);
    document.addEventListener('pointerdown', handlePointerDownOutside, true);
    window.addEventListener('resize', handleResize);

    void tick().then(() => {
      position = clampPosition(position.x, position.y);
      persistPosition();
      searchInput?.focus();
    });
  });

  onDestroy(() => {
    document.removeEventListener('keydown', handleKeydownCapture, true);
    document.removeEventListener('pointerdown', handlePointerDownOutside, true);
    window.removeEventListener('resize', handleResize);
    restoreFocus();
  });

  $: normalizedQuery = query.trim().toLowerCase();
  $: filteredRows = $settings.hotkeys
    .map((hotkey, index) => ({ action: hotkey.action, shortcut: hotkey.shortcut, index }))
    .filter((row) => {
      if (!normalizedQuery) return true;
      return [row.action, row.shortcut, groupFor(row.action)]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery);
    });

  $: groupedRows = (() => {
    const map = new Map<string, HotkeyRow[]>(GROUP_ORDER.map((label) => [label, []]));
    for (const row of filteredRows) map.get(groupFor(row.action))?.push(row);
    return GROUP_ORDER.map((label) => ({ label, rows: map.get(label) ?? [] })).filter(
      (group) => group.rows.length > 0,
    );
  })();

  $: conflictIndexes = (() => {
    const byShortcut = new Map<string, number[]>();
    $settings.hotkeys.forEach((hotkey, index) => {
      const key = normalizeShortcut(hotkey.shortcut);
      if (!key) return;
      const indexes = byShortcut.get(key) ?? [];
      indexes.push(index);
      byShortcut.set(key, indexes);
    });

    const conflicts = new Set<number>();
    for (const indexes of byShortcut.values()) {
      if (indexes.length > 1) indexes.forEach((index) => conflicts.add(index));
    }
    return conflicts;
  })();

  $: conflictCount = (() => {
    const keys = new Set<string>();
    for (const index of conflictIndexes) {
      const key = normalizeShortcut($settings.hotkeys[index]?.shortcut ?? '');
      if (key) keys.add(key);
    }
    return keys.size;
  })();

  function conflictNames(index: number): string {
    const shortcut = normalizeShortcut($settings.hotkeys[index]?.shortcut ?? '');
    if (!shortcut) return '';
    return $settings.hotkeys
      .filter(
        (hotkey, otherIndex) =>
          otherIndex !== index && normalizeShortcut(hotkey.shortcut) === shortcut,
      )
      .map((hotkey) => hotkey.action)
      .join(', ');
  }
</script>

<svelte:window on:pointermove={handlePointerMove} on:pointerup={handlePointerUp} on:pointercancel={handlePointerUp} />

<div
  bind:this={windowEl}
  class="fixed z-[60] flex w-[620px] max-w-[calc(100vw_-_24px)] flex-col overflow-hidden rounded-[12px] border border-vlc-borderStrong bg-vlc-app shadow-[0_24px_80px_var(--shadow-color)]"
  style={`left: ${position.x}px; top: ${position.y}px; max-height: calc(100vh - 24px);`}
  role="dialog"
  aria-labelledby="hotkeys-window-title"
  tabindex="-1"
  data-hotkeys-window
>
  <header
    bind:this={headerEl}
    class="flex h-12 shrink-0 select-none items-center gap-2.5 border-b border-vlc-border bg-vlc-panel px-2.5"
    class:cursor-grabbing={dragging}
    class:cursor-grab={!dragging}
    on:pointerdown={handleDragStart}
  >
    <button
      type="button"
      data-drag-handle
      class="flex h-7 w-7 shrink-0 cursor-grab items-center justify-center rounded-[6px] text-vlc-dim transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60 active:cursor-grabbing"
      aria-label="Move window with the arrow keys"
      title="Move window (arrow keys, Shift for larger steps)"
      on:keydown={handleMoveKeydown}
    >
      <GripVertical size={15} strokeWidth={1.8} aria-hidden="true" />
    </button>

    <Keyboard size={17} strokeWidth={1.7} class="shrink-0 text-vlc-orangeText" aria-hidden="true" />
    <h2 id="hotkeys-window-title" class="min-w-0 truncate text-[14px] font-medium text-vlc-text">
      Keyboard Shortcuts
    </h2>

    {#if conflictCount > 0}
      <span
        class="ml-1 inline-flex shrink-0 items-center gap-1 rounded-full bg-vlc-orange/15 px-2 py-0.5 text-[11px] text-vlc-orangeText"
        title="Two or more actions use the same shortcut"
      >
        <AlertTriangle size={12} strokeWidth={2} aria-hidden="true" />
        {conflictCount} {conflictCount === 1 ? 'conflict' : 'conflicts'}
      </span>
    {/if}

    <div class="ml-auto flex shrink-0 items-center gap-1">
      <button
        type="button"
        class="flex h-8 w-8 items-center justify-center rounded-[6px] text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60"
        aria-label="Reset window position"
        title="Reset window position"
        on:click={resetPosition}
      >
        <RotateCcw size={15} strokeWidth={1.8} aria-hidden="true" />
      </button>
      <button
        type="button"
        class="flex h-8 w-8 items-center justify-center rounded-[6px] text-vlc-secondary transition-colors hover:bg-vlc-danger/20 hover:text-vlc-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60"
        aria-label="Close keyboard shortcuts"
        title="Close keyboard shortcuts"
        on:click={close}
      >
        <X size={17} strokeWidth={1.8} aria-hidden="true" />
      </button>
    </div>
  </header>

  <div class="flex min-h-0 flex-1 flex-col gap-3 p-4">
    <label class="relative block">
      <Search
        size={16}
        strokeWidth={1.7}
        class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-vlc-muted"
        aria-hidden="true"
      />
      <input
        bind:this={searchInput}
        bind:value={query}
        type="text"
        placeholder="Search actions or shortcuts"
        aria-label="Search keyboard shortcuts"
        autocomplete="off"
        spellcheck="false"
        class="h-9 w-full rounded-[8px] border border-vlc-border bg-vlc-card pl-9 pr-3 text-[13px] text-vlc-text outline-none transition-colors placeholder:text-vlc-muted focus:border-vlc-orange/70 focus-visible:ring-2 focus-visible:ring-vlc-orange/40"
      />
    </label>

    <p class="text-[12px] leading-5 text-vlc-muted">
      Shortcuts apply immediately. Click a shortcut to record it; <kbd class="font-mono text-vlc-secondary">Esc</kbd>
      cancels and <kbd class="font-mono text-vlc-secondary">Backspace</kbd> clears.
    </p>

    {#if captureError}
      <p class="rounded-[6px] bg-vlc-danger/10 px-2.5 py-1.5 text-[12px] text-vlc-danger" role="alert">
        {captureError}
      </p>
    {/if}

    <div
      class="min-h-[140px] max-h-[min(52vh,calc(100vh_-_360px))] overflow-y-auto overscroll-contain rounded-[8px] border border-vlc-border bg-vlc-panel/40 p-1.5"
      role="region"
      aria-label="Shortcut actions"
    >
      {#if groupedRows.length === 0}
        <p class="px-3 py-8 text-center text-[13px] text-vlc-muted">
          {normalizedQuery
            ? `No shortcuts match “${query.trim()}”.`
            : 'No shortcuts are configured yet.'}
        </p>
      {:else}
        {#each groupedRows as group (group.label)}
          <section class="mb-1 last:mb-0" aria-label={group.label}>
            <h3 class="px-2 pb-1 pt-2 text-[11px] uppercase tracking-[0.08em] text-vlc-muted">
              {group.label}
            </h3>
            {#each group.rows as row (row.index)}
              {@const conflict = conflictIndexes.has(row.index)}
              {@const recording = recordingIndex === row.index}
              <div
                class="flex items-center gap-2 rounded-[6px] px-2 py-1.5 transition-colors hover:bg-vlc-raised/60"
              >
                <span class="min-w-0 flex-1 truncate text-[13px] text-vlc-text">{row.action}</span>

                {#if conflict}
                  <span
                    class="inline-flex shrink-0 items-center gap-1 rounded-full bg-vlc-orange/15 px-1.5 py-0.5 text-[10px] text-vlc-orangeText"
                    title={`Also used by ${conflictNames(row.index)}`}
                    aria-label={`Shortcut conflict, also used by ${conflictNames(row.index)}`}
                  >
                    <AlertTriangle size={11} strokeWidth={2} aria-hidden="true" />
                    Conflict
                  </span>
                {/if}

                <button
                  type="button"
                  class={`flex h-8 min-w-[150px] items-center justify-center rounded-[6px] border px-3 font-mono text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60 ${
                    recording
                      ? 'border-vlc-orange/60 bg-vlc-orange/15 text-vlc-orangeText'
                      : 'border-vlc-border bg-vlc-card text-vlc-text hover:border-vlc-orange/50 hover:bg-vlc-raised'
                  }`}
                  aria-label={recording
                    ? `Recording shortcut for ${row.action}. Press a key combination; Escape cancels.`
                    : `Change shortcut for ${row.action}, currently ${row.shortcut || 'unassigned'}`}
                  aria-live="polite"
                  on:click={() => startRecording(row.index)}
                >
                  {recording ? 'Press keys…' : row.shortcut || 'Unassigned'}
                </button>

                <button
                  type="button"
                  class="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] text-vlc-dim transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60"
                  aria-label={`Reset shortcut for ${row.action}`}
                  title="Reset this shortcut"
                  on:click={() => resetRow(row.index)}
                >
                  <RotateCcw size={13} strokeWidth={1.8} aria-hidden="true" />
                </button>
              </div>
            {/each}
          </section>
        {/each}
      {/if}
    </div>

    <div class="flex items-center justify-between gap-3 border-t border-vlc-border pt-3">
      <p class="text-[11px] text-vlc-muted">
        {$settings.hotkeys.length} actions · Saved automatically
      </p>
      <button
        type="button"
        class="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-vlc-border bg-vlc-raised px-3 text-[12px] text-vlc-secondary transition-colors hover:border-vlc-orange/50 hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60"
        on:click={resetAll}
      >
        <RotateCcw size={13} strokeWidth={1.8} aria-hidden="true" />
        Reset all
      </button>
    </div>
  </div>
</div>
