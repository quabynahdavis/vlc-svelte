<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { AlertTriangle, ExternalLink, Keyboard } from 'lucide-svelte';
  import { resetHotkeysToDefault, settings } from '../../stores/settings';
  import Section from './Section.svelte';

  const dispatch = createEventDispatcher<{ openHotkeys: void }>();

  function normalizeShortcut(shortcut: string): string {
    return shortcut.replace(/\s+/g, '').toLowerCase();
  }

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
</script>

<div class="flex flex-col gap-9 pb-4">
  <section
    class="flex flex-col gap-4 rounded-[12px] border border-vlc-border bg-vlc-card p-5 sm:flex-row sm:items-center"
    aria-labelledby="keyboard-shortcuts-card-title"
  >
    <div
      class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-vlc-orange/15 text-vlc-orangeText"
      aria-hidden="true"
    >
      <Keyboard size={21} strokeWidth={1.7} />
    </div>

    <div class="min-w-0 flex-1">
      <h2 id="keyboard-shortcuts-card-title" class="text-[15px] font-medium text-vlc-text">
        Keyboard Shortcuts
      </h2>
      <p class="mt-1 max-w-[460px] text-[12px] leading-5 text-vlc-muted">
        Record, search, and reset shortcuts in a dedicated window. Changes apply immediately.
      </p>
    </div>

    <button
      type="button"
      class="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-[8px] bg-vlc-orange px-4 text-[13px] font-medium text-vlc-app transition-colors hover:bg-vlc-orangeDark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60 focus-visible:ring-offset-2 focus-visible:ring-offset-vlc-card"
      on:click={() => dispatch('openHotkeys')}
    >
      Open Keyboard Shortcuts
      <ExternalLink size={14} strokeWidth={2} aria-hidden="true" />
    </button>
  </section>

  <Section title="Current shortcuts">
    <p class="mb-3 text-[12px] leading-5 text-vlc-muted">
      This is a read-only summary. Use the window above to change a shortcut.
    </p>

    <div class="overflow-hidden rounded-[10px] border border-vlc-border">
      <div class="max-h-[360px] overflow-y-auto">
        <table class="w-full text-left" aria-label="Current keyboard shortcuts">
          <thead class="sticky top-0 bg-vlc-card">
            <tr class="border-b border-vlc-border">
              <th scope="col" class="px-3 py-2 text-[12px] font-medium text-vlc-secondary">Action</th>
              <th scope="col" class="w-[190px] px-3 py-2 text-[12px] font-medium text-vlc-secondary">
                Shortcut
              </th>
            </tr>
          </thead>
          <tbody>
            {#each $settings.hotkeys as hotkey, index (index)}
              {@const conflict = conflictIndexes.has(index)}
              <tr class="border-b border-vlc-border/60 last:border-b-0">
                <td class="px-3 py-2 text-[13px] text-vlc-text">{hotkey.action}</td>
                <td class="px-3 py-2">
                  <span class="flex items-center gap-2">
                    <kbd
                      class="inline-flex h-7 min-w-[86px] items-center justify-center rounded-[5px] border border-vlc-border bg-vlc-raised px-2 font-mono text-[11px] text-vlc-secondary"
                    >
                      {hotkey.shortcut || 'Unassigned'}
                    </kbd>
                    {#if conflict}
                      <span
                        class="inline-flex items-center gap-1 rounded-full bg-vlc-orange/15 px-1.5 py-0.5 text-[10px] text-vlc-orangeText"
                        title="This shortcut is used by more than one action"
                      >
                        <AlertTriangle size={11} strokeWidth={2} aria-hidden="true" />
                        Conflict
                      </span>
                    {/if}
                  </span>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    {#if $settings.hotkeys.length === 0}
      <p class="py-6 text-center text-[13px] text-vlc-muted">No shortcuts are configured.</p>
    {/if}

    <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p class="text-[12px] text-vlc-muted">
        {$settings.hotkeys.length} actions · Shortcuts apply immediately
      </p>
      <button
        type="button"
        class="h-9 rounded-[8px] border border-vlc-border bg-vlc-raised px-4 text-[13px] text-vlc-secondary transition-colors hover:border-vlc-orange/50 hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60"
        on:click={resetHotkeysToDefault}
      >
        Reset to defaults
      </button>
    </div>
  </Section>
</div>
