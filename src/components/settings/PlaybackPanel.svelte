<script lang="ts">
  import { settings } from '../../stores/settings';
  import Section from './Section.svelte';
  import SettingRow from './SettingRow.svelte';
  import Select from './Select.svelte';
  import Toggle from './Toggle.svelte';
  import Segmented from './Segmented.svelte';

  const hardwareDecodingOptions = [
    { value: 'Automatic', label: 'Automatic' },
    { value: 'VAAPI', label: 'VAAPI' },
    { value: 'VDPAU', label: 'VDPAU' },
    { value: 'DXVA2', label: 'DXVA2' },
    { value: 'D3D11', label: 'D3D11' },
    { value: 'VideoToolbox', label: 'VideoToolbox' },
    { value: 'Disable', label: 'Disable' },
  ];

  const playbackSpeedOptions = [
    { value: '0.25x', label: '0.25x' },
    { value: '0.5x', label: '0.5x' },
    { value: '0.75x', label: '0.75x' },
    { value: '1.0x', label: '1.0x' },
    { value: '1.25x', label: '1.25x' },
    { value: '1.5x', label: '1.5x' },
    { value: '1.75x', label: '1.75x' },
    { value: '2.0x', label: '2.0x' },
    { value: '2.5x', label: '2.5x' },
    { value: '3.0x', label: '3.0x' },
    { value: '4.0x', label: '4.0x' },
  ];

  const loopModeOptions = [
    { value: 'off', label: 'Off' },
    { value: 'one', label: 'One' },
    { value: 'all', label: 'All' },
  ];
</script>

<div class="flex flex-col gap-9 pb-4">
  <Section title="Playback">
    <SettingRow label="Skip frames" info hint="Lets playback skip frames to catch up when it falls behind.">
      <Toggle bind:value={$settings.skipFrames} label="Skip frames" />
    </SettingRow>

    <SettingRow label="Drop late frames">
      <Toggle bind:value={$settings.dropLateFrames} label="Drop late frames" />
    </SettingRow>

    <SettingRow label="Hardware decoding">
      <Toggle bind:value={$settings.hardwareDecodingEnabled} label="Hardware decoding" />
    </SettingRow>

    <SettingRow label="Hardware decoding mode" info hint="Which acceleration method to use. Automatic picks the best one for this system.">
      <div class="w-[426px]">
        <Select bind:value={$settings.hardwareDecoding} options={hardwareDecodingOptions} ariaLabel="Hardware decoding" disabled={!$settings.hardwareDecodingEnabled} />
      </div>
    </SettingRow>

    <SettingRow label="Allow speed playback">
      <Toggle bind:value={$settings.allowSpeedPlayback} label="Allow speed playback" />
    </SettingRow>

    <SettingRow label="Default playback speed">
      <div class="w-[200px]">
        <Select bind:value={$settings.defaultPlaybackSpeed} options={playbackSpeedOptions} ariaLabel="Default playback speed" />
      </div>
    </SettingRow>

    <SettingRow label="Loop mode">
      <div class="w-[300px]">
        <Segmented bind:value={$settings.loopMode} options={loopModeOptions} />
      </div>
    </SettingRow>

    <SettingRow label="Resume playback">
      <Toggle bind:value={$settings.resumePlayback} label="Resume playback" />
    </SettingRow>
  </Section>
</div>