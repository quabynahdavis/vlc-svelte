<script lang="ts">
  import {
    ArrowDown,
    ArrowUp,
    GripVertical,
    LayoutDashboard,
    RotateCcw,
  } from 'lucide-svelte';
  import { NAV_LABELS, type NavId } from '../../lib/constants';
  import type { DockMode } from '../../stores/ui';
  import {
    layout,
    moveDockTab,
    moveRailItem,
    PLAYER_CONTROL_IDS,
    PLAYER_CONTROL_LABELS,
    resetLayout,
    setPlayerControl,
    type PlayerControlId,
  } from '../../stores/layout';
  import InfoTip from './InfoTip.svelte';
  import Section from './Section.svelte';

  const dockLabels: Partial<Record<DockMode, string>> = {
    playback: 'Playback',
    video: 'Video',
    audio: 'Audio',
    visualizer: 'Visualizer',
    subtitles: 'Subtitles',
    bookmarks: 'Bookmarks & Chapters',
  };

  type DragKind = 'rail' | 'dock';

  let dragging: { kind: DragKind; index: number } | null = null;
  let dropTarget: { kind: DragKind; index: number } | null = null;

  const rowClass =
    'flex items-center gap-2 rounded-control border border-vlc-border bg-vlc-card px-2.5 py-2 transition-colors';
  const iconButtonClass =
    'flex h-6 w-6 shrink-0 items-center justify-center rounded-input text-vlc-muted transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/60 disabled:cursor-not-allowed disabled:opacity-30';

  function labelForRail(id: NavId): string {
    return NAV_LABELS[id];
  }

  function labelForDock(id: DockMode): string {
    return dockLabels[id] ?? id;
  }

  function startDrag(kind: DragKind, index: number, event: DragEvent): void {
    dragging = { kind, index };
    dropTarget = { kind, index };

    if (!event.dataTransfer) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', `${kind}:${index}`);
  }

  function dragOver(kind: DragKind, index: number, event: DragEvent): void {
    if (!dragging || dragging.kind !== kind) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    dropTarget = { kind, index };
  }

  function drop(kind: DragKind, index: number, event: DragEvent): void {
    event.preventDefault();

    if (dragging && dragging.kind === kind && dragging.index !== index) {
      if (kind === 'rail') moveRailItem(dragging.index, index);
      else moveDockTab(dragging.index, index);
    }

    dragging = null;
    dropTarget = null;
  }

  function endDrag(): void {
    dragging = null;
    dropTarget = null;
  }

  function move(kind: DragKind, index: number, direction: -1 | 1): void {
    const target = index + direction;

    if (kind === 'rail') {
      if (target < 0 || target >= $layout.railOrder.length) return;
      moveRailItem(index, target);
      return;
    }

    if (target < 0 || target >= $layout.dockTabOrder.length) return;
    moveDockTab(index, target);
  }

  function toggleControl(id: PlayerControlId): void {
    setPlayerControl(id, !$layout.playerControls[id]);
  }

  function isDropTarget(kind: DragKind, index: number): boolean {
    return dropTarget?.kind === kind && dropTarget.index === index;
  }
</script>

<div class="flex flex-col gap-8 pb-4" data-layout-panel>
  <Section title="Navigation rail">
    <div class="mb-3 flex items-start justify-between gap-4">
      <p class="max-w-[520px] text-[12px] leading-5 text-vlc-muted">
        Drag the rows or use the arrow buttons to reorder the primary navigation. The add button
        stays at the end.
      </p>
      <InfoTip text="The rail order is saved on this device and applies immediately." />
    </div>

    <ul class="flex flex-col gap-1.5" aria-label="Navigation rail order">
      {#each $layout.railOrder as id, index (id)}
        {@const isTarget = isDropTarget('rail', index)}
        <li
          class={`${rowClass} ${isTarget ? 'border-vlc-orange/60 bg-vlc-raised' : ''}`}
          draggable="true"
          data-layout-row="rail"
          on:dragstart={(event) => startDrag('rail', index, event)}
          on:dragover={(event) => dragOver('rail', index, event)}
          on:drop={(event) => drop('rail', index, event)}
          on:dragend={endDrag}
        >
          <span class="flex h-6 w-6 shrink-0 cursor-grab items-center justify-center text-vlc-muted active:cursor-grabbing" aria-hidden="true">
            <GripVertical size={14} strokeWidth={1.8} />
          </span>
          <span class="min-w-0 flex-1 truncate text-[13px] text-vlc-text">{labelForRail(id)}</span>
          <button
            type="button"
            class={iconButtonClass}
            title={`Move ${labelForRail(id)} up`}
            aria-label={`Move ${labelForRail(id)} up`}
            disabled={index === 0}
            on:click={() => move('rail', index, -1)}
          >
            <ArrowUp size={13} strokeWidth={2} aria-hidden="true" />
          </button>
          <button
            type="button"
            class={iconButtonClass}
            title={`Move ${labelForRail(id)} down`}
            aria-label={`Move ${labelForRail(id)} down`}
            disabled={index === $layout.railOrder.length - 1}
            on:click={() => move('rail', index, 1)}
          >
            <ArrowDown size={13} strokeWidth={2} aria-hidden="true" />
          </button>
        </li>
      {/each}
    </ul>
  </Section>

  <Section title="Sidebar tabs">
    <div class="mb-3 flex items-start justify-between gap-4">
      <p class="max-w-[520px] text-[12px] leading-5 text-vlc-muted">
        Choose the order of the tabs in the right sidebar. The strip switches to overflow
        chevrons when the tabs no longer fit.
      </p>
      <InfoTip text="Only the tab order changes. Each tab keeps its existing panel and shortcuts." />
    </div>

    <ul class="flex flex-col gap-1.5" aria-label="Sidebar tab order">
      {#each $layout.dockTabOrder as id, index (id)}
        {@const isTarget = isDropTarget('dock', index)}
        <li
          class={`${rowClass} ${isTarget ? 'border-vlc-orange/60 bg-vlc-raised' : ''}`}
          draggable="true"
          data-layout-row="dock"
          on:dragstart={(event) => startDrag('dock', index, event)}
          on:dragover={(event) => dragOver('dock', index, event)}
          on:drop={(event) => drop('dock', index, event)}
          on:dragend={endDrag}
        >
          <span class="flex h-6 w-6 shrink-0 cursor-grab items-center justify-center text-vlc-muted active:cursor-grabbing" aria-hidden="true">
            <GripVertical size={14} strokeWidth={1.8} />
          </span>
          <span class="min-w-0 flex-1 truncate text-[13px] text-vlc-text">{labelForDock(id)}</span>
          <button
            type="button"
            class={iconButtonClass}
            title={`Move ${labelForDock(id)} up`}
            aria-label={`Move ${labelForDock(id)} up`}
            disabled={index === 0}
            on:click={() => move('dock', index, -1)}
          >
            <ArrowUp size={13} strokeWidth={2} aria-hidden="true" />
          </button>
          <button
            type="button"
            class={iconButtonClass}
            title={`Move ${labelForDock(id)} down`}
            aria-label={`Move ${labelForDock(id)} down`}
            disabled={index === $layout.dockTabOrder.length - 1}
            on:click={() => move('dock', index, 1)}
          >
            <ArrowDown size={13} strokeWidth={2} aria-hidden="true" />
          </button>
        </li>
      {/each}
    </ul>
  </Section>

  <Section title="Player controls">
    <div class="mb-3 flex items-start justify-between gap-4">
      <p class="max-w-[520px] text-[12px] leading-5 text-vlc-muted">
        Hide secondary transport controls you do not use. Previous, play/pause, next, elapsed
        time and the seek bar always stay visible.
      </p>
      <InfoTip text="Useful on small windows or when you want a calmer transport bar." />
    </div>

    <div class="overflow-hidden rounded-panel border border-vlc-border">
      {#each PLAYER_CONTROL_IDS as id, index (id)}
        <div
          class="flex items-center justify-between gap-4 border-b border-vlc-border/60 px-4 py-3 last:border-b-0"
        >
          <div class="min-w-0">
            <p class="text-[13px] text-vlc-text">{PLAYER_CONTROL_LABELS[id]}</p>
            <p class="mt-0.5 text-[11px] text-vlc-muted">
              {id === 'volume'
                ? 'Cone volume slider and mute button.'
                : id === 'queue'
                  ? 'Opens the playing queue in the right sidebar.'
                  : `Show the ${PLAYER_CONTROL_LABELS[id].toLowerCase()}.`}
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={$layout.playerControls[id]}
            aria-label={PLAYER_CONTROL_LABELS[id]}
            class="h-[22px] w-11 shrink-0 rounded-full text-[9px] font-semibold tracking-[0.06em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60 focus-visible:ring-offset-2 focus-visible:ring-offset-vlc-app"
            class:bg-vlc-orange={$layout.playerControls[id]}
            class:text-vlc-app={$layout.playerControls[id]}
            class:bg-vlc-raised={!$layout.playerControls[id]}
            class:text-vlc-dim={!$layout.playerControls[id]}
            on:click={() => toggleControl(id)}
          >
            {$layout.playerControls[id] ? 'ON' : 'OFF'}
          </button>
        </div>
      {/each}
    </div>
  </Section>

  <div class="flex items-center justify-between gap-4 border-t border-vlc-border pt-4">
    <p class="flex items-center gap-2 text-[12px] text-vlc-muted">
      <LayoutDashboard size={15} strokeWidth={1.7} aria-hidden="true" />
      Layout changes apply immediately.
    </p>
    <button
      type="button"
      class="flex h-8 items-center gap-1.5 rounded-control border border-vlc-border bg-vlc-card px-3 text-[12px] text-vlc-secondary transition-colors hover:border-vlc-borderStrong hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60"
      on:click={resetLayout}
    >
      <RotateCcw size={13} strokeWidth={1.8} aria-hidden="true" />
      Reset layout
    </button>
  </div>
</div>
