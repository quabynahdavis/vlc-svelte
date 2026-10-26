<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { settings, DEFAULT_HOTKEYS, resetHotkeysToDefault, updateHotkey } from '../../stores/settings';
  import Section from './Section.svelte';
  import SettingRow from './SettingRow.svelte';
  import TextInput from './TextInput.svelte';

  const dispatch = createEventDispatcher<{ navigate: string }>();

  let editingIndex: number | null = null;
  let captureKey = '';
  let captureModifiers = { ctrl: false, shift: false, alt: false, meta: false };

  function formatShortcut(modifiers: typeof captureModifiers, key: string): string {
    const parts: string[] = [];
    if (modifiers.ctrl) parts.push('Ctrl');
    if (modifiers.shift) parts.push('Shift');
    if (modifiers.alt) parts.push('Alt');
    if (modifiers.meta) parts.push('Meta');
    if (key) parts.push(key.length === 1 ? key.toUpperCase() : key);
    return parts.join('+');
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (editingIndex === null) return;
    event.preventDefault();
    if (event.key === 'Escape') {
      editingIndex = null;
      captureKey = '';
      captureModifiers = { ctrl: false, shift: false, alt: false, meta: false };
      return;
    }
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return;

    captureKey = event.key;
    captureModifiers = { ctrl: event.ctrlKey, shift: event.shiftKey, alt: event.altKey, meta: event.metaKey };
    const shortcut = formatShortcut(captureModifiers, captureKey);
    updateHotkey(editingIndex, shortcut);
    editingIndex = null;
    captureKey = '';
    captureModifiers = { ctrl: false, shift: false, alt: false, meta: false };
  }

  function startEdit(index: number): void {
    editingIndex = index;
    captureKey = '';
    captureModifiers = { ctrl: false, shift: false, alt: false, meta: false };
  }

  function handleGlobalKeydown(event: KeyboardEvent): void {
    if (editingIndex !== null) {
      handleKeydown(event);
    }
  }

  let cleanup: (() => void) | null = null;

  $: {
    if (editingIndex !== null && !cleanup) {
      document.addEventListener('keydown', handleGlobalKeydown, true);
      cleanup = () => document.removeEventListener('keydown', handleGlobalKeydown, true);
    } else if (editingIndex === null && cleanup) {
      cleanup();
      cleanup = null;
    }
  }
</script>

<div class="flex flex-col gap-9 pb-4">
  <Section title="Hotkeys">
    <div class="overflow-x-auto">
      <table class="w-full text-left" role="grid">
        <thead>
          <tr class="border-b border-vlc-border">
            <th class="pb-2 text-[13px] font-medium text-vlc-secondary">Action</th>
            <th class="pb-2 text-[13px] font-medium text-vlc-secondary w-[200px]">Shortcut</th>
            <th class="pb-2 text-[13px] font-medium text-vlc-secondary w-12"></th>
          </tr>
        </thead>
        <tbody>
          {#each $settings.hotkeys as hotkey, index (hotkey.action)}
            <tr class="border-b border-vlc-border/50 last:border-b-0">
              <td class="py-2.5 text-[13px] text-vlc-text">{hotkey.action}</td>
              <td class="py-2.5">
                {#if editingIndex === index}
                  <div class="flex items-center gap-2">
                    <kbd class="px-3 py-1.5 rounded-[6px] bg-vlc-orange/20 border border-vlc-orange/50 text-vlc-orange text-[12px] font-mono min-w-[160px] text-center animate-pulse">
                      Press key combination...
                    </kbd>
                    <button
                      type="button"
                      class="h-8 w-8 rounded-[6px] bg-vlc-raised text-vlc-dim hover:bg-vlc-orange/20 hover:text-vlc-orange transition-colors"
                      aria-label="Cancel"
                      on:click={() => (editingIndex = null)}
                    >
                      ✕
                    </button>
                  </div>
                {:else}
                  <button
                    type="button"
                    class="flex items-center justify-center w-full h-9 px-3 rounded-[6px] bg-vlc-card border border-vlc-border text-[12px] font-mono text-vlc-text transition-colors hover:border-vlc-orange/50 hover:bg-vlc-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
                    on:click={() => startEdit(index)}
                  >
                    {hotkey.shortcut || '—'}
                  </button>
                {/if}
              </td>
              <td class="py-2.5 text-center">
                {#if editingIndex !== index}
                  <button
                    type="button"
                    class="h-8 w-8 rounded-[6px] bg-transparent text-vlc-dim hover:text-vlc-text hover:bg-vlc-raised transition-colors"
                    aria-label="Edit shortcut"
                    on:click={() => startEdit(index)}
                  >
                    ✎
                  </button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <div class="flex justify-end gap-3 mt-4">
      <button
        type="button"
        class="h-9 px-4 rounded-[8px] bg-vlc-raised border border-vlc-border text-[13px] text-vlc-secondary transition-colors hover:border-vlc-orange/50 hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
        on:click={resetHotkeysToDefault}
      >
        Reset to defaults
      </button>
    </div>
  </Section>
</div>