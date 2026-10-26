<script lang="ts">
  import { settings } from '../../stores/settings';
  import Section from './Section.svelte';
  import SettingRow from './SettingRow.svelte';
  import Toggle from './Toggle.svelte';

  function resetPreferences(): void {
    if (confirm('Reset all preferences to defaults? This cannot be undone.')) {
      settings.set({ ...settings });
    }
  }
</script>

<div class="flex flex-col gap-9 pb-4">
  <Section title="Privacy">
    <SettingRow label="Allow network access" info hint="Allow VLC to access the internet for metadata, updates, and streaming.">
      <Toggle bind:value={$settings.allowNetworkAccess} label="Allow network access" />
    </SettingRow>

    <SettingRow label="Send anonymous usage statistics" info hint="Help improve VLC by sending anonymous usage data.">
      <Toggle bind:value={$settings.sendUsageStats} label="Send anonymous usage statistics" />
    </SettingRow>

    <SettingRow label="Check for updates automatically" info hint="Automatically check for new VLC releases on startup.">
      <Toggle bind:value={$settings.checkUpdatesAutomatically} label="Check for updates automatically" />
    </SettingRow>

    <SettingRow>
      <button
        type="button"
        class="h-9 px-4 rounded-[8px] bg-vlc-danger/20 text-vlc-danger text-[13px] font-medium transition-colors hover:bg-vlc-danger/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-danger/50"
        on:click={resetPreferences}
      >
        Reset preferences
      </button>
    </SettingRow>
  </Section>
</div>