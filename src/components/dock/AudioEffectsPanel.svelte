<script lang="ts">
  import Accordion from './Accordion.svelte';
  import DockSlider from './DockSlider.svelte';
  import TogglePill from './TogglePill.svelte';

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
