<script lang="ts">
  import { settings, toggleExtension, removeExtension, addExtension } from '../../stores/settings';
  import Section from './Section.svelte';
  import SettingRow from './SettingRow.svelte';
  import Select from './Select.svelte';
  import TextInput from './TextInput.svelte';
  import Toggle from './Toggle.svelte';
  import { ExternalLink, Settings as SettingsIcon, Plus, Trash2 } from 'lucide-svelte';

  const scriptSecurityOptions = [
    { value: 'Safe', label: 'Safe (sandboxed)' },
    { value: 'Unsafe', label: 'Unsafe (full access)' },
    { value: 'Prompt', label: 'Prompt on each script' },
  ];
</script>

<div class="flex flex-col gap-9 pb-4">
  <Section title="Loaded extensions">
    {#if $settings.loadedExtensions.length > 0}
      <div class="overflow-x-auto">
        <table class="w-full text-left" role="grid">
          <thead>
            <tr class="border-b border-vlc-border">
              <th class="pb-2 text-[13px] font-medium text-vlc-secondary">Name</th>
              <th class="pb-2 text-[13px] font-medium text-vlc-secondary w-[120px]">Version</th>
              <th class="pb-2 text-[13px] font-medium text-vlc-secondary w-[160px]">Author</th>
              <th class="pb-2 text-[13px] font-medium text-vlc-secondary w-[80px]">Enabled</th>
              <th class="pb-2 text-[13px] font-medium text-vlc-secondary w-[100px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each $settings.loadedExtensions as ext, index (ext.name)}
              <tr class="border-b border-vlc-border/50 last:border-b-0">
                <td class="py-3 text-[13px] text-vlc-text font-mono">{ext.name}</td>
                <td class="py-3 text-[13px] text-vlc-secondary">{ext.version}</td>
                <td class="py-3 text-[13px] text-vlc-dim">{ext.author}</td>
                <td class="py-3">
                  <Toggle bind:value={$settings.loadedExtensions[index].enabled} label="" />
                </td>
                <td class="py-3">
                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      class="h-8 w-8 rounded-[6px] bg-vlc-raised border border-vlc-border text-vlc-secondary hover:border-vlc-orange/50 hover:text-vlc-text transition-colors"
                      aria-label="Configure extension"
                    >
                      <SettingsIcon size={14} strokeWidth={1.8} />
                    </button>
                    <button
                      type="button"
                      class="h-8 w-8 rounded-[6px] bg-transparent text-vlc-dim hover:text-vlc-danger hover:bg-vlc-danger/10 transition-colors"
                      aria-label="Remove extension"
                      on:click={() => removeExtension(index)}
                    >
                      <Trash2 size={14} strokeWidth={1.8} />
                    </button>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <p class="text-[13px] text-vlc-muted py-4">No extensions loaded.</p>
    {/if}

    <div class="flex items-center gap-3 mt-4">
      <a
        href="https://addons.videolan.org/"
        target="_blank"
        rel="noopener noreferrer"
        class="flex items-center gap-2 text-[13px] text-vlc-orange hover:text-vlc-orange/80 transition-colors"
      >
        <ExternalLink size={14} strokeWidth={1.8} />
        Find more extensions
      </a>
      <button
        type="button"
        class="ml-auto flex items-center gap-1.5 h-9 px-3 rounded-[6px] bg-vlc-raised border border-vlc-border text-[12px] text-vlc-secondary transition-colors hover:border-vlc-orange/50 hover:text-vlc-text"
        on:click={() => addExtension({ name: 'New Extension', version: '1.0.0', author: 'Unknown', enabled: false })}
      >
        <Plus size={14} strokeWidth={1.8} />
        Add extension
      </button>
    </div>
  </Section>

  <Section title="Lua scripts">
    <SettingRow label="Scripts directory" info hint="Directory containing custom Lua scripts.">
      <div class="flex w-[426px] items-center gap-3">
        <TextInput bind:value={$settings.luaScriptsDirectory} ariaLabel="Lua scripts directory" placeholder="Choose directory" />
        <button type="button" class="h-9 shrink-0 rounded-[8px] px-2 text-[13px] text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text">Browse</button>
      </div>
    </SettingRow>

    <SettingRow label="Script security" info hint="Security level for running Lua scripts.">
      <div class="w-[280px]">
        <Select bind:value={$settings.scriptSecurity} options={scriptSecurityOptions} ariaLabel="Script security" />
      </div>
    </SettingRow>
  </Section>
</div>