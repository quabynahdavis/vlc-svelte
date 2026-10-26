<script lang="ts">
  export let title = '';
  export let customClass = '';
</script>

<section class={`min-w-0 ${customClass}`}>
  <h2 class="text-[17px] font-medium leading-6 tracking-[0.005em] text-vlc-text">
    {title}
  </h2>
  <div class="mt-4">
    <slot />
  </div>
</section>
