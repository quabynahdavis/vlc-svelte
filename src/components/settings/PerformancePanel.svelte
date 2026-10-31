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
    <SettingRow label="Thread count">
      <div class="w-[200px]">
        <Select bind:value={$settings.threadCount} options={threadCountOptions} ariaLabel="Thread count" />
      </div>
    </SettingRow>

    <SettingRow label="Real-time priority" info hint="Asks the system to prioritize decoding. Can make the desktop feel less responsive.">
      <Toggle bind:value={$settings.realTimePriority} label="Real-time priority" />
    </SettingRow>

    <SettingRow label="Memory copy optimization">
      <Toggle bind:value={$settings.memoryCopyOptimization} label="Memory copy optimization" />
    </SettingRow>
  </Section>

  <Section title="GPU & HDR">
    <SettingRow label="GPU acceleration">
      <Toggle bind:value={$settings.gpuAcceleration} label="GPU acceleration" />
    </SettingRow>

    <SettingRow label="HDR tonemapping">
      <div class="w-[200px]">
        <Select bind:value={$settings.hdrTonemapping} options={hdrTonemappingOptions} ariaLabel="HDR tonemapping" />
      </div>
    </SettingRow>
  </Section>

  <Section title="Frame Dropping">
    <SettingRow label="Frame drop threshold" info hint="Drop frames only after this much delay. Lower keeps sync, higher keeps motion smooth.">
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