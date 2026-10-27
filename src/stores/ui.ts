import { writable } from 'svelte/store';

export type ContextMenuState = {
  open: boolean;
  x: number;
  y: number;
};

const initialContextMenu: ContextMenuState = {
  open: false,
  x: 0,
  y: 0,
};

/** Position and visibility for the shell-level right-click menu. */
export const contextMenu = writable<ContextMenuState>(initialContextMenu);

/** Whether the docked property/effects panel is visible. */
export const propertiesPanel = writable(false);

export type DockMode =
  | 'closed'
  | 'playback'
  | 'audio'
  | 'subtitles'
  | 'video'
  | 'visualizer'
  | 'queue';

/** Which panel the right-hand dock is showing. */
export const dockMode = writable<DockMode>('closed');

/**
 * Toggle the right dock. Selecting the active mode closes it,
 * selecting another mode swaps the panel in place.
 */
export function openDock(mode: DockMode): void {
  dockMode.update((current) => (current === mode ? 'closed' : mode));
}

/**
 * Open the context menu at the pointer position.
 * Right-click handlers call this directly; the native menu is suppressed.
 */
export function openContextMenu(event: MouseEvent): void {
  event.preventDefault();

  contextMenu.set({
    open: true,
    x: event.clientX,
    y: event.clientY,
  });
}

/** Hide the context menu without moving it. */
export function closeContextMenu(): void {
  contextMenu.update((state) => ({ ...state, open: false }));
}
