<script lang="ts">
  import { settings } from '../../stores/settings';
  import Section from './Section.svelte';
  import SettingRow from './SettingRow.svelte';
  import Select from './Select.svelte';
  import Toggle from './Toggle.svelte';
  import Slider from './Slider.svelte';

  const threadCountOptions = [
    { value: 'Auto', label: 'Auto' },
    ...Array.from({ length: 16 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })),
  ];

  const hdrTonemappingOptions = [
    { value: 'Auto', label: 'Auto' },
    { value: 'Hable', label: 'Hable' },
    { value: 'Reinhard', label: 'Reinhard' },
    { value: 'Disable', label: 'Disable' },
  ];
</script>

<div class="flex flex-col gap-9 pb-4">
  <Section title="Threading">
    <SettingRow label="Thread count" info hint="Number of decoder threads (Auto detects CPU cores).">
      <div class="w-[200px]">
        <Select bind:value={$settings.threadCount} options={threadCountOptions} ariaLabel="Thread count" />
      </div>
    </SettingRow>

    <SettingRow label="Real-time priority" info hint="Run decoding threads at real-time priority.">
      <Toggle bind:value={$settings.realTimePriority} label="Real-time priority" />
    </SettingRow>

    <SettingRow label="Memory copy optimization" info hint="Optimize memory copies for better performance.">
      <Toggle bind:value={$settings.memoryCopyOptimization} label="Memory copy optimization" />
    </SettingRow>
  </Section>

  <Section title="GPU & HDR">
    <SettingRow label="GPU acceleration" info hint="Use GPU for video decoding and rendering.">
      <Toggle bind:value={$settings.gpuAcceleration} label="GPU acceleration" />
    </SettingRow>

    <SettingRow label="HDR tonemapping" info hint="Select the HDR to SDR tonemapping algorithm.">
      <div class="w-[200px]">
        <Select bind:value={$settings.hdrTonemapping} options={hdrTonemappingOptions} ariaLabel="HDR tonemapping" />
      </div>
    </SettingRow>
  </Section>

  <Section title="Frame Dropping">
    <SettingRow label="Frame drop threshold" info hint="Threshold for dropping frames under heavy load (0-100).">
      <div class="w-[426px]">
        <Slider
          bind:value={$settings.frameDropThreshold}
          min={0}
          max={100}
          step={1}
          leftCaption="0%"
          centerCaption="50%"
          rightCaption="100%"
          ariaLabel="Frame drop threshold"
        />
      </div>
    </SettingRow>
  </Section>
</div>