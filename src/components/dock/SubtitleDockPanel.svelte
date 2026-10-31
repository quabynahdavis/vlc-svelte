<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { Bookmark, ChevronDown, Settings as SettingsIcon, Trash2 } from 'lucide-svelte';
  import { currentTrack } from '../../stores/player';
  import { settings } from '../../stores/settings';
  import { openSubtitleAdd } from '../../stores/subtitleAdd';
  import {
    BUILTIN_SUBTITLE_PRESETS,
    SUBTITLE_FONTS,
    SUBTITLE_VERTICAL_POSITION_OPTIONS,
    applyShowPreset,
    deleteCustomPreset,
    deleteShowPreset,
    findShowDefaults,
    hasPersistedSubtitleFormatting,
    listShowPresets,
    rememberShowDefaults,
    saveCustomPreset,
    saveShowPreset,
    showKeyFromTitle,
    snapSubtitleDelay,
    subtitleProfiles,
    updateFormatting,
    type SubtitleFormatting,
    type SubtitleProfileSnapshot,
  } from '../../stores/subtitleProfiles';
  import Accordion from './Accordion.svelte';
  import DockSlider from './DockSlider.svelte';
  import SubtitleTimeline from './SubtitleTimeline.svelte';
  import TogglePill from './TogglePill.svelte';

  export let onAdvancedSettings: (category?: string) => void = () => {};

  let embeddedSubFormat = $settings.embeddedSubFormat;
  let presetOpen = $settings.subtitlePresetOpen;
  let presetName = '';
  let showPresetName = '';
  let statusMessage = '';
  let statusTimer: ReturnType<typeof setTimeout> | null = null;
  let lastAppliedShowKey = '';

  $: delayValue = clamp(numericValue($settings.subtitleDelay), -10, 10);
  $: speedValue = clamp(numericValue($settings.subtitleSpeed), 1, 2);
  $: durationValue = clamp(numericValue($settings.subtitleDurationFactor), 0, 1);
  $: formatting = $subtitleProfiles.formatting;
  $: sizeMin = formatting.sizeMode === 'relative' ? 50 : 12;
  $: sizeMax = formatting.sizeMode === 'relative' ? 200 : 72;
  $: sizeSuffix = formatting.sizeMode === 'relative' ? '%' : 'px';
  $: showKey = showKeyFromTitle($currentTrack?.title);
  $: savedShowDefaults = findShowDefaults($subtitleProfiles, showKey);
  $: showPresets = listShowPresets(showKey);
  $: currentProfileSnapshot = { formatting: { ...formatting }, delay: delayValue };  // reactive

  function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  function numericValue(value: string): number {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function announce(message: string): void {
    statusMessage = message;
    if (statusTimer !== null) clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      statusMessage = '';
      statusTimer = null;
    }, 3200);
  }

  function syncFormattingToSettings(next: SubtitleFormatting): void {
    settings.update((state) => ({
      ...state,
      subtitleFont: next.font,
      subtitleTextColor: next.textColor,
      subtitleOutlineColor: next.outlineColor,
    }));
  }

  /**
   * Persist formatting in the subtitle profile store and mirror the legacy
   * settings fields so the settings screen and the dock stay aligned. These
   * values are preferences only; there is no subtitle renderer in this build.
   */
  function applyFormatting(patch: Partial<SubtitleFormatting>): void {
    const next = updateFormatting(patch);
    if ('font' in patch || 'textColor' in patch || 'outlineColor' in patch) {
      syncFormattingToSettings(next);
    }
  }

  function setSizeMode(mode: SubtitleFormatting['sizeMode']): void {
    if (formatting.sizeMode === mode) return;

    const size =
      mode === 'relative'
        ? clamp(Math.round(formatting.size / 0.24), 50, 200)
        : clamp(Math.round(formatting.size * 0.24), 12, 72);

    applyFormatting({ sizeMode: mode, size });
  }

  function setDelay(value: number): void {
    const next = snapSubtitleDelay(value);
    settings.update((state) => ({ ...state, subtitleDelay: `${next.toFixed(3)} s` }));
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
    applyFormatting({ font: value });
  }

  function handleTextColorInput(event: Event): void {
    const value = (event.currentTarget as HTMLInputElement).value;
    applyFormatting({ textColor: value });
  }

  function handleOutlineColorInput(event: Event): void {
    const value = (event.currentTarget as HTMLInputElement).value;
    applyFormatting({ outlineColor: value });
  }

  function handlePositionChange(event: Event): void {
    const value = (event.currentTarget as HTMLSelectElement)
      .value as SubtitleFormatting['verticalPosition'];
    applyFormatting({ verticalPosition: value });
  }

  function currentProfile(): SubtitleProfileSnapshot {
    return { formatting: { ...formatting }, delay: delayValue };
  }

  function applyProfile(profile: SubtitleProfileSnapshot, label: string): void {
    const nextFormatting = updateFormatting(profile.formatting);
    const nextDelay = snapSubtitleDelay(profile.delay);

    settings.update((state) => ({
      ...state,
      subtitleDelay: `${nextDelay.toFixed(3)} s`,
      subtitleFont: nextFormatting.font,
      subtitleTextColor: nextFormatting.textColor,
      subtitleOutlineColor: nextFormatting.outlineColor,
    }));

    announce(`Applied ${label}.`);
  }

  function savePreset(): void {
    const name = presetName.trim();
    if (!name) {
      announce('Enter a preset name first.');
      return;
    }

    const saved = saveCustomPreset(name, currentProfile());
    if (!saved) {
      announce('Enter a preset name first.');
      return;
    }

    presetName = '';
    announce(`Saved preset "${saved.name}".`);
  }

  function removePreset(preset: { id: string; name: string }): void {
    if (deleteCustomPreset(preset.id)) {
      announce(`Deleted preset "${preset.name}".`);
    }
  }

  function applyShowPresetByName(presetName: string): void {
    const preset = applyShowPreset(showKey, presetName);
    if (!preset) return;

    const nextFormatting = updateFormatting(preset.profile.formatting);
    const nextDelay = snapSubtitleDelay(preset.profile.delay);

    settings.update((state) => ({
      ...state,
      subtitleTrack: preset.defaultTrack || state.subtitleTrack,
      subtitleLanguage: preset.defaultLanguage || state.subtitleLanguage,
      subtitleDelay: `${nextDelay.toFixed(3)} s`,
      subtitleFont: nextFormatting.font,
      subtitleTextColor: nextFormatting.textColor,
      subtitleOutlineColor: nextFormatting.outlineColor,
    }));

    announce(`Applied show preset '${preset.name}'.`);
  }

  function deleteShowPresetByName(presetName: string): void {
    if (deleteShowPreset(showKey, presetName)) {
      announce(`Deleted show preset "${presetName}".`);
    }
  }

  function saveShowPresetForCurrent(): void {
    if (!showKey) {
      announce('Load media to save a show preset.');
      return;
    }

    const name = showPresetName.trim() || showKey;
    const saved = saveShowPreset(showKey, name, {
      profile: currentProfileSnapshot,
      defaultTrack: $settings.subtitleTrack,
      defaultLanguage: $settings.subtitleLanguage,
    });

    if (!saved) {
      announce('Could not save show preset.');
      return;
    }

    showPresetName = '';
    announce(`Saved show preset "${saved.name}".`);
  }

  function rememberShow(): void {
    if (!$currentTrack) return;

    const saved = rememberShowDefaults(showKey, {
      track: $settings.subtitleTrack,
      language: $settings.subtitleLanguage,
      profile: currentProfile(),
    });

    if (saved) announce(`Saved defaults for ${saved.showKey}.`);
  }

  function applyShowDefaults(): void {
    const saved = savedShowDefaults;
    if (!saved) return;

    const nextFormatting = updateFormatting(saved.profile.formatting);
    const nextDelay = snapSubtitleDelay(saved.profile.delay);

    settings.update((state) => ({
      ...state,
      subtitleTrack: saved.track || state.subtitleTrack,
      subtitleLanguage: saved.language || state.subtitleLanguage,
      subtitleDelay: `${nextDelay.toFixed(3)} s`,
      subtitleFont: nextFormatting.font,
      subtitleTextColor: nextFormatting.textColor,
      subtitleOutlineColor: nextFormatting.outlineColor,
    }));

    announce(`Applied saved defaults for ${saved.showKey}.`);
  }

  onMount(() => {
    // First run after the profile store was introduced: migrate the legacy
    // settings-based font/colours instead of showing unrelated defaults.
    if (!hasPersistedSubtitleFormatting()) {
      updateFormatting({
        font: $settings.subtitleFont,
        textColor: $settings.subtitleTextColor,
        outlineColor: $settings.subtitleOutlineColor,
      });
    }
  });

  $: if ($currentTrack && showKey && showKey !== lastAppliedShowKey) {
    const presets = listShowPresets(showKey);
    if (presets.length > 0) {
      const preset = presets[0];
      const applied = applyShowPreset(showKey, preset.name);
      if (applied) {
        const nextFormatting = updateFormatting(applied.profile.formatting);
        const nextDelay = snapSubtitleDelay(applied.profile.delay);

        settings.update((state) => ({
          ...state,
          subtitleTrack: applied.defaultTrack || state.subtitleTrack,
          subtitleLanguage: applied.defaultLanguage || state.subtitleLanguage,
          subtitleDelay: `${nextDelay.toFixed(3)} s`,
          subtitleFont: nextFormatting.font,
          subtitleTextColor: nextFormatting.textColor,
          subtitleOutlineColor: nextFormatting.outlineColor,
        }));

        announce(`Applied show preset '${applied.name}'`);
        lastAppliedShowKey = showKey;
      }
    } else {
      lastAppliedShowKey = showKey;
    }
  }

  onDestroy(() => {
    if (statusTimer !== null) clearTimeout(statusTimer);
  });
</script>

<div class="flex min-h-full flex-col" data-subtitle-dock>
  <div class="divide-y divide-vlc-border">
    {#if savedShowDefaults}
      <section class="px-4 py-3" aria-label="Saved show defaults">
        <div
          class="flex items-start gap-2.5 rounded-[8px] border border-vlc-orange/30 bg-vlc-orange/10 px-3 py-2.5"
        >
          <Bookmark
            size={14}
            strokeWidth={1.7}
            class="mt-0.5 shrink-0 text-vlc-orangeText"
            aria-hidden="true"
          />
          <div class="min-w-0 flex-1">
            <p class="truncate text-[12px] leading-4 text-vlc-text" title={savedShowDefaults.showKey}>
              Saved defaults for {savedShowDefaults.showKey}
            </p>
            <button
              type="button"
              class="mt-1 rounded-[4px] text-[11px] font-medium leading-4 text-vlc-orangeText transition-colors hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
              on:click={applyShowDefaults}
            >
              Apply saved defaults
            </button>
          </div>
        </div>
      </section>
    {/if}

    <section class="px-4 py-3">
      <button
        type="button"
        class="flex h-9 w-full items-center justify-center gap-2 rounded-[6px] border border-vlc-border/70 bg-vlc-app px-3 text-[12px] text-vlc-secondary transition-colors hover:border-vlc-orange/50 hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50 disabled:cursor-not-allowed disabled:opacity-45"
        disabled={!$currentTrack}
        on:click={() => openSubtitleAdd('file', $currentTrack)}
      >
        Add subtitles
      </button>
    </section>

    <section class="px-4 py-4">
      <h3 class="text-[15px] leading-5 text-vlc-text">Defaults</h3>

      <div class="mt-4 space-y-3">
        <div class="flex items-center justify-between gap-3">
          <span class="min-w-0 truncate text-[13px] text-vlc-secondary">Subtitle Track</span>
          <input
            type="text"
            value={$settings.subtitleTrack}
            aria-label="Subtitle track"
            class="h-[38px] w-[148px] shrink-0 rounded-[6px] border border-vlc-border/70 bg-vlc-app px-3 text-[13px] tabular-nums text-vlc-secondary outline-none transition-colors focus:border-vlc-orange/60 focus-visible:ring-2 focus-visible:ring-vlc-orange/40"
            on:input={handleTrackInput}
          />
        </div>

        <div class="flex items-center justify-between gap-3">
          <span class="min-w-0 truncate text-[13px] text-vlc-secondary">Subtitle Language</span>
          <div class="relative w-[148px] shrink-0">
            <select
              value={$settings.subtitleLanguage}
              aria-label="Subtitle language"
              class="h-[38px] w-full appearance-none rounded-[6px] border border-vlc-border/70 bg-vlc-app pl-3 pr-8 text-[13px] text-vlc-secondary outline-none transition-colors focus:border-vlc-orange/60 focus-visible:ring-2 focus-visible:ring-vlc-orange/40"
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
              class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-vlc-muted"
              aria-hidden="true"
            />
          </div>
        </div>
      </div>
    </section>

    <section class="px-4 py-4">
      <h3 class="text-[15px] leading-5 text-vlc-text">Synchronization</h3>

      <div class="mt-4 space-y-3">
        <SubtitleTimeline />

        <DockSlider
          label="Fine delay"
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
          <span class="min-w-0 truncate text-[13px] text-vlc-secondary">Subtitle Speed</span>
          <div
            class="flex h-[38px] w-[148px] shrink-0 items-center rounded-[6px] border border-vlc-border/70 bg-vlc-app px-3 text-[13px] tabular-nums text-vlc-secondary"
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
          <span class="min-w-0 truncate text-[13px] text-vlc-secondary">Subtitle Duration Factor</span>
          <div
            class="flex h-[38px] w-[148px] shrink-0 items-center rounded-[6px] border border-vlc-border/70 bg-vlc-app px-3 text-[13px] tabular-nums text-vlc-secondary"
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
      <h3 class="text-[15px] leading-5 text-vlc-text">Formatting</h3>

      <div class="mt-4 space-y-3">
        <div class="flex items-center justify-between gap-3">
          <span class="text-[13px] text-vlc-secondary">Embedded Sub Format</span>
          <TogglePill
            value={embeddedSubFormat}
            ariaLabel="Embedded sub format"
            on:change={(event) => handleEmbeddedChange(event.detail)}
          />
        </div>

        <div class="flex items-center justify-between gap-3">
          <span class="min-w-0 truncate text-[13px] text-vlc-secondary">Subtitle Font</span>
          <div class="relative w-[148px] shrink-0">
            <select
              value={formatting.font}
              aria-label="Subtitle font"
              class="h-[38px] w-full appearance-none rounded-[6px] border border-vlc-border/70 bg-vlc-app pl-3 pr-8 text-[13px] text-vlc-secondary outline-none transition-colors focus:border-vlc-orange/60 focus-visible:ring-2 focus-visible:ring-vlc-orange/40"
              on:change={handleFontChange}
            >
              {#each SUBTITLE_FONTS as font (font)}
                <option value={font}>{font}</option>
              {/each}
            </select>
            <ChevronDown
              size={14}
              strokeWidth={1.7}
              class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-vlc-muted"
              aria-hidden="true"
            />
          </div>
        </div>

        <div class="flex items-center justify-between gap-3">
          <span class="text-[13px] text-vlc-secondary">Size Mode</span>
          <div
            class="grid w-[148px] shrink-0 grid-cols-2 gap-1 rounded-[6px] border border-vlc-border/70 bg-vlc-app p-1"
            role="group"
            aria-label="Subtitle size mode"
          >
            <button
              type="button"
              aria-pressed={formatting.sizeMode === 'relative'}
              class="h-7 rounded-[4px] text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
              class:bg-vlc-raised={formatting.sizeMode === 'relative'}
              class:text-vlc-text={formatting.sizeMode === 'relative'}
              class:text-vlc-muted={formatting.sizeMode !== 'relative'}
              on:click={() => setSizeMode('relative')}
            >
              Relative
            </button>
            <button
              type="button"
              aria-pressed={formatting.sizeMode === 'exact'}
              class="h-7 rounded-[4px] text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
              class:bg-vlc-raised={formatting.sizeMode === 'exact'}
              class:text-vlc-text={formatting.sizeMode === 'exact'}
              class:text-vlc-muted={formatting.sizeMode !== 'exact'}
              on:click={() => setSizeMode('exact')}
            >
              Exact
            </button>
          </div>
        </div>

        <DockSlider
          label="Size"
          ariaLabel={`Subtitle size in ${formatting.sizeMode === 'relative' ? 'percent' : 'pixels'}`}
          value={formatting.size}
          min={sizeMin}
          max={sizeMax}
          step={1}
          decimals={0}
          suffix={sizeSuffix}
          leftCaption={`${sizeMin}${sizeSuffix}`}
          rightCaption={`${sizeMax}${sizeSuffix}`}
          on:change={(event) => applyFormatting({ size: event.detail })}
        />

        <DockSlider
          label="Outline Width"
          ariaLabel="Subtitle outline width"
          value={formatting.outlineWidth}
          min={0}
          max={4}
          step={0.1}
          decimals={1}
          suffix="px"
          leftCaption="0 px"
          rightCaption="4 px"
          on:change={(event) => applyFormatting({ outlineWidth: event.detail })}
        />

        <DockSlider
          label="Background Opacity"
          ariaLabel="Subtitle background opacity"
          value={formatting.backgroundOpacity}
          min={0}
          max={100}
          step={1}
          decimals={0}
          suffix="%"
          leftCaption="0%"
          rightCaption="100%"
          on:change={(event) => applyFormatting({ backgroundOpacity: event.detail })}
        />

        <div class="flex items-center justify-between gap-3">
          <span class="min-w-0 truncate text-[13px] text-vlc-secondary">Position</span>
          <div class="relative w-[148px] shrink-0">
            <select
              value={formatting.verticalPosition}
              aria-label="Subtitle vertical position"
              class="h-[38px] w-full appearance-none rounded-[6px] border border-vlc-border/70 bg-vlc-app pl-3 pr-8 text-[13px] text-vlc-secondary outline-none transition-colors focus:border-vlc-orange/60 focus-visible:ring-2 focus-visible:ring-vlc-orange/40"
              on:change={handlePositionChange}
            >
              {#each SUBTITLE_VERTICAL_POSITION_OPTIONS as option (option.value)}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
            <ChevronDown
              size={14}
              strokeWidth={1.7}
              class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-vlc-muted"
              aria-hidden="true"
            />
          </div>
        </div>

        <div class="flex items-center justify-between gap-3">
          <span class="min-w-0 truncate text-[13px] text-vlc-secondary">Text Color</span>
          <label
            class="relative flex h-[38px] w-[148px] shrink-0 cursor-pointer items-center justify-between gap-2 rounded-[6px] border border-vlc-border/70 bg-vlc-app px-3 transition-colors focus-within:border-vlc-orange/60 focus-within:ring-2 focus-within:ring-vlc-orange/40"
          >
            <span class="truncate text-[12px] tabular-nums text-vlc-secondary">
              {formatting.textColor.toUpperCase()}
            </span>
            <span
              class="h-[22px] w-[22px] shrink-0 rounded-[3px] border border-vlc-borderStrong"
              style={`background: ${formatting.textColor}`}
              aria-hidden="true"
            ></span>
            <input
              type="color"
              value={formatting.textColor}
              aria-label="Text color"
              class="absolute inset-0 h-full w-full cursor-pointer rounded-[6px] opacity-0"
              on:input={handleTextColorInput}
            />
          </label>
        </div>

        <div class="flex items-center justify-between gap-3">
          <span class="min-w-0 truncate text-[13px] text-vlc-secondary">Outline Color</span>
          <label
            class="relative flex h-[38px] w-[148px] shrink-0 cursor-pointer items-center justify-between gap-2 rounded-[6px] border border-vlc-border/70 bg-vlc-app px-3 transition-colors focus-within:border-vlc-orange/60 focus-within:ring-2 focus-within:ring-vlc-orange/40"
          >
            <span class="truncate text-[12px] tabular-nums text-vlc-secondary">
              {formatting.outlineColor.toUpperCase()}
            </span>
            <span
              class="h-[22px] w-[22px] shrink-0 rounded-[3px] border border-vlc-borderStrong"
              style={`background: ${formatting.outlineColor}`}
              aria-hidden="true"
            ></span>
            <input
              type="color"
              value={formatting.outlineColor}
              aria-label="Outline color"
              class="absolute inset-0 h-full w-full cursor-pointer rounded-[6px] opacity-0"
              on:input={handleOutlineColorInput}
            />
          </label>
        </div>

        <p class="text-[11px] leading-4 text-vlc-muted">
          Stored as subtitle preferences. This build has no subtitle renderer, so these values are
          not drawn on the video surface yet.
        </p>
      </div>
    </section>

    <section class="px-4 py-4">
      <Accordion title="Subtitle Presets" bind:open={presetOpen}>
        <div class="space-y-4">
          <div>
            <p class="text-[11px] font-medium uppercase tracking-[0.08em] text-vlc-muted">
              Built-in
            </p>
            <div class="mt-2 grid grid-cols-3 gap-1.5">
              {#each BUILTIN_SUBTITLE_PRESETS as preset (preset.id)}
                <button
                  type="button"
                  class="flex h-8 items-center justify-center rounded-[6px] border border-vlc-border/70 bg-vlc-app px-1 text-[11px] text-vlc-secondary transition-colors hover:border-vlc-orange/50 hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
                  aria-label={`Apply preset ${preset.name}`}
                  title={`Apply preset ${preset.name}`}
                  on:click={() => applyProfile(preset.profile, preset.name)}
                >
                  {preset.name}
                </button>
              {/each}
            </div>
          </div>

          <div>
            <p class="text-[11px] font-medium uppercase tracking-[0.08em] text-vlc-muted">
              Custom
            </p>

            {#if $subtitleProfiles.customPresets.length === 0}
              <p
                class="mt-2 rounded-[6px] border border-dashed border-vlc-border/70 px-2.5 py-3 text-center text-[11px] leading-4 text-vlc-muted"
              >
                No custom presets yet. Save the current look below.
              </p>
            {:else}
              <ul class="mt-2 space-y-1">
                {#each $subtitleProfiles.customPresets as preset (preset.id)}
                  <li
                    class="flex items-center gap-1 rounded-[6px] border border-vlc-border/60 bg-vlc-app/60 pl-2.5"
                  >
                    <button
                      type="button"
                      class="flex min-w-0 flex-1 items-center justify-between gap-2 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
                      aria-label={`Apply preset ${preset.name}`}
                      on:click={() => applyProfile(preset.profile, preset.name)}
                    >
                      <span class="truncate text-[12px] text-vlc-secondary">{preset.name}</span>
                      <span class="shrink-0 text-[10px] tabular-nums text-vlc-muted">
                        {preset.profile.delay > 0 ? '+' : ''}{preset.profile.delay.toFixed(3)} s
                      </span>
                    </button>
                    <button
                      type="button"
                      class="flex h-7 w-7 shrink-0 items-center justify-center rounded-[5px] text-vlc-muted transition-colors hover:bg-vlc-danger/10 hover:text-vlc-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
                      aria-label={`Delete preset ${preset.name}`}
                      title={`Delete preset ${preset.name}`}
                      on:click={() => removePreset(preset)}
                    >
                      <Trash2 size={13} strokeWidth={1.7} aria-hidden="true" />
                    </button>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>

          <form class="flex items-center gap-1.5" on:submit|preventDefault={savePreset}>
            <input
              type="text"
              bind:value={presetName}
              maxlength={40}
              placeholder="Preset name"
              aria-label="New preset name"
              class="h-8 min-w-0 flex-1 rounded-[6px] border border-vlc-border/70 bg-vlc-app px-2.5 text-[12px] text-vlc-secondary outline-none transition-colors placeholder:text-vlc-muted focus:border-vlc-orange/60 focus-visible:ring-2 focus-visible:ring-vlc-orange/40"
            />
            <button
              type="submit"
              disabled={!presetName.trim()}
              class="h-8 shrink-0 rounded-[6px] border border-vlc-border/70 bg-vlc-raised px-3 text-[11px] font-medium text-vlc-secondary transition-colors hover:border-vlc-orange/50 hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Save
            </button>
          </form>

          <p class="text-[11px] leading-4 text-vlc-muted">
            Presets include formatting and delay. Built-in presets cannot be deleted.
          </p>

          <div>
            <p class="text-[11px] font-medium uppercase tracking-[0.08em] text-vlc-muted">
              Show presets
            </p>

            {#if showPresets.length === 0}
              <p
                class="mt-2 rounded-[6px] border border-dashed border-vlc-border/70 px-2.5 py-3 text-center text-[11px] leading-4 text-vlc-muted"
              >
                No presets for this show yet. Save the current settings below.
              </p>
            {:else}
              <ul class="mt-2 space-y-1">
                {#each showPresets as preset (preset.name)}
                  <li
                    class="flex items-center gap-1 rounded-[6px] border border-vlc-border/60 bg-vlc-app/60 pl-2.5"
                  >
                    <button
                      type="button"
                      class="flex min-w-0 flex-1 items-center justify-between gap-2 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
                      aria-label={`Apply show preset ${preset.name}`}
                      on:click={() => applyShowPresetByName(preset.name)}
                    >
                      <span class="truncate text-[12px] text-vlc-secondary">{preset.name}</span>
                      <span class="shrink-0 text-[10px] tabular-nums text-vlc-muted">
                        {preset.profile.delay > 0 ? '+' : ''}{preset.profile.delay.toFixed(3)} s
                        {preset.defaultTrack || preset.defaultLanguage ? ' • ' : ''}
                        {preset.defaultTrack || ''}
                        {preset.defaultLanguage ? ` / ${preset.defaultLanguage}` : ''}
                      </span>
                    </button>
                    <button
                      type="button"
                      class="flex h-7 w-7 shrink-0 items-center justify-center rounded-[5px] text-vlc-muted transition-colors hover:bg-vlc-danger/10 hover:text-vlc-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
                      aria-label={`Delete show preset ${preset.name}`}
                      title={`Delete show preset ${preset.name}`}
                      on:click={() => deleteShowPresetByName(preset.name)}
                    >
                      <Trash2 size={13} strokeWidth={1.7} aria-hidden="true" />
                    </button>
                  </li>
                {/each}
              </ul>
            {/if}

            <form class="mt-3 flex items-center gap-1.5" on:submit|preventDefault={saveShowPresetForCurrent}>
              <input
                type="text"
                bind:value={showPresetName}
                maxlength={40}
                placeholder={`Preset name • ${showKey}`}
                aria-label="New show preset name"
                class="h-8 min-w-0 flex-1 rounded-[6px] border border-vlc-border/70 bg-vlc-app px-2.5 text-[12px] text-vlc-secondary outline-none transition-colors placeholder:text-vlc-muted focus:border-vlc-orange/60 focus-visible:ring-2 focus-visible:ring-vlc-orange/40"
              />
              <button
                type="submit"
                disabled={!$currentTrack}
                class="h-8 shrink-0 rounded-[6px] border border-vlc-border/70 bg-vlc-raised px-3 text-[11px] font-medium text-vlc-secondary transition-colors hover:border-vlc-orange/50 hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50 disabled:cursor-not-allowed disabled:opacity-45"
              >
                Save show preset
              </button>
            </form>

            <p class="mt-2 text-[11px] leading-4 text-vlc-muted">
              Show presets bundle delay, formatting, default track and language for a specific show.
              They auto-apply when you open an episode.
            </p>
          </div>
        </div>
      </Accordion>

      <div class="flex justify-center pt-5">
        <button
          type="button"
          class="inline-flex items-center gap-2 text-[13px] text-vlc-secondary transition-colors hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/40"
          on:click={() => onAdvancedSettings('Subtitles')}
        >
          <SettingsIcon size={16} strokeWidth={1.7} />
          Open Advanced Settings
        </button>
      </div>
    </section>

    <section class="px-4 py-4">
      <h3 class="text-[15px] leading-5 text-vlc-text">Show Defaults</h3>

      <div class="mt-3 space-y-2.5">
        <div class="flex items-center justify-between gap-3">
          <span class="text-[13px] text-vlc-secondary">Show</span>
          <span
            class="min-w-0 truncate text-right text-[12px] text-vlc-secondary"
            title={showKey}
          >
            {showKey}
          </span>
        </div>

        <button
          type="button"
          class="flex h-9 w-full items-center justify-center gap-2 rounded-[6px] border border-vlc-border/70 bg-vlc-app px-3 text-[12px] text-vlc-secondary transition-colors hover:border-vlc-orange/50 hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-vlc-border/70 disabled:hover:text-vlc-secondary"
          disabled={!$currentTrack}
          on:click={rememberShow}
        >
          <Bookmark size={14} strokeWidth={1.7} aria-hidden="true" />
          {savedShowDefaults ? 'Update saved defaults' : 'Remember for this show'}
        </button>

        <p class="text-[11px] leading-4 text-vlc-muted">
          {#if $currentTrack}
            Saves track, language, style and delay. Applying saved defaults is always manual.
          {:else}
            Load media to remember per-show defaults.
          {/if}
        </p>
      </div>
    </section>

    <div class="min-h-[20px] px-4 pb-4" role="status" aria-live="polite">
      {#if statusMessage}
        <p class="text-[11px] leading-4 text-vlc-muted">{statusMessage}</p>
      {/if}
    </div>
  </div>
</div>
