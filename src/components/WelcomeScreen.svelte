<script lang="ts">
  import { tick } from 'svelte';
  import {
    AudioLines,
    Captions,
    ListVideo,
    Play,
    Settings,
    SkipBack,
    SkipForward,
    Volume2,
  } from 'lucide-svelte';
  import {
    hasTauri,
    invokeCommand,
    pickFolderViaDialog,
  } from '../lib/tauriFs';
  import { ACCENT_COLORS, addLibraryFolder, settings } from '../stores/settings';

  export let open = false;
  export let onComplete: () => void = () => {};
  export let onSkip: () => void = () => {};

  const themeOptions = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'system', label: 'System' },
  ];

  const SHORTCUT_COLUMNS: { label: string; keys: string[][]; slash?: boolean }[] = [
    // Left column
    { label: 'Play / Pause', keys: [['Space']] },
    { label: 'Seek Backward / Forward', keys: [['←'], ['→']], slash: true },
    { label: 'Previous / Next Item', keys: [['<'], ['>']], slash: true },
    { label: 'Previous / Next Frame', keys: [[','], ['.']], slash: true },
    { label: 'Cycle Subtitle Track', keys: [['V']] },
    { label: 'Cycle Audio Track', keys: [['B']] },
    // Right column
    { label: 'Toggle Fullscreen', keys: [['F']] },
    { label: 'Increase / Decrease Volume', keys: [['↑'], ['↓']], slash: true },
    { label: 'Show / Hide Queue', keys: [['Q']] },
    { label: 'Show / Hide File Browser', keys: [['L']] },
    { label: 'Take a Snapshot', keys: [['Shift'], ['S']] },
    { label: 'Record', keys: [['Shift'], ['R']] },
  ];

  const BACK_BTN =
    'h-9 rounded-md bg-vlc-raised px-6 text-[13px] text-vlc-text transition-colors hover:brightness-110 focus-visible:ring-2 focus-visible:ring-vlc-orange/60';
  const PRIMARY_BTN =
    'h-9 rounded-md bg-vlc-orange px-7 text-[13px] font-medium text-black transition-[filter] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vlc-orange';

  let step = 0;
  let dialogEl: HTMLDivElement | null = null;
  let folderDraft = '~/Videos';
  let defaultDirResolved = false;

  $: if (open) {
    void focusDialog();
    void resolveDefaultDir();
  }

  async function focusDialog(): Promise<void> {
    await tick();
    dialogEl?.querySelector<HTMLElement>('[data-welcome-first]')?.focus();
  }

  /** Under Tauri, swap the '~/Videos' placeholder for the real default media dir. */
  async function resolveDefaultDir(): Promise<void> {
    if (defaultDirResolved || !hasTauri()) return;
    defaultDirResolved = true;

    const result = await invokeCommand<string>('default_media_dir', { kind: 'videos' });
    const draft = folderDraft.trim();
    if (result && (draft === '' || draft === '~/Videos')) {
      folderDraft = result;
    }
  }

  function setTheme(theme: string): void {
    settings.update((state) => ({ ...state, theme }));
  }

  function setAccent(color: string): void {
    settings.update((state) => ({ ...state, accentColor: color }));
  }

  async function browseFolder(): Promise<void> {
    const picked = await pickFolderViaDialog();
    if (picked) folderDraft = picked;
  }

  function advanceFromWelcome(): void {
    const value = folderDraft.trim();
    if (value && !$settings.libraryFolders.includes(value)) {
      addLibraryFolder(value);
    }
    step = 1;
  }

  function fillFor(value: string): string {
    if (value === 'light') return 'background:#d6d6d6';
    if (value === 'dark') return 'background:#1f1f1f';
    return 'background:linear-gradient(135deg,#3a3a3a 0%,#3a3a3a 50%,#d6d6d6 50%,#d6d6d6 100%)';
  }

  function skip(): void {
    onSkip();
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (!open) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      skip();
      return;
    }

    if (event.key !== 'Tab' || !dialogEl) return;

    const focusable = Array.from(
      dialogEl.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => element.offsetParent !== null);

    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if open}
  <div
    class="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
    role="presentation"
    on:click={(event) => {
      if (event.target === event.currentTarget) skip();
    }}
  >
    <div
      bind:this={dialogEl}
      class="flex h-[min(736px,calc(100vh-64px))] w-full max-w-[1000px] flex-col overflow-hidden rounded-xl border border-vlc-border bg-vlc-panel shadow-2xl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
      aria-describedby="welcome-description"
    >
      <div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {#if step === 0}
          <div class="flex flex-1 flex-col items-center justify-center px-10">
            <svg class="h-24 w-24" viewBox="0 0 96 96" fill="none" role="img" aria-label="VLC cone">
              <defs>
                <clipPath id="vlc-cone-clip"><path d="M48 6 L71 64 H25 Z" /></clipPath>
              </defs>
              <g clip-path="url(#vlc-cone-clip)">
                <path d="M48 6 L71 64 H25 Z" fill="var(--accent)" />
                <rect x="18" y="22" width="60" height="5" fill="#f4f4f4" transform="rotate(-8 48 25)" />
                <rect x="14" y="38" width="68" height="6" fill="#f4f4f4" transform="rotate(-8 48 41)" />
                <rect x="10" y="52" width="76" height="6" fill="#f4f4f4" transform="rotate(-8 48 55)" />
              </g>
              <rect x="20" y="68" width="56" height="15" rx="5" fill="var(--accent)" />
            </svg>

            <h1 id="welcome-title" class="mt-10 text-center text-[28px] font-medium text-vlc-text">
              Welcome to VLC!
            </h1>

            <p id="welcome-description" class="mx-auto mt-6 max-w-[580px] text-center text-[15px] leading-6 text-vlc-secondary">
              VLC is a free and open source cross-platform multimedia player and framework that plays
              most multimedia files as well as DVDs, Audio CDs, VCDs, and various streaming protocols.
            </p>

            <div class="mt-14 w-full max-w-[580px]">
              <label class="text-[13px] text-vlc-text" for="welcome-folder">
                Choose a Media Folder to get started with
              </label>
              <div class="mt-3.5 flex gap-3">
                <input
                  id="welcome-folder"
                  type="text"
                  data-welcome-first
                  class="h-10 min-w-0 flex-1 rounded-md border border-vlc-border bg-vlc-app px-3 text-[13px] text-vlc-text outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60"
                  bind:value={folderDraft}
                />
                <button
                  type="button"
                  class="h-10 shrink-0 rounded-md bg-vlc-raised px-5 text-[13px] text-vlc-text hover:brightness-110"
                  on:click={() => void browseFolder()}
                >
                  Browse
                </button>
              </div>
            </div>
          </div>
        {:else if step === 1}
          <h2 class="mt-14 text-center text-[22px] text-vlc-text">
            Select your preferred theme and color.
          </h2>

          <div class="mt-12 flex items-start justify-center gap-10">
            {#each themeOptions as option (option.value)}
              {@const active = $settings.theme === option.value}
              <button
                type="button"
                data-welcome-first={option.value === 'light' ? '' : undefined}
                class="group flex flex-col items-center gap-3 focus-visible:outline-none"
                aria-pressed={active}
                on:click={() => setTheme(option.value)}
              >
                <span
                  class="flex h-[100px] w-[100px] items-center justify-center rounded-xl border border-transparent transition-shadow {active
                    ? 'ring-2 ring-[var(--accent)] ring-offset-4 ring-offset-vlc-panel'
                    : 'group-hover:brightness-110'}"
                  style={fillFor(option.value)}
                ></span>
                <span class="text-[13px] {active ? 'text-vlc-text' : 'text-vlc-muted'}">{option.label}</span>
              </button>
            {/each}
          </div>

          <div class="flex-1"></div>

          <div
            aria-hidden="true"
            class="pointer-events-none mx-8 mb-2 flex h-11 shrink-0 select-none items-center gap-3 rounded-md border border-vlc-border bg-vlc-app px-3"
          >
            <SkipBack size={15} class="text-vlc-secondary" />
            <span class="flex h-6 w-8 items-center justify-center rounded-[6px] bg-vlc-orange text-black">
              <Play size={13} fill="currentColor" class="ml-px" />
            </span>
            <SkipForward size={15} class="text-vlc-secondary" />
            <span class="text-[11px] font-mono tabular-nums text-vlc-secondary">00:02:10</span>
            <span class="relative h-1.5 flex-1 rounded-full bg-vlc-border">
              <span class="absolute inset-y-0 left-0 w-1/4 rounded-full bg-vlc-orange"></span>
              <span
                class="absolute top-1/2 h-2.5 w-[3px] -translate-y-1/2 rounded-full bg-vlc-orange"
                style="left:25%"
              ></span>
            </span>
            <span class="text-[11px] font-mono tabular-nums text-vlc-secondary">00:25:40</span>
            <Volume2 size={15} class="text-vlc-secondary" />
            <span class="relative block h-3.5 w-16" style="clip-path:polygon(100% 0,100% 100%,0 100%)">
              <span
                class="absolute inset-0"
                style="background:linear-gradient(to top right,#22b14a 0%,#3fd35f 50%,#a3e635 100%)"
              ></span>
            </span>
            <span class="ml-auto flex items-center gap-3">
              <AudioLines size={16} class="text-vlc-secondary" />
              <Captions size={16} class="text-vlc-secondary" />
              <Settings size={16} class="text-vlc-secondary" />
              <ListVideo size={16} class="text-vlc-secondary" />
            </span>
          </div>

          <div class="flex shrink-0 items-center gap-4 px-10 pb-6">
            {#each ACCENT_COLORS as accent (accent.color)}
              {@const active = $settings.accentColor.toLowerCase() === accent.color.toLowerCase()}
              <button
                type="button"
                class="h-7 w-7 rounded-full transition-transform focus-visible:outline-none"
                class:scale-110={active}
                style={`background-color:${accent.color};${active
                  ? ` box-shadow:0 0 0 2px rgb(22 22 22), 0 0 0 4px ${accent.color};`
                  : ''}`}
                title={accent.label}
                aria-label={`${accent.label} accent`}
                aria-pressed={active}
                on:click={() => setAccent(accent.color)}
              ></button>
            {/each}
          </div>
        {:else if step === 2}
          <h2 class="mt-14 text-center text-[22px] text-vlc-text">
            Learn the basic keyboard shortcuts.
          </h2>

          <div class="mx-auto mt-12 grid w-full max-w-[880px] grid-cols-2 gap-x-20 gap-y-7 px-10">
            <div class="flex flex-col gap-y-7">
              {#each SHORTCUT_COLUMNS.slice(0, 6) as row, ri (row.label)}
                <div class="flex items-center gap-6" data-welcome-first={ri === 0 ? '' : undefined}>
                  <span class="w-[200px] shrink-0 text-[13px] text-vlc-secondary">{row.label}</span>
                  <span class="flex items-center gap-2">
                    {#each row.keys as group, gi (group[0])}
                      {#if gi > 0 && row.slash}<span class="text-vlc-muted">/</span>{/if}
                      <kbd
                        class="inline-flex h-8 min-w-[3rem] items-center justify-center rounded-lg border border-vlc-border bg-gradient-to-b from-vlc-card to-vlc-app px-3 text-[13px] font-normal text-vlc-text shadow-[0_2px_0_0_rgba(0,0,0,0.5)]"
                      >{group[0]}</kbd>
                    {/each}
                  </span>
                </div>
              {/each}
            </div>
            <div class="flex flex-col gap-y-7">
              {#each SHORTCUT_COLUMNS.slice(6) as row (row.label)}
                <div class="flex items-center gap-6">
                  <span class="w-[200px] shrink-0 text-[13px] text-vlc-secondary">{row.label}</span>
                  <span class="flex items-center gap-2">
                    {#each row.keys as group, gi (group[0])}
                      {#if gi > 0 && row.slash}<span class="text-vlc-muted">/</span>{/if}
                      <kbd
                        class="inline-flex h-8 min-w-[3rem] items-center justify-center rounded-lg border border-vlc-border bg-gradient-to-b from-vlc-card to-vlc-app px-3 text-[13px] font-normal text-vlc-text shadow-[0_2px_0_0_rgba(0,0,0,0.5)]"
                      >{group[0]}</kbd>
                    {/each}
                  </span>
                </div>
              {/each}
            </div>
          </div>

          <p class="mx-auto mt-10 w-full max-w-[880px] px-10 text-[13px] text-vlc-muted">
            Find the full list in the menu.
          </p>
        {/if}
      </div>

      <footer class="flex shrink-0 items-center justify-end gap-2 px-8 pb-6">
        {#if step === 1}
          <button type="button" class={BACK_BTN} on:click={() => (step = 0)}>Back</button>
          <button type="button" class={PRIMARY_BTN} on:click={() => (step = 2)}>Next</button>
        {:else if step === 2}
          <button type="button" class={BACK_BTN} on:click={() => (step = 1)}>Back</button>
          <button type="button" class={PRIMARY_BTN} on:click={() => onComplete()}>Finish</button>
        {:else}
          <button type="button" class={PRIMARY_BTN} on:click={advanceFromWelcome}>Next</button>
        {/if}
      </footer>
    </div>
  </div>
{/if}
