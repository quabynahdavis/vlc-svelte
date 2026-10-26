<script lang="ts">
  import { settings, addVideoFilter, toggleVideoFilter, removeVideoFilter } from '../../stores/settings';
  import Section from './Section.svelte';
  import SettingRow from './SettingRow.svelte';
  import Select from './Select.svelte';
  import Toggle from './Toggle.svelte';
  import Slider from './Slider.svelte';
  import TextInput from './TextInput.svelte';
  import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-svelte';

  const outputModules = [
    { value: 'Automatic', label: 'Automatic' },
    { value: 'X11', label: 'X11' },
    { value: 'Wayland', label: 'Wayland' },
    { value: 'OpenGL', label: 'OpenGL' },
    { value: 'Vulkan', label: 'Vulkan' },
    { value: 'Metal', label: 'Metal' },
    { value: 'Direct3D11', label: 'Direct3D11' },
  ];

  const deinterlaceModes = [
    { value: 'Auto', label: 'Auto' },
    { value: 'Blend', label: 'Blend' },
    { value: 'Mean', label: 'Mean' },
    { value: 'Bob', label: 'Bob' },
    { value: 'Linear', label: 'Linear' },
    { value: 'Yadif', label: 'Yadif' },
    { value: 'Yadif2x', label: 'Yadif 2x' },
    { value: 'Phosphor', label: 'Phosphor' },
    { value: 'IVTC', label: 'IVTC' },
  ];

  const snapshotFormats = [
    { value: 'png', label: 'PNG' },
    { value: 'jpg', label: 'JPG' },
  ];

  let filtersOpen = true;
  let snapshotsOpen = true;

  function handleFilterKeydown(event: KeyboardEvent, index: number): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleVideoFilter(index);
    }
  }
</script>

<div class="flex flex-col gap-9 pb-4">
  <Section title="Output">
    <SettingRow label="Output module" info hint="Select the video output module.">
      <div class="w-[426px]">
        <Select bind:value={$settings.outputModule} options={outputModules} ariaLabel="Output module" />
      </div>
    </SettingRow>

    <SettingRow label="Hardware decoding" info hint="Enable hardware-accelerated video decoding.">
      <Toggle bind:value={$settings.hardwareDecodingEnabled} label="Hardware decoding" />
    </SettingRow>

    <SettingRow label="Deinterlace mode" info hint="Choose the deinterlacing algorithm.">
      <div class="w-[426px]">
        <Select bind:value={$settings.deinterlaceMode} options={deinterlaceModes} ariaLabel="Deinterlace mode" />
      </div>
    </SettingRow>

    <SettingRow label="Deinterlace" info hint="Enable automatic deinterlacing of interlaced video.">
      <Toggle bind:value={$settings.deinterlace} label="Deinterlace" />
    </SettingRow>

    <SettingRow label="Post-processing level" info hint="Set the post-processing quality level (0-6).">
      <div class="w-[426px]">
        <Slider
          bind:value={$settings.postProcessingLevel}
          min={0}
          max={6}
          step={1}
          leftCaption="0"
          centerCaption="3"
          rightCaption="6"
          ariaLabel="Post-processing level"
        />
      </div>
    </SettingRow>
  </Section>

  <Section title="Video filters">
    <div class="flex items-center justify-between mb-4">
      <button
        type="button"
        class="flex items-center gap-2 text-[13px] text-vlc-secondary hover:text-vlc-text transition-colors"
        on:click={() => (filtersOpen = !filtersOpen)}
        aria-expanded={filtersOpen}
      >
        <ChevronDown size={16} strokeWidth={1.8} class={`transition-transform duration-150 ${filtersOpen ? '' : '-rotate-90'}`} />
        Video filters
      </button>
      <button
        type="button"
        class="flex items-center gap-1.5 h-8 px-3 rounded-[6px] bg-vlc-raised border border-vlc-border text-[12px] text-vlc-secondary transition-colors hover:border-vlc-orange/50 hover:text-vlc-text"
        on:click={() => addVideoFilter('Custom Filter')}
      >
        <Plus size={14} strokeWidth={1.8} />
        Add filter
      </button>
    </div>

    {#if filtersOpen}
      <div class="space-y-3">
        {#each $settings.videoFilters as filter, index (filter.name)}
          <div class="flex items-center gap-3 p-3 rounded-[8px] bg-vlc-card border border-vlc-border">
            <button
              type="button"
              class="flex h-9 w-9 items-center justify-center rounded-[6px] bg-vlc-raised text-vlc-dim hover:bg-vlc-orange/20 hover:text-vlc-orange transition-colors"
              aria-label={`Toggle ${filter.name}`}
              on:click={() => toggleVideoFilter(index)}
            >
              {#if filter.enabled}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              {:else}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="2" y="2" width="20" height="20" rx="2"></rect>
                </svg>
              {/if}
            </button>
            <span class="flex-1 text-[13px] text-vlc-text font-mono">{filter.name}</span>
            <span class="text-[11px] text-vlc-muted px-2 py-1 rounded-[4px] bg-vlc-raised">
              {filter.enabled ? 'Enabled' : 'Disabled'}
            </span>
            <button
              type="button"
              class="h-8 w-8 rounded-[6px] bg-transparent text-vlc-dim hover:text-vlc-danger hover:bg-vlc-danger/10 transition-colors"
              aria-label={`Remove ${filter.name}`}
              on:click={() => removeVideoFilter(index)}
            >
              <Trash2 size={14} strokeWidth={1.8} />
            </button>
          </div>
        {/each}
        {#if $settings.videoFilters.length === 0}
          <p class="text-center py-6 text-[13px] text-vlc-muted">No video filters configured</p>
        {/if}
      </div>
    {/if}
  </Section>

  <Section title="Snapshots">
    <div class="flex items-center justify-between mb-4">
      <button
        type="button"
        class="flex items-center gap-2 text-[13px] text-vlc-secondary hover:text-vlc-text transition-colors"
        on:click={() => (snapshotsOpen = !snapshotsOpen)}
        aria-expanded={snapshotsOpen}
      >
        <ChevronDown size={16} strokeWidth={1.8} class={`transition-transform duration-150 ${snapshotsOpen ? '' : '-rotate-90'}`} />
        Snapshot settings
      </button>
    </div>

    {#if snapshotsOpen}
      <SettingRow label="Directory" info hint="Folder where snapshots are saved.">
        <div class="flex w-[426px] items-center gap-3">
          <TextInput bind:value={$settings.snapshotDirectory} ariaLabel="Snapshot directory" placeholder="Choose directory" />
          <button type="button" class="h-9 shrink-0 rounded-[8px] px-2 text-[13px] text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text">Browse</button>
        </div>
      </SettingRow>

      <SettingRow label="Format" info hint="Image format for snapshots.">
        <div class="w-[200px]">
          <Select bind:value={$settings.snapshotFormat} options={snapshotFormats} ariaLabel="Snapshot format" />
        </div>
      </SettingRow>

      <SettingRow label="Sequential numbering" info hint="Use sequential numbering for snapshot filenames.">
        <Toggle bind:value={$settings.snapshotSequential} label="Sequential numbering" />
      </SettingRow>
    {/if}
  </Section>
</div>