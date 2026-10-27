<script lang="ts">
  import { settings, addLibraryFolder, removeLibraryFolder, moveLibraryFolder } from '../../stores/settings';
  import Section from './Section.svelte';
  import SettingRow from './SettingRow.svelte';
  import Toggle from './Toggle.svelte';
  import TextInput from './TextInput.svelte';
  import { ChevronUp, ChevronDown, Plus, Trash2, FolderOpen } from 'lucide-svelte';

  let newFolder = '';
  let fileTypesOpen = true;

  function handleAddFolder(): void {
    if (newFolder.trim()) {
      addLibraryFolder(newFolder.trim());
      newFolder = '';
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') handleAddFolder();
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
        <div class="flex gap-3">
          <TextInput
            bind:value={newFolder}
            placeholder="Add folder path"
            ariaLabel="New library folder"
            on:keydown={handleKeydown}
          />
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
      </div>
    </SettingRow>

    <SettingRow label="Scan on startup" info hint="Automatically scan library folders when VLC starts.">
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
        <ChevronDown size={16} strokeWidth={1.8} class="transition-transform duration-150" class:-rotate-90={!fileTypesOpen} />
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