<script lang="ts">
  import { settings } from '../../stores/settings';
  import Section from './Section.svelte';
  import SettingRow from './SettingRow.svelte';
  import TextInput from './TextInput.svelte';
  import Toggle from './Toggle.svelte';
  import Slider from './Slider.svelte';
</script>

<div class="flex flex-col gap-9 pb-4">
  <Section title="Proxy">
    <SettingRow label="HTTP proxy" info hint="Route traffic through a proxy, written as host:port.">
      <div class="w-[426px]">
        <TextInput bind:value={$settings.httpProxy} ariaLabel="HTTP proxy" placeholder="host:port" />
      </div>
    </SettingRow>

    <SettingRow label="Proxy user">
      <div class="w-[426px]">
        <TextInput bind:value={$settings.proxyUser} ariaLabel="Proxy user" placeholder="Username" />
      </div>
    </SettingRow>

    <SettingRow label="Proxy password">
      <div class="w-[426px]">
        <TextInput bind:value={$settings.proxyPassword} ariaLabel="Proxy password" placeholder="Password" type="password" />
      </div>
    </SettingRow>
  </Section>

  <Section title="Cache & Timeouts">
    <SettingRow label="Cache size (MB)" info hint="How much downloaded data is kept in memory to avoid re-fetching.">
      <div class="w-[426px]">
        <Slider
          bind:value={$settings.cacheSizeMB}
          min={0}
          max={500}
          step={1}
          leftCaption="0 MB"
          centerCaption="250 MB"
          rightCaption="500 MB"
          ariaLabel="Cache size"
        />
      </div>
    </SettingRow>

    <SettingRow label="Timeout (ms)" info hint="How long to wait for a network reply before giving up.">
      <div class="w-[200px]">
        <TextInput bind:value={$settings.timeoutMs} ariaLabel="Timeout (ms)" placeholder="10000" mono />
      </div>
    </SettingRow>
  </Section>

  <Section title="HTTP">
    <SettingRow label="User agent">
      <div class="w-[426px]">
        <TextInput bind:value={$settings.userAgent} ariaLabel="User agent" placeholder="VLC/3.0" />
      </div>
    </SettingRow>

    <SettingRow label="Cookies">
      <Toggle bind:value={$settings.cookies} label="Cookies" />
    </SettingRow>

    <SettingRow label="Prefer IPv6" info hint="Try IPv6 first when a server supports both address types.">
      <Toggle bind:value={$settings.preferIPv6} label="Prefer IPv6" />
    </SettingRow>
  </Section>
</div>