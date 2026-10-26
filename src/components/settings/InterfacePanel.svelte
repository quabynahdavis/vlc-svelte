<script lang="ts">
  import { settings } from '../../stores/settings';
  import Section from './Section.svelte';
  import SettingRow from './SettingRow.svelte';
  import Select from './Select.svelte';
  import TextInput from './TextInput.svelte';
  import Toggle from './Toggle.svelte';
  import Segmented from './Segmented.svelte';

  const languageOptions = ['English', 'Français', 'Deutsch', 'Español', 'Italiano', 'Português', 'Русский', '中文', '日本語', '한국어'];
  const themeOptions = [
    { value: 'dark', label: 'Dark' },
    { value: 'light', label: 'Light' },
    { value: 'system', label: 'System' },
  ];
</script>

<div class="flex flex-col gap-9 pb-4">
  <Section title="Interface">
    <SettingRow label="Interface language">
      <div class="w-[426px]">
        <Select bind:value={$settings.interfaceLanguage} options={languageOptions} ariaLabel="Interface language" />
      </div>
    </SettingRow>

    <SettingRow label="Theme" info hint="Choose the application color theme.">
      <div class="w-[426px]">
        <Segmented bind:value={$settings.theme} options={themeOptions} />
      </div>
    </SettingRow>

    <SettingRow label="Minimize to tray" info hint="Minimize the window to the system tray instead of the taskbar.">
      <Toggle bind:value={$settings.minimizeToTray} label="Minimize to tray" />
    </SettingRow>

    <SettingRow label="Show systray icon" info hint="Display an icon in the system notification area.">
      <Toggle bind:value={$settings.showSystrayIcon} label="Show systray icon" />
    </SettingRow>

    <SettingRow label="Only one instance" info hint="Prevent multiple VLC windows from opening.">
      <Toggle bind:value={$settings.singleInstance} label="Only one instance" />
    </SettingRow>

    <SettingRow label="Show remaining time" info hint="Display remaining time instead of elapsed time in the player.">
      <Toggle bind:value={$settings.showRemainingTime} label="Show remaining time" />
    </SettingRow>

    <SettingRow label="File caching (ms)" info hint="Milliseconds to buffer local files before playback.">
      <div class="w-[200px]">
        <TextInput bind:value={$settings.fileCachingMs} ariaLabel="File caching (ms)" placeholder="300" mono />
      </div>
    </SettingRow>
  </Section>
</div>