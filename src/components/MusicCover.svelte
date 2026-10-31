<script lang="ts">
  type CoverSize = 'sm' | 'md' | 'lg' | 'xl' | 'fill';

  export let emoji = '💿';
  export let size: CoverSize = 'md';
  export let className = '';

  const sizeClasses: Record<CoverSize, string> = {
    sm: 'h-9 w-9 text-base',
    md: 'h-12 w-12 text-2xl',
    lg: 'h-24 w-24 text-4xl',
    xl: 'h-36 w-36 text-6xl sm:h-40 sm:w-40',
    fill: 'h-full w-full text-5xl',
  };

  const radiusClasses: Record<CoverSize, string> = {
    sm: 'rounded-md',
    md: 'rounded-control',
    lg: 'rounded-panel',
    xl: 'rounded-panel',
    fill: 'rounded-lg',
  };
</script>

<div
  class="relative flex shrink-0 items-center justify-center overflow-hidden border border-vlc-border bg-gradient-to-br from-vlc-raised via-vlc-card to-vlc-panel {sizeClasses[size]} {radiusClasses[size]} {className}"
  aria-hidden="true"
>
  <span class="absolute inset-0 bg-vlc-accent opacity-[0.10]"></span>
  <span class="absolute -right-5 -top-5 h-16 w-16 rounded-full bg-vlc-orange/10 blur-xl"></span>
  <span class="relative select-none leading-none drop-shadow-sm">{emoji}</span>
</div>
