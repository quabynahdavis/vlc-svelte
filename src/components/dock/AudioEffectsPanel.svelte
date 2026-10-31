<script lang="ts">
  import { ChevronDown } from 'lucide-svelte';
  import { currentTrack } from '../../stores/player';
  import {
    AUDIO_TRACK_OPTIONS,
    OUTPUT_DEVICE_OPTIONS,
    avPrefs,
    setAudioTrack,
    setOutputDevice,
    type AudioTrackId,
    type OutputDeviceId,
  } from '../../stores/avPrefs';
  import Accordion from './Accordion.svelte';
  import DockSlider from './DockSlider.svelte';
  import TogglePill from './TogglePill.svelte';

  $: hasMedia = $currentTrack !== null;

  function handleAudioTrackChange(event: Event): void {
    setAudioTrack((event.currentTarget as HTMLSelectElement).value as AudioTrackId);
  }

  function handleOutputDeviceChange(event: Event): void {
    setOutputDevice((event.currentTarget as HTMLSelectElement).value as OutputDeviceId);
  }

  let peak = 0.2;
  let attack = 25;
  let release = 100;
  let threshold = -11;
  let ratio = 4;
  let kneeRadius = 5;
  let makeupGain = 7;

  let delayTime = 20;
  let feedbackGain = 0.2;
  let crossfeed = 0.3;
  let dryMix = 0.8;
  let twoPass = false;
  let spatialAudio = false;
  let stereoWidening = false;

  let reverbSize = 8;
  let reverbWidth = 10;
  let reverbWet = 4;
  let reverbDry = 5;
  let reverbDamp = 5;
</script>

<div class="space-y-3" data-audio-effects>
  <section class="rounded-[12px] border border-vlc-border bg-vlc-card p-4" data-audio-output>
    <h3 class="text-[13px] font-medium leading-5 text-vlc-secondary">Audio Output</h3>

    <div class="mt-3 space-y-4">
      <div>
        <label
          for="audio-track-select"
          class="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-vlc-muted"
        >
          Audio Track
        </label>
        <div class="relative">
          <select
            id="audio-track-select"
            value={$avPrefs.audioTrack}
            disabled={!hasMedia}
            aria-describedby={!hasMedia ? 'audio-track-empty-note' : undefined}
            class="h-[38px] w-full appearance-none rounded-[6px] border border-vlc-border/70 bg-vlc-app pl-3 pr-8 text-[13px] text-vlc-secondary outline-none transition-colors focus:border-vlc-orange/60 focus-visible:ring-2 focus-visible:ring-vlc-orange/40 disabled:cursor-not-allowed disabled:opacity-50"
            on:change={handleAudioTrackChange}
          >
            {#each AUDIO_TRACK_OPTIONS as track (track.id)}
              <option value={track.id}>{track.label}</option>
            {/each}
          </select>
          <ChevronDown
            size={14}
            strokeWidth={1.7}
            class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-vlc-dim"
            aria-hidden="true"
          />
        </div>
        {#if !hasMedia}
          <p id="audio-track-empty-note" class="mt-1.5 text-[11px] leading-4 text-vlc-muted">
            No audio tracks — load media to choose a track.
          </p>
        {/if}
      </div>

      <div>
        <label
          for="output-device-select"
          class="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-vlc-muted"
        >
          Output Device
        </label>
        <div class="relative">
          <select
            id="output-device-select"
            value={$avPrefs.outputDevice}
            class="h-[38px] w-full appearance-none rounded-[6px] border border-vlc-border/70 bg-vlc-app pl-3 pr-8 text-[13px] text-vlc-secondary outline-none transition-colors focus:border-vlc-orange/60 focus-visible:ring-2 focus-visible:ring-vlc-orange/40"
            on:change={handleOutputDeviceChange}
          >
            {#each OUTPUT_DEVICE_OPTIONS as device (device.id)}
              <option value={device.id}>{device.label}</option>
            {/each}
          </select>
          <ChevronDown
            size={14}
            strokeWidth={1.7}
            class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-vlc-dim"
            aria-hidden="true"
          />
        </div>
        <p class="mt-1.5 text-[11px] leading-4 text-vlc-muted">Saved for this device.</p>
      </div>
    </div>
  </section>

  <Accordion title="Compressor">
    <DockSlider label="FM5 / Peak" bind:value={peak} min={0} max={1.5} step={0.1} decimals={1} />
    <DockSlider label="Attack" bind:value={attack} min={0} max={200} step={0.5} suffix="ms" decimals={1} />
    <DockSlider label="Release" bind:value={release} min={0} max={700} step={0.5} suffix="ms" decimals={1} />
    <DockSlider
      label="Threshold"
      bind:value={threshold}
      min={-30}
      max={0}
      step={0.5}
      suffix="dB"
      decimals={1}
    />
    <DockSlider label="Ratio" bind:value={ratio} min={1} max={12} step={0.5} suffix=": 1" decimals={1} />
    <DockSlider
      label="Knee Radius"
      bind:value={kneeRadius}
      min={0}
      max={12}
      step={0.5}
      suffix="dB"
      decimals={1}
    />
    <DockSlider
      label="Makeup Gain"
      bind:value={makeupGain}
      min={0}
      max={24}
      step={0.5}
      suffix="dB"
      decimals={1}
    />
  </Accordion>

  <Accordion title="Spatial Audio">
    <DockSlider
      label="Delay Time"
      bind:value={delayTime}
      min={0}
      max={100}
      step={0.5}
      suffix="ms"
      decimals={1}
    />
    <DockSlider
      label="Feedback Gain"
      bind:value={feedbackGain}
      min={0}
      max={1}
      step={0.1}
      suffix="%"
      decimals={1}
    />
    <DockSlider
      label="Crossfeed"
      bind:value={crossfeed}
      min={0}
      max={1}
      step={0.1}
      suffix="%"
      decimals={1}
    />
    <DockSlider
      label="Dry Mix"
      bind:value={dryMix}
      min={0}
      max={1}
      step={0.1}
      suffix="%"
      decimals={1}
    />

    <div class="space-y-4 pt-1">
      <div class="flex items-center justify-between gap-3">
        <span class="text-[13px] text-vlc-dim">Two-pass</span>
        <TogglePill bind:value={twoPass} ariaLabel="Two-pass" />
      </div>
      <div class="flex items-center justify-between gap-3">
        <span class="text-[13px] text-vlc-dim">Spatial audio</span>
        <TogglePill bind:value={spatialAudio} ariaLabel="Spatial audio" />
      </div>
      <div class="flex items-center justify-between gap-3">
        <span class="text-[13px] text-vlc-dim">Stereo widening</span>
        <TogglePill bind:value={stereoWidening} ariaLabel="Stereo widening" />
      </div>
    </div>
  </Accordion>

  <Accordion title="Reverb">
    <DockSlider label="Size" bind:value={reverbSize} min={0} max={12} step={0.1} decimals={1} />
    <DockSlider label="Width" bind:value={reverbWidth} min={0} max={10} step={0.1} decimals={1} />
    <DockSlider label="Wet" bind:value={reverbWet} min={0} max={10} step={0.1} decimals={1} />
    <DockSlider label="Dry" bind:value={reverbDry} min={0} max={10} step={0.1} decimals={1} />
    <DockSlider label="Damp" bind:value={reverbDamp} min={0} max={10} step={0.1} decimals={1} />
  </Accordion>
</div>
