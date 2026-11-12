<script lang="ts">
  import {
    settings,
    addLibraryFolder,
    removeLibraryFolder,
    moveLibraryFolder,
    addMusicLibraryFolder,
    removeMusicLibraryFolder,
    moveMusicLibraryFolder,
  } from '../../stores/settings';
  import Section from './Section.svelte';
  import SettingRow from './SettingRow.svelte';
  import Toggle from './Toggle.svelte';
  import TextInput from './TextInput.svelte';
  import { ChevronUp, ChevronDown, Plus, Trash2, FolderOpen } from 'lucide-svelte';

  type FolderTab = 'videos' | 'music';

  const folderTabs: { id: FolderTab; label: string }[] = [
    { id: 'videos', label: 'Videos' },
    { id: 'music', label: 'Music' },
  ];

  let folderTab: FolderTab = 'videos';
  let newFolder = '';
  let newMusicFolder = '';
  let fileTypesOpen = true;

  function handleFolderTabKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const index = folderTabs.findIndex((tab) => tab.id === folderTab);
    const offset = event.key === 'ArrowRight' ? 1 : folderTabs.length - 1;
    folderTab = folderTabs[(index + offset) % folderTabs.length].id;
  }

  function handleAddFolder(): void {
    if (newFolder.trim()) {
      addLibraryFolder(newFolder.trim());
      newFolder = '';
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') handleAddFolder();
  }

  function handleAddMusicFolder(): void {
    if (newMusicFolder.trim()) {
      addMusicLibraryFolder(newMusicFolder.trim());
      newMusicFolder = '';
    }
  }

  function handleMusicKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') handleAddMusicFolder();
  }

  const fileTypeCategories = [
    { key: 'video', label: 'Video' },
    { key: 'audio', label: 'Audio' },
    { key: 'playlist', label: 'Playlist' },
    { key: 'subtitle', label: 'Subtitle' },
  ] as const;
</script>

<div class="flex flex-col gap-9 pb-4">
  <Section title="Media library">
    <SettingRow label="Media library folders" info hint="Folders to scan for media files.">
      <div class="flex flex-col gap-3 w-[500px]">
        <div
          class="flex w-fit gap-1 rounded-[8px] bg-vlc-app p-1"
          role="tablist"
          tabindex="0"
          aria-label="Library folder type"
          on:keydown={handleFolderTabKeydown}
        >
          {#each folderTabs as tab (tab.id)}
            {@const active = folderTab === tab.id}
            <button
              type="button"
              role="tab"
              aria-selected={active}
              class="flex h-8 items-center justify-center rounded-[6px] px-4 text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
              class:bg-vlc-card={active}
              class:text-vlc-text={active}
              class:text-vlc-muted={!active}
              class:hover:text-vlc-secondary={!active}
              on:click={() => (folderTab = tab.id)}
            >
              {tab.label}
            </button>
          {/each}
        </div>

        {#if folderTab === 'videos'}
          <div class="flex gap-3">
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div class="min-w-0 flex-1" on:keydown={handleKeydown}>
              <TextInput
                bind:value={newFolder}
                placeholder="Add folder path"
                ariaLabel="New library folder"
              />
            </div>
            <button
              type="button"
              class="h-9 shrink-0 rounded-[8px] px-4 bg-vlc-orange/20 border border-vlc-orange/50 text-vlc-orange text-[13px] transition-colors hover:bg-vlc-orange/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
              on:click={handleAddFolder}
            >
              <Plus size={16} strokeWidth={1.8} class="mr-1" />
              Add
            </button>
          </div>

          {#if $settings.libraryFolders.length > 0}
            <div class="space-y-2 max-h-64 overflow-y-auto">
              {#each $settings.libraryFolders as folder, index (folder)}
                <div class="flex items-center gap-3 p-3 rounded-[8px] bg-vlc-card border border-vlc-border">
                  <FolderOpen size={18} strokeWidth={1.7} class="text-vlc-secondary shrink-0" />
                  <span class="flex-1 min-w-0 text-[13px] text-vlc-text truncate font-mono">{folder}</span>
                  <button
                    type="button"
                    class="h-8 w-8 rounded-[6px] bg-transparent text-vlc-dim hover:text-vlc-text hover:bg-vlc-raised transition-colors"
                    aria-label="Move up"
                    disabled={index === 0}
                    on:click={() => moveLibraryFolder(index, index - 1)}
                  >
                    <ChevronUp size={14} strokeWidth={1.8} />
                  </button>
                  <button
                    type="button"
                    class="h-8 w-8 rounded-[6px] bg-transparent text-vlc-dim hover:text-vlc-text hover:bg-vlc-raised transition-colors"
                    aria-label="Move down"
                    disabled={index === $settings.libraryFolders.length - 1}
                    on:click={() => moveLibraryFolder(index, index + 1)}
                  >
                    <ChevronDown size={14} strokeWidth={1.8} />
                  </button>
                  <button
                    type="button"
                    class="h-8 w-8 rounded-[6px] bg-transparent text-vlc-dim hover:text-vlc-danger hover:bg-vlc-danger/10 transition-colors"
                    aria-label="Remove folder"
                    on:click={() => removeLibraryFolder(index)}
                  >
                    <Trash2 size={14} strokeWidth={1.8} />
                  </button>
                </div>
              {/each}
            </div>
          {:else}
            <p class="text-[13px] text-vlc-muted py-4">No folders configured. Add a folder to start building your library.</p>
          {/if}
        {:else}
          <div class="flex gap-3">
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div class="min-w-0 flex-1" on:keydown={handleMusicKeydown}>
              <TextInput
                bind:value={newMusicFolder}
                placeholder="Add music folder path"
                ariaLabel="New music library folder"
              />
            </div>
            <button
              type="button"
              class="h-9 shrink-0 rounded-[8px] px-4 bg-vlc-orange/20 border border-vlc-orange/50 text-vlc-orange text-[13px] transition-colors hover:bg-vlc-orange/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
              on:click={handleAddMusicFolder}
            >
              <Plus size={16} strokeWidth={1.8} class="mr-1" />
              Add
            </button>
          </div>

          {#if $settings.musicLibraryFolders.length > 0}
            <div class="space-y-2 max-h-64 overflow-y-auto">
              {#each $settings.musicLibraryFolders as folder, index (folder)}
                <div class="flex items-center gap-3 p-3 rounded-[8px] bg-vlc-card border border-vlc-border">
                  <FolderOpen size={18} strokeWidth={1.7} class="text-vlc-secondary shrink-0" />
                  <span class="flex-1 min-w-0 text-[13px] text-vlc-text truncate font-mono">{folder}</span>
                  <button
                    type="button"
                    class="h-8 w-8 rounded-[6px] bg-transparent text-vlc-dim hover:text-vlc-text hover:bg-vlc-raised transition-colors"
                    aria-label="Move up"
                    disabled={index === 0}
                    on:click={() => moveMusicLibraryFolder(index, index - 1)}
                  >
                    <ChevronUp size={14} strokeWidth={1.8} />
                  </button>
                  <button
                    type="button"
                    class="h-8 w-8 rounded-[6px] bg-transparent text-vlc-dim hover:text-vlc-text hover:bg-vlc-raised transition-colors"
                    aria-label="Move down"
                    disabled={index === $settings.musicLibraryFolders.length - 1}
                    on:click={() => moveMusicLibraryFolder(index, index + 1)}
                  >
                    <ChevronDown size={14} strokeWidth={1.8} />
                  </button>
                  <button
                    type="button"
                    class="h-8 w-8 rounded-[6px] bg-transparent text-vlc-dim hover:text-vlc-danger hover:bg-vlc-danger/10 transition-colors"
                    aria-label="Remove music folder"
                    on:click={() => removeMusicLibraryFolder(index)}
                  >
                    <Trash2 size={14} strokeWidth={1.8} />
                  </button>
                </div>
              {/each}
            </div>
          {:else}
            <p class="text-[13px] text-vlc-muted py-4">No music folders configured. Add a folder to start building your music library.</p>
          {/if}
        {/if}
      </div>
    </SettingRow>

    <SettingRow label="Scan on startup" info hint="Automatically scan library folders when Kanea starts.">
      <Toggle bind:value={$settings.scanOnStartup} label="Scan on startup" />
    </SettingRow>

    <SettingRow label="Include hidden files" info hint="Include hidden files and folders in the library scan.">
      <Toggle bind:value={$settings.includeHiddenFiles} label="Include hidden files" />
    </SettingRow>

    <SettingRow label="Background artwork fetch" info hint="Automatically download artwork for media items.">
      <Toggle bind:value={$settings.backgroundArtworkFetch} label="Background artwork fetch" />
    </SettingRow>

    <SettingRow label="Metadata network lookup" info hint="Fetch metadata from online databases.">
      <Toggle bind:value={$settings.metadataNetworkLookup} label="Metadata network lookup" />
    </SettingRow>
  </Section>

  <Section title="File types">
    <div class="flex items-center justify-between mb-4">
      <button
        type="button"
        class="flex items-center gap-2 text-[13px] text-vlc-secondary hover:text-vlc-text transition-colors"
        on:click={() => (fileTypesOpen = !fileTypesOpen)}
        aria-expanded={fileTypesOpen}
      >
        <span class="flex shrink-0 items-center justify-center transition-transform duration-150" class:-rotate-90={!fileTypesOpen} aria-hidden="true"><ChevronDown size={16} strokeWidth={1.8} /></span>
        Supported file extensions
      </button>
    </div>

    {#if fileTypesOpen}
      <div class="grid grid-cols-2 gap-6">
        {#each fileTypeCategories as category}
          <div class="space-y-3">
            <h4 class="text-[13px] font-medium text-vlc-secondary uppercase tracking-wide">{category.label}</h4>
            <div class="flex flex-wrap gap-2">
              {#each $settings.fileTypes[category.key] as ext (ext)}
                <span class="px-3 py-1 rounded-[4px] bg-vlc-raised border border-vlc-border text-[11px] text-vlc-text font-mono">{ext}</span>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </Section>
</div>