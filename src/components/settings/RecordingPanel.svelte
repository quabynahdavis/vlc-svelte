<script lang="ts">
  import { settings } from '../../stores/settings';
  import Section from './Section.svelte';
  import SettingRow from './SettingRow.svelte';
  import Select from './Select.svelte';
  import TextInput from './TextInput.svelte';

  const recordingFormats = [
    { value: 'TS', label: 'TS (MPEG-TS)' },
    { value: 'MP4', label: 'MP4' },
    { value: 'MKV', label: 'MKV' },
    { value: 'OGG', label: 'OGG' },
  ];

  const videoCodecs = [
    { value: 'H.264', label: 'H.264' },
    { value: 'H.265', label: 'H.265 (HEVC)' },
    { value: 'VP9', label: 'VP9' },
    { value: 'AV1', label: 'AV1' },
    { value: 'Copy', label: 'Copy (no re-encode)' },
  ];

  const audioCodecs = [
    { value: 'AAC', label: 'AAC' },
    { value: 'MP3', label: 'MP3' },
    { value: 'Opus', label: 'Opus' },
    { value: 'FLAC', label: 'FLAC' },
    { value: 'Copy', label: 'Copy (no re-encode)' },
  ];

  const bitrateModes = [
    { value: 'CBR', label: 'CBR (Constant Bitrate)' },
    { value: 'VBR', label: 'VBR (Variable Bitrate)' },
  ];
</script>

<div class="flex flex-col gap-9 pb-4">
  <Section title="Output">
    <SettingRow label="Recording directory" info hint="Folder where recordings are saved.">
      <div class="flex w-[426px] items-center gap-3">
        <TextInput bind:value={$settings.recordingDirectory} ariaLabel="Recording directory" placeholder="Choose directory" />
        <button type="button" class="h-9 shrink-0 rounded-[8px] px-2 text-[13px] text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text">Browse</button>
      </div>
    </SettingRow>

    <SettingRow label="Format" info hint="Container format for recordings.">
      <div class="w-[200px]">
        <Select bind:value={$settings.recordingFormat} options={recordingFormats} ariaLabel="Recording format" />
      </div>
    </SettingRow>
  </Section>

  <Section title="Video Encoding">
    <SettingRow label="Video codec" info hint="Video codec for recording (Copy preserves original stream).">
      <div class="w-[280px]">
        <Select bind:value={$settings.videoCodec} options={videoCodecs} ariaLabel="Video codec" />
      </div>
    </SettingRow>

    <SettingRow label="Bitrate mode" info hint="Constant or variable bitrate encoding.">
      <div class="w-[280px]">
        <Select bind:value={$settings.bitrateMode} options={bitrateModes} ariaLabel="Bitrate mode" />
      </div>
    </SettingRow>

    <SettingRow label="Video bitrate (kbps)" info hint="Target video bitrate in kilobits per second.">
      <div class="w-[200px]">
        <TextInput bind:value={$settings.videoBitrateKbps} ariaLabel="Video bitrate (kbps)" placeholder="2000" mono />
      </div>
    </SettingRow>
  </Section>

  <Section title="Audio Encoding">
    <SettingRow label="Audio codec" info hint="Audio codec for recording (Copy preserves original stream).">
      <div class="w-[280px]">
        <Select bind:value={$settings.audioCodec} options={audioCodecs} ariaLabel="Audio codec" />
      </div>
    </SettingRow>

    <SettingRow label="Audio bitrate (kbps)" info hint="Target audio bitrate in kilobits per second.">
      <div class="w-[200px]">
        <TextInput bind:value={$settings.audioBitrateKbps} ariaLabel="Audio bitrate (kbps)" placeholder="128" mono />
      </div>
    </SettingRow>
  </Section>
</div>