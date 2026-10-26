<script lang="ts">
  import { ChevronDown } from 'lucide-svelte';
  import { player, type RepeatMode } from '../../stores/player';
  import DockSlider from './DockSlider.svelte';
  import TogglePill from './TogglePill.svelte';

  const repeatModes: { id: RepeatMode; label: string }[] = [
    { id: 'off', label: 'Off' },
    { id: 'all', label: 'All' },
    { id: 'one', label: 'One' },
  ];

  const aspectRatios = ['Auto', '16:9', '4:3', '1:1', '21:9'];

  let speed = 1;
  let aspectRatio = 'Auto';
  let deinterlace = false;
  let yadifDeinterlace = false;

  function setRepeat(mode: RepeatMode): void {
    player.update((state) => ({ ...state, repeat: mode }));
  }

  function setShuffle(value: boolean): void {
    player.update((state) => ({ ...state, shuffle: value }));
  }
</script>

<div class="space-y-3 p-3" data-playback-panel>
  <section class="rounded-[12px] border border-vlc-border bg-vlc-card p-4">
    <h3 class="text-[13px] font-medium leading-5 text-vlc-secondary">Playback</h3>

    <div class="mt-2">
      <DockSlider
        label="Playback Speed"
        bind:value={speed}
        min={0.25}
        max={4}
        step={0.05}
        suffix="x"
        decimals={2}
      />
    </div>

    <div class="space-y-2">
      <div class="flex items-center justify-between gap-3">
        <span class="text-[13px] text-vlc-dim">Repeat</span>
        <span class="text-[11px] capitalize text-vlc-muted">{$player.repeat}</span>
      </div>
      <div class="grid grid-cols-3 gap-1 rounded-[8px] bg-[#0A0A0A] p-1" role="group" aria-label="Repeat mode">
        {#each repeatModes as mode (mode.id)}
          {@const active = $player.repeat === mode.id}
          <button
            type="button"
            class="flex h-8 items-center justify-center rounded-[6px] text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/40"
            class:bg-vlc-orangeDeep={active}
            class:text-vlc-orange={active}
            class:text-vlc-dim={!active}
            class:hover:text-vlc-text={!active}
            aria-pressed={active}
            on:click={() => setRepeat(mode.id)}
          >
            {mode.label}
          </button>
        {/each}
      </div>
    </div>

    <div class="mt-5 flex items-center justify-between gap-3">
      <span class="text-[13px] text-vlc-dim">Shuffle</span>
      <TogglePill
        value={$player.shuffle}
        ariaLabel="Shuffle"
        on:change={(event) => setShuffle(event.detail)}
      />
    </div>
  </section>

  <section class="rounded-[12px] border border-vlc-border bg-vlc-card p-4">
    <h3 class="text-[13px] font-medium leading-5 text-vlc-secondary">Video Output</h3>

    <div class="mt-4 flex items-center justify-between gap-3">
      <span class="min-w-0 truncate text-[13px] text-vlc-dim">Aspect Ratio</span>
      <div class="relative w-[148px] shrink-0">
        <select
          bind:value={aspectRatio}
          aria-label="Aspect ratio"
          class="h-[38px] w-full appearance-none rounded-[6px] border border-vlc-border/70 bg-[#0A0A0A] pl-3 pr-8 text-[13px] text-vlc-secondary outline-none transition-colors focus:border-vlc-orange/60"
        >
          {#each aspectRatios as ratio (ratio)}
            <option>{ratio}</option>
          {/each}
        </select>
        <ChevronDown
          size={14}
          strokeWidth={1.7}
          class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-vlc-dim"
          aria-hidden="true"
        />
      </div>
    </div>

    <div class="mt-4 space-y-4">
      <div class="flex items-center justify-between gap-3">
        <span class="text-[13px] text-vlc-dim">Deinterlace</span>
        <TogglePill bind:value={deinterlace} ariaLabel="Deinterlace" />
      </div>
      <div class="flex items-center justify-between gap-3">
        <span class="text-[13px] text-vlc-dim">Yadif (2x)</span>
        <TogglePill bind:value={yadifDeinterlace} ariaLabel="Yadif deinterlace" />
      </div>
    </div>
  </section>
</div>
