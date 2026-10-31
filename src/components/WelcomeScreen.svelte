<script lang="ts">
  import { tick } from 'svelte';
  import {
    ChevronRight,
    FolderOpen,
    Monitor,
    Moon,
    Plus,
    Sun,
    Trash2,
  } from 'lucide-svelte';
  import {
    ACCENT_COLORS,
    addLibraryFolder,
    removeLibraryFolder,
    settings,
  } from '../stores/settings';

  export let open = false;
  export let onComplete: () => void = () => {};
  export let onSkip: () => void = () => {};

  const themeOptions = [
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'system', label: 'System', icon: Monitor },
  ];

  const languageOptions = ['English', 'Français', 'Deutsch', 'Español'];

  let dialogEl: HTMLDivElement | null = null;
  let folderInputEl: HTMLInputElement | null = null;
  let folderDraft = '';

  $: if (open) {
    void focusDialog();
  }

  async function focusDialog(): Promise<void> {
    await tick();
    dialogEl?.querySelector<HTMLElement>('[data-welcome-first]')?.focus();
  }

  function setTheme(theme: string): void {
    settings.update((state) => ({ ...state, theme }));
  }

  function setAccent(color: string): void {
    settings.update((state) => ({ ...state, accentColor: color }));
  }

  function addFolder(path: string): void {
    const value = path.trim();
    if (!value) return;
    if ($settings.libraryFolders.includes(value)) return;

    addLibraryFolder(value);
    folderDraft = '';
  }

  function handleFolderSubmit(event: SubmitEvent): void {
    event.preventDefault();
    addFolder(folderDraft);
  }

  /** Svelte's HTML typings omit the non-standard directory picker attribute. */
  function directoryInput(node: HTMLInputElement): { destroy: () => void } {
    node.setAttribute('webkitdirectory', '');
    return {
      destroy() {
        node.removeAttribute('webkitdirectory');
      },
    };
  }

  function handleDirectoryPick(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const files = input.files;
    if (!files || files.length === 0) return;

    const relative = files[0].webkitRelativePath;
    const folderName = relative.split('/')[0] || 'Selected folder';
    addFolder(folderName);
    input.value = '';
  }

  function finish(): void {
    onComplete();
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
    class="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    role="presentation"
    on:click={(event) => {
      if (event.target === event.currentTarget) skip();
    }}
  >
    <div
      bind:this={dialogEl}
      class="flex max-h-[calc(100vh-32px)] w-full max-w-[860px] flex-col overflow-hidden rounded-panel border border-vlc-border bg-vlc-panel shadow-2xl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
      aria-describedby="welcome-description"
    >
      <header class="flex shrink-0 items-start gap-4 border-b border-vlc-border px-6 py-5">
        <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-[10px] bg-vlc-orange/12">
          <svg class="h-9 w-9" viewBox="0 0 96 96" fill="none" aria-hidden="true">
            <defs>
              <linearGradient id="welcome-cone" x1="48" y1="8" x2="48" y2="85" gradientUnits="userSpaceOnUse">
                <stop stop-color="var(--accent)" />
                <stop offset="1" stop-color="var(--accent-pressed)" />
              </linearGradient>
            </defs>
            <path d="M48 8 68 72H28L48 8Z" fill="url(#welcome-cone)" />
            <path d="M38.9 34h18.2l2.6 10H36.3l2.6-10Z" fill="var(--selection-ink)" fill-opacity=".18" />
            <rect x="18" y="72" width="60" height="13" rx="5" fill="url(#welcome-cone)" />
          </svg>
        </div>

        <div class="min-w-0 flex-1">
          <p class="text-[11px] uppercase tracking-[0.12em] text-vlc-muted">First run</p>
          <h1 id="welcome-title" class="mt-1 text-[22px] font-medium leading-7 text-vlc-text">
            Welcome to Kanea
          </h1>
          <p id="welcome-description" class="mt-1 max-w-xl text-[13px] leading-5 text-vlc-secondary">
            Choose how the app should look and where your media lives. Everything can be changed
            later in Settings.
          </p>
        </div>
      </header>

      <div class="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <div class="grid gap-6 md:grid-cols-[1.05fr_1fr]">
          <section aria-labelledby="welcome-appearance">
            <h2 id="welcome-appearance" class="text-[13px] font-medium text-vlc-text">Appearance</h2>

            <div class="mt-3">
              <p class="mb-1.5 text-[11px] text-vlc-muted">Theme</p>
              <div class="grid grid-cols-3 gap-1 rounded-control bg-vlc-app p-1" role="group" aria-label="Theme">
                {#each themeOptions as option (option.value)}
                  {@const active = $settings.theme === option.value}
                  <button
                    type="button"
                    data-welcome-first={option.value === 'dark' ? '' : undefined}
                    class="flex h-9 items-center justify-center gap-1.5 rounded-[6px] text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60"
                    class:bg-vlc-card={active}
                    class:text-vlc-text={active}
                    class:text-vlc-muted={!active}
                    class:hover:text-vlc-secondary={!active}
                    aria-pressed={active}
                    on:click={() => setTheme(option.value)}
                  >
                    <svelte:component this={option.icon} size={14} strokeWidth={1.8} aria-hidden="true" />
                    {option.label}
                  </button>
                {/each}
              </div>
            </div>

            <div class="mt-4">
              <p class="mb-1.5 text-[11px] text-vlc-muted">Accent color</p>
              <div class="flex flex-wrap gap-1.5" role="group" aria-label="Accent color">
                {#each ACCENT_COLORS as accent (accent.color)}
                  {@const active = $settings.accentColor.toLowerCase() === accent.color.toLowerCase()}
                  <button
                    type="button"
                    class="h-7 w-7 rounded-[6px] border-2 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/70 focus-visible:ring-offset-2 focus-visible:ring-offset-vlc-panel"
                    class:border-vlc-text={active}
                    class:border-transparent={!active}
                    class:scale-110={active}
                    style={`background-color: ${accent.color};`}
                    title={accent.label}
                    aria-label={`${accent.label} accent`}
                    aria-pressed={active}
                    on:click={() => setAccent(accent.color)}
                  ></button>
                {/each}
              </div>
            </div>

            <div class="mt-4">
              <label class="mb-1.5 block text-[11px] text-vlc-muted" for="welcome-language">
                Interface language
              </label>
              <select
                id="welcome-language"
                class="h-9 w-full rounded-control border border-vlc-border bg-vlc-app px-2.5 text-[12px] text-vlc-secondary outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60"
                bind:value={$settings.interfaceLanguage}
              >
                {#each languageOptions as language (language)}
                  <option value={language}>{language}</option>
                {/each}
              </select>
            </div>
          </section>

          <section aria-labelledby="welcome-library">
            <h2 id="welcome-library" class="text-[13px] font-medium text-vlc-text">Library folders</h2>
            <p class="mt-1 text-[11px] leading-4 text-vlc-muted">
              Add the folders Kanea should scan for videos and music.
            </p>

            <form class="mt-3 flex gap-1.5" on:submit={handleFolderSubmit}>
              <input
                class="h-9 min-w-0 flex-1 rounded-control border border-vlc-border bg-vlc-app px-2.5 text-[12px] text-vlc-text outline-none placeholder:text-vlc-muted focus-visible:ring-2 focus-visible:ring-vlc-orange/60"
                type="text"
                placeholder="/home/user/Videos"
                aria-label="Library folder path"
                bind:value={folderDraft}
              />
              <button
                type="submit"
                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-vlc-border bg-vlc-card text-vlc-secondary transition-colors hover:border-vlc-borderStrong hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60"
                title="Add folder"
                aria-label="Add folder"
                disabled={!folderDraft.trim()}
              >
                <Plus size={15} strokeWidth={2} aria-hidden="true" />
              </button>
            </form>

            <button
              type="button"
              class="mt-1.5 flex h-8 items-center gap-1.5 rounded-control px-1 text-[11px] text-vlc-secondary transition-colors hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60"
              on:click={() => folderInputEl?.click()}
            >
              <FolderOpen size={13} strokeWidth={1.8} aria-hidden="true" />
              Browse for a folder
            </button>
            <input
              bind:this={folderInputEl}
              class="hidden"
              type="file"
              multiple
              use:directoryInput
              aria-hidden="true"
              tabindex="-1"
              on:change={handleDirectoryPick}
            />

            <ul class="mt-3 space-y-1" aria-label="Selected library folders">
              {#if $settings.libraryFolders.length === 0}
                <li class="rounded-control border border-dashed border-vlc-border px-3 py-4 text-center text-[11px] text-vlc-muted">
                  No folders added yet.
                </li>
              {:else}
                {#each $settings.libraryFolders as folder, index (folder)}
                  <li class="flex items-center gap-2 rounded-control border border-vlc-border bg-vlc-card px-2.5 py-2">
                    <FolderOpen size={14} strokeWidth={1.8} class="shrink-0 text-vlc-muted" aria-hidden="true" />
                    <span class="min-w-0 flex-1 truncate text-[12px] text-vlc-text" title={folder}>{folder}</span>
                    <button
                      type="button"
                      class="flex h-6 w-6 shrink-0 items-center justify-center rounded-input text-vlc-muted transition-colors hover:bg-vlc-raised hover:text-vlc-danger focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/60"
                      title={`Remove ${folder}`}
                      aria-label={`Remove ${folder}`}
                      on:click={() => removeLibraryFolder(index)}
                    >
                      <Trash2 size={12} strokeWidth={1.8} aria-hidden="true" />
                    </button>
                  </li>
                {/each}
              {/if}
            </ul>
          </section>
        </div>

        <div class="mt-5 flex items-start gap-2 rounded-control border border-vlc-border bg-vlc-card px-3 py-2.5">
          <ChevronRight size={14} strokeWidth={2} class="mt-0.5 shrink-0 text-vlc-orangeText" aria-hidden="true" />
          <p class="text-[11px] leading-4 text-vlc-secondary">
            Tip: press <kbd class="rounded border border-vlc-border bg-vlc-app px-1 py-0.5 font-mono text-[10px]">?</kbd>
            at any time to open the keyboard shortcut window.
          </p>
        </div>
      </div>

      <footer class="flex shrink-0 items-center justify-between gap-3 border-t border-vlc-border px-6 py-3.5">
        <button
          type="button"
          class="rounded-control px-3 py-1.5 text-[12px] text-vlc-muted transition-colors hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60"
          on:click={skip}
        >
          Skip for now
        </button>
        <button
          type="button"
          class="flex h-9 items-center gap-1.5 rounded-control bg-vlc-orange px-4 text-[12px] font-medium text-black transition-[filter] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vlc-orange"
          on:click={finish}
        >
          Get started
          <ChevronRight size={14} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </footer>
    </div>
  </div>
{/if}
