<script lang="ts">
  import { ChevronDown, Crop } from 'lucide-svelte';
  import Accordion from './Accordion.svelte';
  import DockSlider from './DockSlider.svelte';
  import TogglePill from './TogglePill.svelte';

  let hue = 0;
  let brightness = 1;
  let contrast = 1;
  let saturation = 1.15;
  let gamma = 0.25;
  let sharpenSigma = 0;
  let bandingRemoval = 7.6;
  let filmGrainVariance = 0.22;

  let cropTop = 0;
  let cropBottom = 0;
  let cropLeft = 0;
  let cropRight = 0;

  let colorExtraction = false;
  let extractionColor = '#FF0000';
  let colorThreshold = false;
  let thresholdColor = '#FF0000';
  let filterSaturation = 0.25;
  let similarity = 0.25;
  let negateColors = false;
  let posterize = false;
  let gradient = false;
  let gradientMode = 'Gradient';
  let color = false;
  let cartoon = false;
  let sepiaIntensity = 0.3;
</script>

<div class="space-y-3" data-video-effects>
  <Accordion title="Image Adjust">
    <DockSlider label="Hue" bind:value={hue} min={-180} max={180} step={1} decimals={0} />
    <DockSlider label="Brightness" bind:value={brightness} min={0} max={2} step={0.01} decimals={2} />
    <DockSlider label="Contrast" bind:value={contrast} min={0} max={2} step={0.01} decimals={2} />
    <DockSlider label="Saturation" bind:value={saturation} min={0} max={3} step={0.01} decimals={2} />
    <DockSlider label="Gamma" bind:value={gamma} min={0.1} max={3} step={0.01} decimals={2} />
    <DockSlider
      label="Sharpen Sigma"
      bind:value={sharpenSigma}
      min={0}
      max={2}
      step={0.01}
      decimals={2}
    />
    <DockSlider
      label="Banding Removal Radius"
      bind:value={bandingRemoval}
      min={0}
      max={20}
      step={0.1}
      decimals={1}
    />
    <DockSlider
      label="Film Grain Variance"
      bind:value={filmGrainVariance}
      min={0}
      max={1}
      step={0.01}
      decimals={2}
    />
  </Accordion>

  <Accordion title="Crop">
    <div class="space-y-2">
      <div class="grid grid-cols-[1fr_1fr_28px] items-center gap-2">
        <label class="flex h-[46px] min-w-0 items-center justify-between gap-2 rounded-[8px] bg-[#0A0A0A] px-3">
          <span class="text-[13px] text-vlc-dim">Top</span>
          <span class="flex min-w-0 items-baseline gap-1">
            <input
              class="crop-input w-8 min-w-0 bg-transparent text-right text-[13px] tabular-nums text-vlc-secondary outline-none"
              type="number"
              bind:value={cropTop}
              aria-label="Crop top"
            />
            <span class="text-[11px] text-vlc-muted">px</span>
          </span>
        </label>

        <label class="flex h-[46px] min-w-0 items-center justify-between gap-2 rounded-[8px] bg-[#0A0A0A] px-3">
          <span class="text-[13px] text-vlc-dim">Bottom</span>
          <span class="flex min-w-0 items-baseline gap-1">
            <input
              class="crop-input w-8 min-w-0 bg-transparent text-right text-[13px] tabular-nums text-vlc-secondary outline-none"
              type="number"
              bind:value={cropBottom}
              aria-label="Crop bottom"
            />
            <span class="text-[11px] text-vlc-muted">px</span>
          </span>
        </label>

        <button
          type="button"
          class="flex h-[46px] w-7 items-center justify-center rounded-[6px] text-vlc-dim transition-colors hover:bg-vlc-raised hover:text-vlc-text"
          title="Crop aspect ratio"
          aria-label="Crop aspect ratio"
        >
          <Crop size={18} strokeWidth={1.6} />
        </button>
      </div>

      <div class="grid grid-cols-[1fr_1fr_28px] items-center gap-2">
        <label class="flex h-[46px] min-w-0 items-center justify-between gap-2 rounded-[8px] bg-[#0A0A0A] px-3">
          <span class="text-[13px] text-vlc-dim">Left</span>
          <span class="flex min-w-0 items-baseline gap-1">
            <input
              class="crop-input w-8 min-w-0 bg-transparent text-right text-[13px] tabular-nums text-vlc-secondary outline-none"
              type="number"
              bind:value={cropLeft}
              aria-label="Crop left"
            />
            <span class="text-[11px] text-vlc-muted">px</span>
          </span>
        </label>

        <label class="flex h-[46px] min-w-0 items-center justify-between gap-2 rounded-[8px] bg-[#0A0A0A] px-3">
          <span class="text-[13px] text-vlc-dim">Right</span>
          <span class="flex min-w-0 items-baseline gap-1">
            <input
              class="crop-input w-8 min-w-0 bg-transparent text-right text-[13px] tabular-nums text-vlc-secondary outline-none"
              type="number"
              bind:value={cropRight}
              aria-label="Crop right"
            />
            <span class="text-[11px] text-vlc-muted">px</span>
          </span>
        </label>

        <button
          type="button"
          class="flex h-[46px] w-7 items-center justify-center rounded-[6px] text-vlc-dim transition-colors hover:bg-vlc-raised hover:text-vlc-text"
          title="Crop aspect ratio"
          aria-label="Crop aspect ratio"
        >
          <Crop size={18} strokeWidth={1.6} />
        </button>
      </div>
    </div>
  </Accordion>

  <Accordion title="Color Filters">
    <div class="space-y-4">
      <div class="flex items-center justify-between gap-2">
        <span class="min-w-0 flex-1 truncate text-[13px] text-vlc-dim">Color Extraction</span>
        <div class="flex shrink-0 items-center gap-2">
          <label class="relative flex h-8 w-[92px] items-center gap-1 rounded-[6px] bg-[#0A0A0A] px-2">
            <span class="min-w-0 flex-1 truncate text-[11px] uppercase text-vlc-secondary">
              {extractionColor}
            </span>
            <span
              class="h-5 w-5 shrink-0 rounded-[3px]"
              style={`background: ${extractionColor}`}
              aria-hidden="true"
            ></span>
            <input
              type="color"
              bind:value={extractionColor}
              class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              aria-label="Color extraction color"
            />
          </label>
          <TogglePill bind:value={colorExtraction} ariaLabel="Color extraction" />
        </div>
      </div>

      <div class="flex items-center justify-between gap-2">
        <span class="min-w-0 flex-1 truncate text-[13px] text-vlc-dim">Color Threshold</span>
        <div class="flex shrink-0 items-center gap-2">
          <label class="relative flex h-8 w-[92px] items-center gap-1 rounded-[6px] bg-[#0A0A0A] px-2">
            <span class="min-w-0 flex-1 truncate text-[11px] uppercase text-vlc-secondary">
              {thresholdColor}
            </span>
            <span
              class="h-5 w-5 shrink-0 rounded-[3px]"
              style={`background: ${thresholdColor}`}
              aria-hidden="true"
            ></span>
            <input
              type="color"
              bind:value={thresholdColor}
              class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              aria-label="Color threshold color"
            />
          </label>
          <TogglePill bind:value={colorThreshold} ariaLabel="Color threshold" />
        </div>
      </div>

      <div class="space-y-5 border-t border-vlc-border pt-4">
        <DockSlider
          label="Saturation"
          bind:value={filterSaturation}
          min={0}
          max={1}
          step={0.01}
          decimals={2}
        />
        <DockSlider label="Similarity" bind:value={similarity} min={0} max={1} step={0.01} decimals={2} />
      </div>

      <div class="space-y-4 border-t border-vlc-border pt-4">
        <div class="flex items-center justify-between gap-3">
          <span class="text-[13px] text-vlc-dim">Negate Colors</span>
          <TogglePill bind:value={negateColors} ariaLabel="Negate colors" />
        </div>
        <div class="flex items-center justify-between gap-3">
          <span class="text-[13px] text-vlc-dim">Posterize</span>
          <TogglePill bind:value={posterize} ariaLabel="Posterize" />
        </div>
        <div class="flex items-center justify-between gap-3">
          <span class="text-[13px] text-vlc-dim">Gradient</span>
          <TogglePill bind:value={gradient} ariaLabel="Gradient" />
        </div>
        <div class="relative">
          <select
            bind:value={gradientMode}
            aria-label="Gradient type"
            class="h-9 w-full appearance-none rounded-[6px] border border-vlc-border bg-transparent px-3 pr-9 text-[12px] text-vlc-secondary outline-none focus:border-vlc-orange/60"
          >
            <option>Gradient</option>
            <option>Linear</option>
            <option>Radial</option>
          </select>
          <ChevronDown
            size={16}
            strokeWidth={1.7}
            class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-vlc-dim"
            aria-hidden="true"
          />
        </div>
        <div class="flex items-center justify-between gap-3">
          <span class="text-[13px] text-vlc-dim">Color</span>
          <TogglePill bind:value={color} ariaLabel="Color" />
        </div>
        <div class="flex items-center justify-between gap-3">
          <span class="text-[13px] text-vlc-dim">Cartoon</span>
          <TogglePill bind:value={cartoon} ariaLabel="Cartoon" />
        </div>
      </div>

      <div class="border-t border-vlc-border pt-4">
        <DockSlider
          label="Sepia Intensity"
          bind:value={sepiaIntensity}
          min={0}
          max={1}
          step={0.01}
          decimals={2}
        />
      </div>
    </div>
  </Accordion>
</div>

<style>
  .crop-input::-webkit-inner-spin-button,
  .crop-input::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .crop-input {
    -moz-appearance: textfield;
    appearance: textfield;
  }
</style>
