<script lang="ts">
  import { ChevronDown } from 'lucide-svelte';
  import { EQ_BANDS, settings, setEqualizerGain, toggleSetting } from '../../stores/settings';
  import Section from './Section.svelte';
  import SettingRow from './SettingRow.svelte';
  import Select from './Select.svelte';
  import Toggle from './Toggle.svelte';

  const equalizerPresets = ['None', 'Flat', 'Rock', 'Jazz', 'Classical', 'Podcast'];
  const spatialModes = [
    'Headphone virtualization',
    'Stereo widening',
    'Ambisonics',
  ];

  function percentFor(value: number, min: number, max: number): number {
    return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  }
</script>

<div class="flex flex-col gap-7 pb-4">
  <Section title="Effects">
    <SettingRow label="Equalizer">
      <Toggle bind:value={$settings.equalizer} label="Equalizer" />
    </SettingRow>
    <SettingRow label="Equalizer preset">
      <div class="w-[426px]">
        <Select
          bind:value={$settings.equalizerPreset}
          options={equalizerPresets}
          ariaLabel="Equalizer preset"
        />
      </div>
    </SettingRow>

    <div class="flex justify-center pb-1 pt-3">
      <button
        type="button"
        class="inline-flex items-center gap-2 text-[13px] text-vlc-secondary transition-colors hover:text-vlc-text"
        aria-expanded={$settings.equalizerOpen}
        on:click={() => toggleSetting('equalizerOpen')}
      >
        Close Equalizer
        <span
          class="flex shrink-0 items-center justify-center transition-transform duration-150"
          class:-rotate-180={!$settings.equalizerOpen}
          aria-hidden="true"
        >
          <ChevronDown size={15} strokeWidth={1.8} />
        </span>
      </button>
    </div>

    {#if $settings.equalizerOpen}
      <div class="w-full overflow-x-auto pb-1">
        <div class="mx-auto flex min-w-[680px] items-end justify-between gap-2 px-1">
          {#each EQ_BANDS as band, index (band.id)}
            {@const gain = $settings.eqGains[index] ?? 0}
            <div class="flex min-w-0 flex-1 flex-col items-center">
              <div class="flex h-[292px] w-full items-center justify-center">
                <input
                  type="range"
                  min={band.min}
                  max={band.max}
                  step="0.5"
                  value={gain}
                  aria-label={`${band.label} equalizer gain`}
                  aria-valuetext={`${gain.toFixed(1)} dB`}
                  style={`--eq-pct: ${percentFor(gain, band.min, band.max)}%`}
                  class="eq-slider"
                  on:input={(event) => setEqualizerGain(index, Number(event.currentTarget.value))}
                />
              </div>
              <span class="mt-4 block text-[11px] leading-4 text-vlc-muted">{band.label}</span>
              <span
                class="mt-2 flex h-7 min-w-[62px] items-center justify-center rounded-[6px] bg-vlc-card px-1.5 text-[11px] tabular-nums text-vlc-secondary"
              >
                {gain.toFixed(1)} dB
              </span>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </Section>

  <div class="flex flex-col">
    <SettingRow label="Two-pass" info hint="Processes audio twice for higher quality, at the cost of speed.">
      <Toggle bind:value={$settings.twoPass} label="Two-pass" />
    </SettingRow>
    <SettingRow label="Spatial audio">
      <Toggle bind:value={$settings.spatialAudio} label="Spatial audio" />
    </SettingRow>
    <SettingRow label="Spatial audio mode" info hint="How spatial audio is mixed for your headphones or speakers.">
      <div class="w-[426px]">
        <Select
          bind:value={$settings.spatialAudioMode}
          options={spatialModes}
          ariaLabel="Spatial audio mode"
        />
      </div>
    </SettingRow>
    <SettingRow label="Stereo widening">
      <Toggle bind:value={$settings.stereoWidening} label="Stereo widening" />
    </SettingRow>
  </div>
</div>

<style>
  .eq-slider {
    -webkit-appearance: none;
    appearance: none;
    width: 292px;
    height: 24px;
    flex-shrink: 0;
    background: transparent;
    cursor: pointer;
    transform: rotate(-90deg);
  }

  .eq-slider::-webkit-slider-runnable-track {
    height: 6px;
    border-radius: 9999px;
    background: linear-gradient(
      to right,
      var(--accent) 0%,
      var(--accent) var(--eq-pct),
      var(--border-subtle) var(--eq-pct),
      var(--border-subtle) 100%
    );
    box-shadow: inset 0 0 0 1px var(--border);
  }

  .eq-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 8px;
    height: 16px;
    margin-top: -5px;
    border: 0;
    border-radius: 3px;
    background: var(--accent);
  }

  .eq-slider:focus-visible {
    outline: none;
  }

  .eq-slider:focus-visible::-webkit-slider-thumb {
    box-shadow: 0 0 0 3px rgb(var(--accent-rgb) / 0.3);
  }

  .eq-slider::-moz-range-track {
    height: 6px;
    border-radius: 9999px;
    background: var(--border-subtle);
  }

  .eq-slider::-moz-range-progress {
    height: 6px;
    border-radius: 9999px;
    background: var(--accent);
  }

  .eq-slider::-moz-range-thumb {
    width: 8px;
    height: 16px;
    border: 0;
    border-radius: 3px;
    background: var(--accent);
  }
</style>
