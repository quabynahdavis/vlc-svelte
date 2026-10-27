<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import {
    AudioLines,
    Captions,
    ChevronUp,
    Clapperboard,
    Play,
    Settings as SettingsIcon,
  } from 'lucide-svelte';
  import { settings, toggleSetting } from '../../stores/settings';
  import ColorField from './ColorField.svelte';
  import Section from './Section.svelte';
  import SettingRow from './SettingRow.svelte';
  import Select from './Select.svelte';
  import Slider from './Slider.svelte';
  import TextInput from './TextInput.svelte';
  import Toggle from './Toggle.svelte';

  const dispatch = createEventDispatcher<{ navigate: string }>();

  const tabs = [
    { id: 'playback', label: 'Playback', icon: Play },
    { id: 'video', label: 'Video', icon: Clapperboard },
    { id: 'audio', label: 'Audio', icon: AudioLines },
    { id: 'subtitles', label: 'Subtitles', icon: Captions },
  ];

  const subtitleLanguages = ['English', 'Français', 'Deutsch', 'Español'];
  const subtitleFonts = ['Inter', 'Roboto', 'Noto Sans', 'DejaVu Sans'];

  function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  function numericValue(value: string): number {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  $: delayValue = clamp(numericValue($settings.subtitleDelay), -10, 10);
  $: speedValue = clamp(numericValue($settings.subtitleSpeed), 1, 2);
  $: durationValue = clamp(numericValue($settings.subtitleDurationFactor), 0, 1);

  function setDelay(value: number): void {
    settings.update((state) => ({ ...state, subtitleDelay: `${value.toFixed(3)} s` }));
  }

  function setSpeed(value: number): void {
    settings.update((state) => ({ ...state, subtitleSpeed: `${value.toFixed(3)} fps` }));
  }

  function setDurationFactor(value: number): void {
    settings.update((state) => ({
      ...state,
      subtitleDurationFactor: value.toFixed(3),
    }));
  }
</script>

<div class="-mx-10 -mt-6">
  <div
    class="grid h-14 grid-cols-4 items-stretch border-b border-vlc-border px-10"
    role="tablist"
    aria-label="Settings categories"
  >
    {#each tabs as tab (tab.id)}
      {@const active = tab.id === 'subtitles'}
      <button
        type="button"
        role="tab"
        aria-selected={active}
        class="relative flex h-full items-center justify-center gap-2.5 text-[13px] transition-colors"
        class:text-vlc-text={active}
        class:text-vlc-dim={!active}
        class:hover:text-vlc-text={!active}
        on:click={() => dispatch('navigate', tab.id)}
      >
        <span class={active ? 'text-vlc-orange' : 'text-vlc-dim'}>
          <svelte:component this={tab.icon} size={16} strokeWidth={1.7} />
        </span>
        {tab.label}
        {#if active}
          <span
            class="absolute -bottom-px left-1/2 h-0.5 w-[120px] -translate-x-1/2 rounded-full bg-vlc-orange"
            aria-hidden="true"
          ></span>
        {/if}
      </button>
    {/each}
  </div>

  <div class="px-10 py-6">
    <div class="mb-6 border-b border-vlc-border pb-6">
      <Section title="Defaults">
        <SettingRow label="Subtitle Track">
          <div class="w-[300px]">
            <TextInput bind:value={$settings.subtitleTrack} ariaLabel="Subtitle track" mono />
          </div>
        </SettingRow>
        <SettingRow label="Subtitle Language">
          <div class="w-[300px]">
            <Select
              bind:value={$settings.subtitleLanguage}
              options={subtitleLanguages}
              ariaLabel="Subtitle language"
            />
          </div>
        </SettingRow>
      </Section>
    </div>

    <div class="mb-6 border-b border-vlc-border pb-6">
      <Section title="Synchronization">
        <SettingRow label="Subtitle Track Delay">
          <div class="w-[300px]">
            <TextInput bind:value={$settings.subtitleDelay} ariaLabel="Subtitle track delay" mono />
          </div>
        </SettingRow>
        <div class="pb-5">
          <Slider
            value={delayValue}
            min={-10}
            max={10}
            step={0.1}
            leftCaption="-10 s"
            centerCaption="0 s"
            rightCaption="+10 s"
            ariaLabel="Subtitle track delay"
            on:change={(event) => setDelay(event.detail)}
          />
        </div>

        <SettingRow label="Subtitle Speed">
          <div class="w-[300px]">
            <TextInput bind:value={$settings.subtitleSpeed} ariaLabel="Subtitle speed" mono />
          </div>
        </SettingRow>
        <div class="pb-5">
          <Slider
            value={speedValue}
            min={1}
            max={2}
            step={0.01}
            ariaLabel="Subtitle speed"
            on:change={(event) => setSpeed(event.detail)}
          />
        </div>

        <SettingRow label="Subtitle Duration Factor">
          <div class="w-[300px]">
            <TextInput
              bind:value={$settings.subtitleDurationFactor}
              ariaLabel="Subtitle duration factor"
              mono
            />
          </div>
        </SettingRow>
        <div class="pb-1">
          <Slider
            value={durationValue}
            min={0}
            max={1}
            step={0.01}
            ariaLabel="Subtitle duration factor"
            on:change={(event) => setDurationFactor(event.detail)}
          />
        </div>
      </Section>
    </div>

    <div class="mb-6">
      <Section title="Appearance">
        <SettingRow label="Embedded Sub Format">
          <Toggle bind:value={$settings.embeddedSubFormat} label="Embedded Sub Format" />
        </SettingRow>
        <SettingRow label="Subtitle Font">
          <div class="w-[300px]">
            <Select
              bind:value={$settings.subtitleFont}
              options={subtitleFonts}
              ariaLabel="Subtitle font"
            />
          </div>
        </SettingRow>
        <SettingRow label="Text Color">
          <ColorField bind:value={$settings.subtitleTextColor} ariaLabel="Text color" />
        </SettingRow>
        <SettingRow label="Outline Color">
          <ColorField bind:value={$settings.subtitleOutlineColor} ariaLabel="Outline color" />
        </SettingRow>
      </Section>
    </div>

    <div>
      <button
        type="button"
        class="flex h-12 w-full items-center justify-between rounded-[8px] border border-vlc-border bg-vlc-panel px-5 text-[13px] text-vlc-text transition-colors hover:bg-vlc-panel"
        aria-expanded={$settings.subtitlePresetOpen}
        on:click={() => toggleSetting('subtitlePresetOpen')}
      >
        Default Preset
        <span
          class="flex shrink-0 items-center justify-center text-vlc-secondary transition-transform duration-150"
          class:rotate-180={!$settings.subtitlePresetOpen}
          aria-hidden="true"
        >
          <ChevronUp size={16} strokeWidth={1.8} />
        </span>
      </button>
      {#if $settings.subtitlePresetOpen}
        <p class="px-5 pt-3 text-[12px] leading-5 text-vlc-muted">
          Default preset applied to newly opened subtitle tracks.
        </p>
      {/if}

      <div class="mt-5 flex justify-center">
        <button
          type="button"
          class="inline-flex items-center gap-2 text-[13px] text-vlc-dim transition-colors hover:text-vlc-text"
        >
          <SettingsIcon size={16} strokeWidth={1.7} />
          Open Advanced Settings
        </button>
      </div>
    </div>
  </div>
</div>
