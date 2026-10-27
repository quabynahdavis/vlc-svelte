<script context="module" lang="ts">
  export type SliderRow = {
    type: 'slider';
    label: string;
    value: number;
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
    decimals?: number;
    format?: (value: number) => string;
  };

  export type ToggleRow = {
    type: 'toggle';
    label: string;
    value: boolean;
  };

  export type ColorRow = {
    type: 'color';
    label: string;
    value: string;
    enabled: boolean;
  };

  export type PropertyRow = SliderRow | ToggleRow | ColorRow;

  export type PropertySection = {
    id: string;
    rows: PropertyRow[];
  };

  /** Audio compressor settings shown by default. */
  export const compressorPreset: PropertySection[] = [
    {
      id: 'compressor',
      rows: [
        {
          type: 'slider',
          label: 'FM5 / Peak',
          value: 0.2,
          min: 0,
          max: 1,
          step: 0.1,
          format: (value) => value.toFixed(1),
        },
        {
          type: 'slider',
          label: 'Attack',
          value: 25,
          min: 0,
          max: 400,
          step: 1,
          format: (value) => `${value.toFixed(1)} ms`,
        },
        {
          type: 'slider',
          label: 'Release',
          value: 100,
          min: 0,
          max: 600,
          step: 1,
          format: (value) => `${value.toFixed(1)} ms`,
        },
        {
          type: 'slider',
          label: 'Threshold',
          value: -11,
          min: -30,
          max: 0,
          step: 0.5,
          format: (value) => `${value.toFixed(1)} dB`,
        },
        {
          type: 'slider',
          label: 'Ratio',
          value: 4,
          min: 1,
          max: 13,
          step: 0.1,
          format: (value) => `${value.toFixed(1)} : 1`,
        },
        {
          type: 'slider',
          label: 'Knee Radius',
          value: 5,
          min: 0,
          max: 10,
          step: 0.1,
          format: (value) => `${value.toFixed(1)} dB`,
        },
        {
          type: 'slider',
          label: 'Makeup Gain',
          value: 7,
          min: 0,
          max: 24,
          step: 0.1,
          format: (value) => `${value.toFixed(1)} dB`,
        },
      ],
    },
  ];

  /** Video filter settings matching the effects reference sheet. */
  export const videoPreset: PropertySection[] = [
    {
      id: 'color-extraction',
      rows: [
        { type: 'color', label: 'Color Extraction', value: '#FF0000', enabled: false },
        { type: 'color', label: 'Color Threshold', value: '#FF0000', enabled: false },
      ],
    },
    {
      id: 'color-similarity',
      rows: [
        {
          type: 'slider',
          label: 'Saturation',
          value: 22,
          min: 0,
          max: 100,
          step: 1,
          format: (value) => `${Math.round(value)} %`,
        },
        {
          type: 'slider',
          label: 'Similarity',
          value: 25,
          min: 0,
          max: 100,
          step: 1,
          format: (value) => `${Math.round(value)} %`,
        },
      ],
    },
    {
      id: 'color-effects',
      rows: [
        { type: 'toggle', label: 'Negate Colors', value: false },
        { type: 'toggle', label: 'Posterize', value: false },
        { type: 'toggle', label: 'Gradient', value: false },
        { type: 'toggle', label: 'Color', value: false },
        { type: 'toggle', label: 'Cartoon', value: false },
      ],
    },
    {
      id: 'sepia',
      rows: [
        {
          type: 'slider',
          label: 'Sepia Intensity',
          value: 35,
          min: 0,
          max: 100,
          step: 1,
          format: (value) => `${Math.round(value)} %`,
        },
      ],
    },
  ];
</script>

<script lang="ts">
  import { ChevronDown } from 'lucide-svelte';
  import PropertySlider from './PropertySlider.svelte';

  export let title = 'Collapse Settings';
  export let sections: PropertySection[] = compressorPreset;
  export let open = true;

  function cloneSections(source: PropertySection[]): PropertySection[] {
    return source.map((section) => ({
      id: section.id,
      rows: section.rows.map((row) => ({ ...row })),
    }));
  }

  let localSections: PropertySection[] = cloneSections(sections);

  $: localSections = cloneSections(sections);

  function toggleOpen(): void {
    open = !open;
  }

  function updateHex(row: ColorRow, event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    row.value = input.value;
  }
</script>

<section
  class="w-full overflow-hidden rounded-panel border border-vlc-border bg-vlc-card"
  aria-label={title}
  data-property-panel
>
  <button
    type="button"
    class="flex h-[52px] w-full items-center justify-between gap-4 border-b border-vlc-border px-5 text-left transition-colors hover:bg-vlc-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-vlc-orange"
    aria-expanded={open}
    on:click={toggleOpen}
  >
    <span class="min-w-0 truncate text-[15px] font-normal leading-6 text-vlc-dim">
      {title}
    </span>

    <ChevronDown
      size={20}
      strokeWidth={1.8}
      class="shrink-0 text-vlc-dim transition-transform duration-200"
      class:-rotate-90={!open}
      aria-hidden="true"
    />
  </button>

  {#if open}
    <div class="space-y-5 p-5">
      {#each localSections as section, sectionIndex (section.id)}
        {#if sectionIndex > 0}
          <div class="h-px w-full bg-vlc-border" aria-hidden="true"></div>
        {/if}

        <div class="space-y-5">
          {#each section.rows as row (row.label)}
            {#if row.type === 'slider'}
              <PropertySlider
                label={row.label}
                bind:value={row.value}
                min={row.min ?? 0}
                max={row.max ?? 100}
                step={row.step ?? 1}
                unit={row.unit ?? ''}
                decimals={row.decimals ?? 1}
                format={row.format ?? null}
              />
            {:else if row.type === 'toggle'}
              <div class="flex min-h-10 items-center justify-between gap-3" data-property-row>
                <span class="min-w-0 truncate text-[14px] leading-5 text-vlc-dim">
                  {row.label}
                </span>

                <button
                  type="button"
                  role="switch"
                  aria-checked={row.value}
                  aria-label={row.label}
                  class="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-vlc-border bg-vlc-panel p-1 pr-2.5 transition-colors hover:border-vlc-borderStrong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vlc-orange"
                  on:click={() => (row.value = !row.value)}
                >
                  <span
                    class="h-7 w-7 rounded-md transition-colors"
                    class:bg-vlc-orange={row.value}
                    class:bg-vlc-borderStrong={!row.value}
                    aria-hidden="true"
                  ></span>
                  <span
                    class="w-[22px] text-center text-[12px] leading-4"
                    class:text-vlc-text={row.value}
                    class:text-vlc-dim={!row.value}
                  >
                    {row.value ? 'ON' : 'OFF'}
                  </span>
                </button>
              </div>
            {:else if row.type === 'color'}
              <div class="flex min-h-10 items-center justify-between gap-3" data-property-row>
                <span class="min-w-0 flex-1 truncate text-[14px] leading-5 text-vlc-dim">
                  {row.label}
                </span>

                <div class="flex shrink-0 items-center gap-2">
                  <div
                    class="flex h-9 w-[102px] items-center gap-1 rounded-[6px] border border-vlc-border bg-vlc-app pl-2.5 pr-1 focus-within:border-vlc-orange"
                  >
                    <input
                      type="text"
                      class="min-w-0 flex-1 bg-transparent text-[12px] leading-4 text-vlc-secondary outline-none"
                      value={row.value}
                      maxlength="7"
                      spellcheck="false"
                      aria-label={`${row.label} hex color`}
                      on:input={(event) => updateHex(row, event)}
                    />
                    <input
                      type="color"
                      class="color-swatch h-6 w-7 shrink-0 cursor-pointer rounded-[4px]"
                      bind:value={row.value}
                      aria-label={`${row.label} color`}
                    />
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={row.enabled}
                    aria-label={`${row.label} enabled`}
                    class="flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-vlc-border bg-vlc-panel p-1 pr-2.5 transition-colors hover:border-vlc-borderStrong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vlc-orange"
                    on:click={() => (row.enabled = !row.enabled)}
                  >
                    <span
                      class="h-7 w-7 rounded-md transition-colors"
                      class:bg-vlc-orange={row.enabled}
                      class:bg-vlc-borderStrong={!row.enabled}
                      aria-hidden="true"
                    ></span>
                    <span
                      class="w-[22px] text-center text-[12px] leading-4"
                      class:text-vlc-text={row.enabled}
                      class:text-vlc-dim={!row.enabled}
                    >
                      {row.enabled ? 'ON' : 'OFF'}
                    </span>
                  </button>
                </div>
              </div>
            {/if}
          {/each}
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .color-swatch {
    -webkit-appearance: none;
    appearance: none;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: transparent;
    padding: 0;
  }

  .color-swatch::-webkit-color-swatch-wrapper {
    padding: 0;
  }

  .color-swatch::-webkit-color-swatch {
    border: 0;
    border-radius: 3px;
  }

  .color-swatch::-moz-color-swatch {
    border: 0;
    border-radius: 3px;
  }
</style>
