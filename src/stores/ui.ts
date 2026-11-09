import { writable, get } from 'svelte/store';

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

/** Which kind of context menu is active – global, folder, or media. */
export const currentContext = writable<'global' | 'folder' | 'media'>('global');

/** Identifier of the item the context menu is for (folder path or media id). */
export const contextItemId = writable<string>('');

/** Whether the docked property/effects panel is visible. */
export const propertiesPanel = writable(false);

export type DockMode =
  | 'closed'
  | 'playback'
  | 'audio'
  | 'subtitles'
  | 'video'
  | 'visualizer'
  | 'bookmarks'
  | 'queue';

/** Which panel the right dock is showing. */
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
  // default to global if not overridden by a more specific opener
  if (get(currentContext) === 'global') {
    // keep as global
  }
}

/** Open a folder‑specific context menu. */
export function openFolderContextMenu(event: MouseEvent, id: string): void {
  event.preventDefault();
  contextItemId.set(id);
  currentContext.set('folder');
  openContextMenu(event);
}

/** Open a media‑specific context menu. */
export function openMediaContextMenu(event: MouseEvent, id: string): void {
  event.preventDefault();
  contextItemId.set(id);
  currentContext.set('media');
  openContextMenu(event);
}

/** Hide the context menu without moving it. */
export function closeContextMenu(): void {
  contextMenu.update((state) => ({ ...state, open: false }));
  // reset context after closing
  currentContext.set('global');
  contextItemId.set('');
}

/** Close the context menu without moving it. */
export function closeAllContextMenus(): void {
  closeContextMenu();
}