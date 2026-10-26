<script lang="ts">
  import { Minus, MoreHorizontal, Square, X } from 'lucide-svelte';

  export let onSettings: () => void = () => {};

  type WindowAction = 'minimize' | 'maximize' | 'close';

  async function windowAction(action: WindowAction) {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const appWindow = getCurrentWindow();

      if (action === 'minimize') await appWindow.minimize();
      if (action === 'maximize') await appWindow.toggleMaximize();
      if (action === 'close') await appWindow.close();
    } catch (error) {
      // Window controls are only available inside the Tauri shell.
      console.warn('Window controls are unavailable in this environment.', error);
    }
  }
</script>

<header
  class="relative flex h-10 shrink-0 select-none items-center justify-between bg-vlc-app"
  data-tauri-drag-region
>
  <div class="flex h-full items-center gap-0.5 px-2" data-tauri-drag-region>
    <div class="flex h-8 w-8 items-center justify-center" data-tauri-drag-region>
      <svg
        class="h-[18px] w-[18px]"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        data-tauri-drag-region
      >
        <defs>
          <linearGradient
            id="vlc-title-cone-gradient"
            x1="12"
            y1="2"
            x2="12"
            y2="22"
            gradientUnits="userSpaceOnUse"
          >
            <stop stop-color="#D37918" />
            <stop offset="1" stop-color="#AB6314" />
          </linearGradient>
        </defs>
        <path d="M12 2.4 17.1 18.2H6.9L12 2.4Z" fill="url(#vlc-title-cone-gradient)" />
        <path
          d="M9.55 9.9h4.9l.62 2.5H8.93l.62-2.5Z"
          fill="#0E0E0E"
          fill-opacity=".22"
        />
        <rect
          x="4.4"
          y="18.2"
          width="15.2"
          height="3.4"
          rx="1.4"
          fill="url(#vlc-title-cone-gradient)"
        />
      </svg>
    </div>

    <button
      type="button"
      class="flex h-7 w-8 items-center justify-center rounded-input text-vlc-dim transition-colors hover:bg-vlc-card hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
      title="Menu"
      aria-label="Open menu"
      on:click={onSettings}
    >
      <MoreHorizontal size={16} strokeWidth={2} aria-hidden="true" />
    </button>
  </div>

  <span
    class="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[12px] font-normal tracking-[0.01em] text-vlc-secondary"
    data-tauri-drag-region
  >
    VLC Media Player
  </span>

  <div class="flex h-full items-center">
    <button
      type="button"
      class="flex h-10 w-[46px] items-center justify-center text-vlc-secondary transition-colors hover:bg-vlc-card hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
      title="Minimize"
      aria-label="Minimize window"
      on:click={() => windowAction('minimize')}
    >
      <Minus size={14} strokeWidth={1.75} aria-hidden="true" />
    </button>
    <button
      type="button"
      class="flex h-10 w-[46px] items-center justify-center text-vlc-secondary transition-colors hover:bg-vlc-card hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
      title="Maximize"
      aria-label="Maximize window"
      on:click={() => windowAction('maximize')}
    >
      <Square size={12} strokeWidth={1.75} aria-hidden="true" />
    </button>
    <button
      type="button"
      class="flex h-10 w-[46px] items-center justify-center text-vlc-secondary transition-colors hover:bg-vlc-danger hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
      title="Close"
      aria-label="Close window"
      on:click={() => windowAction('close')}
    >
      <X size={15} strokeWidth={1.75} aria-hidden="true" />
    </button>
  </div>
</header>
