<script lang="ts">
  import { Info } from 'lucide-svelte';

  /** Short, plain-language explanation shown on hover and keyboard focus. */
  export let text = '';
  /** Accessible name for the trigger; defaults to a generic label. */
  export let label = 'More information';

  let hovered = false;
  let focused = false;
  let dismissed = false;
  let trigger: HTMLButtonElement | null = null;

  const tooltipId = `info-tip-${Math.random().toString(36).slice(2, 9)}`;

  $: visible = Boolean(text) && !dismissed && (hovered || focused);

  function handleEnter(): void {
    hovered = true;
    dismissed = false;
  }

  function handleLeave(): void {
    hovered = false;
  }

  function handleFocus(): void {
    focused = true;
    dismissed = false;
  }

  function handleBlur(): void {
    focused = false;
    dismissed = false;
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && visible) {
      event.stopPropagation();
      dismissed = true;
      trigger?.focus();
    }
  }
</script>

<span class="relative inline-flex shrink-0 items-center">
  <button
    bind:this={trigger}
    type="button"
    class="inline-flex h-5 w-5 items-center justify-center rounded-full text-vlc-dim transition-colors hover:bg-vlc-raised hover:text-vlc-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60"
    aria-label={label}
    aria-describedby={visible ? tooltipId : undefined}
    on:mouseenter={handleEnter}
    on:mouseleave={handleLeave}
    on:focus={handleFocus}
    on:blur={handleBlur}
    on:keydown={handleKeydown}
  >
    <Info size={14} strokeWidth={1.8} aria-hidden="true" />
  </button>

  {#if visible}
    <span
      id={tooltipId}
      role="tooltip"
      class="pointer-events-none absolute left-0 top-[calc(100%_+_6px)] z-30 w-60 max-w-[min(18rem,calc(100vw_-_2rem))] whitespace-normal rounded-[8px] border border-vlc-borderStrong bg-vlc-panel px-3 py-2 text-left text-[12px] font-normal leading-5 text-vlc-secondary shadow-[0_12px_32px_var(--shadow-color)]"
    >
      {text}
    </span>
  {/if}
</span>
