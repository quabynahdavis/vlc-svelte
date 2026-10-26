<script lang="ts">
  import { ChevronRight } from 'lucide-svelte';
  import { ACCENT_COLORS, settings } from '../../stores/settings';
  import Section from './Section.svelte';
  import SettingRow from './SettingRow.svelte';
  import Segmented from './Segmented.svelte';
  import Select from './Select.svelte';
  import Swatch from './Swatch.svelte';
  import TextInput from './TextInput.svelte';
  import Toggle from './Toggle.svelte';

  const languageOptions = ['English', 'Français', 'Deutsch', 'Español'];
  const themeOptions = [
    { value: 'dark', label: 'Dark' },
    { value: 'light', label: 'Light' },
    { value: 'system', label: 'System' },
  ];
  const logDetailOptions = ['Errors only', 'Warnings and errors', 'Everything'];

  function setAccent(color: string): void {
    settings.update((state) => ({ ...state, accentColor: color }));
  }
</script>

<div class="flex flex-col gap-9 pb-4">
  <Section title="Appearance">
    <SettingRow label="Interface language">
      <div class="w-[426px]">
        <Select
          bind:value={$settings.interfaceLanguage}
          options={languageOptions}
          ariaLabel="Interface language"
        />
      </div>
    </SettingRow>

    <SettingRow label="Theme">
      <div class="w-[426px]">
        <Segmented bind:value={$settings.theme} options={themeOptions} />
      </div>
    </SettingRow>

    <SettingRow label="Accent color">
      <div class="flex items-center">
        {#each ACCENT_COLORS as accent (accent.color)}
          <Swatch
            color={accent.color}
            label={accent.label}
            selected={$settings.accentColor === accent.color}
            on:select={(event) => setAccent(event.detail)}
          />
        {/each}
      </div>
    </SettingRow>
  </Section>

  <Section title="Startup">
    <SettingRow label="Show confirmation and error dialogs" info hint="Show a confirmation dialog when closing VLC.">
      <Toggle bind:value={$settings.confirmationDialogs} label="Show confirmation and error dialogs" />
    </SettingRow>
    <SettingRow label="Check for updates automatically" info hint="Look for new releases when VLC starts.">
      <Toggle bind:value={$settings.automaticUpdates} label="Check for updates automatically" />
    </SettingRow>
  </Section>

  <Section title="Diagnostics">
    <SettingRow label="Developer mode" info hint="Expose additional debugging tools.">
      <Toggle bind:value={$settings.developerMode} label="Developer mode" />
    </SettingRow>
    <SettingRow label="Save a log" info hint="Write player activity to a log file.">
      <Toggle bind:value={$settings.saveLog} label="Save a log" />
    </SettingRow>
    <SettingRow label="Log file" info hint="Location of the VLC log file.">
      <div class="flex w-[426px] items-center gap-3">
        <TextInput bind:value={$settings.logFile} ariaLabel="Log file" placeholder="Select a log file" />
        <button
          type="button"
          class="h-9 shrink-0 rounded-[8px] px-2 text-[13px] text-[#B8B8B8] transition-colors hover:bg-[#1A1A1A] hover:text-[#EAEAEA]"
        >
          Browse
        </button>
      </div>
    </SettingRow>
    <SettingRow label="Log details" info hint="Choose how much detail is written to the log.">
      <div class="w-[426px]">
        <Select
          bind:value={$settings.logDetails}
          options={logDetailOptions}
          ariaLabel="Log details"
        />
      </div>
    </SettingRow>
  </Section>

  <div class="flex justify-center pb-2 pt-1">
    <button
      type="button"
      class="inline-flex items-center gap-2 text-[13px] text-[#8F8F8F] transition-colors hover:text-[#EAEAEA]"
    >
      Advanced Options
      <ChevronRight size={14} strokeWidth={1.8} />
    </button>
  </div>
</div>
