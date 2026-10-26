<script lang="ts">
  import { ChevronDown, Settings as SettingsIcon } from 'lucide-svelte';
  import { settings } from '../../stores/settings';
  import Accordion from './Accordion.svelte';
  import DockSlider from './DockSlider.svelte';
  import TogglePill from './TogglePill.svelte';

  export let onAdvancedSettings: (category?: string) => void = () => {};

  let embeddedSubFormat = $settings.embeddedSubFormat;
  let presetOpen = $settings.subtitlePresetOpen;
  let textColor = $settings.subtitleTextColor || '#B8B8B8';
  let outlineColor =
    $settings.subtitleOutlineColor === '#0E0E0E' ? '#0C0C0C' : $settings.subtitleOutlineColor;

  $: delayValue = clamp(numericValue($settings.subtitleDelay), -10, 10);
  $: speedValue = clamp(numericValue($settings.subtitleSpeed), 1, 2);
  $: durationValue = clamp(numericValue($settings.subtitleDurationFactor), 0, 1);

  function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  function numericValue(value: string): number {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function setDelay(value: number): void {
    settings.update((state) => ({ ...state, subtitleDelay: `${value.toFixed(3)} s` }));
  }

  function setSpeed(value: number): void {
    settings.update((state) => ({ ...state, subtitleSpeed: `${value.toFixed(3)} fps` }));
  }

  function setDurationFactor(value: number): void {
    settings.update((state) => ({ ...state, subtitleDurationFactor: value.toFixed(3) }));
  }

  function handleEmbeddedChange(value: boolean): void {
    embeddedSubFormat = value;
    settings.update((state) => ({ ...state, embeddedSubFormat: value }));
  }

  function handleTrackInput(event: Event): void {
    const value = (event.currentTarget as HTMLInputElement).value;
    settings.update((state) => ({ ...state, subtitleTrack: value }));
  }

  function handleLanguageChange(event: Event): void {
    const value = (event.currentTarget as HTMLSelectElement).value;
    settings.update((state) => ({ ...state, subtitleLanguage: value }));
  }

  function handleFontChange(event: Event): void {
    const value = (event.currentTarget as HTMLSelectElement).value;
    settings.update((state) => ({ ...state, subtitleFont: value }));
  }

  function handleTextColorInput(event: Event): void {
    textColor = (event.currentTarget as HTMLInputElement).value;
    settings.update((state) => ({ ...state, subtitleTextColor: textColor }));
  }

  function handleOutlineColorInput(event: Event): void {
    outlineColor = (event.currentTarget as HTMLInputElement).value;
    settings.update((state) => ({ ...state, subtitleOutlineColor: outlineColor }));
  }
</script>

<div class="flex min-h-full flex-col" data-subtitle-dock>
  <div class="divide-y divide-vlc-border">
    <section class="px-4 py-4">
      <h3 class="text-[15px] leading-5 text-vlc-text">Defaults</h3>

      <div class="mt-4 space-y-3">
        <div class="flex items-center justify-between gap-3">
          <span class="min-w-0 truncate text-[13px] text-vlc-dim">Subtitle Track</span>
          <input
            type="text"
            value={$settings.subtitleTrack}
            aria-label="Subtitle track"
            class="h-[38px] w-[148px] shrink-0 rounded-[6px] border border-vlc-border/70 bg-[#0A0A0A] px-3 text-[13px] tabular-nums text-vlc-secondary outline-none transition-colors focus:border-vlc-orange/60"
            on:input={handleTrackInput}
          />
        </div>

        <div class="flex items-center justify-between gap-3">
          <span class="min-w-0 truncate text-[13px] text-vlc-dim">Subtitle Language</span>
          <div class="relative w-[148px] shrink-0">
            <select
              value={$settings.subtitleLanguage}
              aria-label="Subtitle language"
              class="h-[38px] w-full appearance-none rounded-[6px] border border-vlc-border/70 bg-[#0A0A0A] pl-3 pr-8 text-[13px] text-vlc-secondary outline-none transition-colors focus:border-vlc-orange/60"
              on:change={handleLanguageChange}
            >
              <option>English</option>
              <option>Français</option>
              <option>Deutsch</option>
              <option>Español</option>
            </select>
            <ChevronDown
              size={14}
              strokeWidth={1.7}
              class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-vlc-dim"
              aria-hidden="true"
            />
          </div>
        </div>
      </div>
    </section>

    <section class="px-4 py-4">
      <h3 class="text-[15px] leading-5 text-vlc-text">Synchronization</h3>

      <div class="mt-4 space-y-3">
        <div class="flex items-center justify-between gap-3">
          <span class="min-w-0 truncate text-[13px] text-vlc-dim">Subtitle Track Delay</span>
          <div
            class="flex h-[38px] w-[148px] shrink-0 items-center rounded-[6px] border border-vlc-border/70 bg-[#0A0A0A] px-3 text-[13px] tabular-nums text-vlc-secondary"
          >
            {delayValue.toFixed(3)} s
          </div>
        </div>

        <DockSlider
          label=""
          ariaLabel="Subtitle track delay"
          value={delayValue}
          min={-10}
          max={10}
          step={0.05}
          decimals={3}
          leftCaption="-10 s"
          centerCaption="0 s"
          rightCaption="+10 s"
          on:change={(event) => setDelay(event.detail)}
        />

        <div class="flex items-center justify-between gap-3">
          <span class="min-w-0 truncate text-[13px] text-vlc-dim">Subtitle Speed</span>
          <div
            class="flex h-[38px] w-[148px] shrink-0 items-center rounded-[6px] border border-vlc-border/70 bg-[#0A0A0A] px-3 text-[13px] tabular-nums text-vlc-secondary"
          >
            {speedValue.toFixed(3)} fps
          </div>
        </div>

        <DockSlider
          label=""
          ariaLabel="Subtitle speed"
          value={speedValue}
          min={1}
          max={2}
          step={0.01}
          decimals={3}
          on:change={(event) => setSpeed(event.detail)}
        />

        <div class="flex items-center justify-between gap-3">
          <span class="min-w-0 truncate text-[13px] text-vlc-dim">Subtitle Duration Factor</span>
          <div
            class="flex h-[38px] w-[148px] shrink-0 items-center rounded-[6px] border border-vlc-border/70 bg-[#0A0A0A] px-3 text-[13px] tabular-nums text-vlc-secondary"
          >
            {durationValue.toFixed(3)}
          </div>
        </div>

        <DockSlider
          label=""
          ariaLabel="Subtitle duration factor"
          value={durationValue}
          min={0}
          max={1}
          step={0.01}
          decimals={3}
          on:change={(event) => setDurationFactor(event.detail)}
        />
      </div>
    </section>

    <section class="px-4 py-4">
      <h3 class="text-[15px] leading-5 text-vlc-text">Appearance</h3>

      <div class="mt-4 space-y-3">
        <div class="flex items-center justify-between gap-3">
          <span class="text-[13px] text-vlc-dim">Embedded Sub Format</span>
          <TogglePill
            value={embeddedSubFormat}
            ariaLabel="Embedded sub format"
            on:change={(event) => handleEmbeddedChange(event.detail)}
          />
        </div>

        <div class="flex items-center justify-between gap-3">
          <span class="min-w-0 truncate text-[13px] text-vlc-dim">Subtitle Font</span>
          <div class="relative w-[148px] shrink-0">
            <select
              value={$settings.subtitleFont}
              aria-label="Subtitle font"
              class="h-[38px] w-full appearance-none rounded-[6px] border border-vlc-border/70 bg-[#0A0A0A] pl-3 pr-8 text-[13px] text-vlc-secondary outline-none transition-colors focus:border-vlc-orange/60"
              on:change={handleFontChange}
            >
              <option>Inter</option>
              <option>Roboto</option>
              <option>Noto Sans</option>
              <option>DejaVu Sans</option>
            </select>
            <ChevronDown
              size={14}
              strokeWidth={1.7}
              class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-vlc-dim"
              aria-hidden="true"
            />
          </div>
        </div>

        <div class="flex items-center justify-between gap-3">
          <span class="min-w-0 truncate text-[13px] text-vlc-dim">Text Color</span>
          <label
            class="relative flex h-[38px] w-[148px] shrink-0 cursor-pointer items-center justify-between gap-2 rounded-[6px] border border-vlc-border/70 bg-[#0A0A0A] px-3"
          >
            <span class="truncate text-[12px] tabular-nums text-vlc-secondary">
              {textColor.toUpperCase()}
            </span>
            <span
              class="h-[22px] w-[22px] shrink-0 rounded-[3px] border border-white/15"
              style={`background: ${textColor}`}
              aria-hidden="true"
            ></span>
            <input
              type="color"
              value={textColor}
              aria-label="Text color"
              class="absolute inset-0 h-full w-full cursor-pointer rounded-[6px] opacity-0"
              on:input={handleTextColorInput}
            />
          </label>
        </div>

        <div class="flex items-center justify-between gap-3">
          <span class="min-w-0 truncate text-[13px] text-vlc-dim">Outline Color</span>
          <label
            class="relative flex h-[38px] w-[148px] shrink-0 cursor-pointer items-center justify-between gap-2 rounded-[6px] border border-vlc-border/70 bg-[#0A0A0A] px-3"
          >
            <span class="truncate text-[12px] tabular-nums text-vlc-secondary">
              {outlineColor.toUpperCase()}
            </span>
            <span
              class="h-[22px] w-[22px] shrink-0 rounded-[3px] border border-white/15"
              style={`background: ${outlineColor}`}
              aria-hidden="true"
            ></span>
            <input
              type="color"
              value={outlineColor}
              aria-label="Outline color"
              class="absolute inset-0 h-full w-full cursor-pointer rounded-[6px] opacity-0"
              on:input={handleOutlineColorInput}
            />
          </label>
        </div>
      </div>
    </section>

    <section class="px-4 py-4">
      <Accordion title="Default Preset" bind:open={presetOpen}>
        <p class="text-[12px] leading-5 text-vlc-muted">
          Default preset applied to newly opened subtitle tracks.
        </p>
      </Accordion>

      <div class="flex justify-center pt-5">
        <button
          type="button"
          class="inline-flex items-center gap-2 text-[13px] text-vlc-dim transition-colors hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/40"
          on:click={() => onAdvancedSettings('Subtitles')}
        >
          <SettingsIcon size={16} strokeWidth={1.7} />
          Open Advanced Settings
        </button>
      </div>
    </section>
  </div>
</div>
