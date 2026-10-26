<script lang="ts">
  import { Play, Pause, Volume2, VolumeX, Maximize, X } from 'lucide-svelte';

  let isPlaying = false;
  let volume = 80;
  let isMuted = false;
  let currentTime = 0;
  let duration = 0;

  const videoEl = document.querySelector('video');

  function togglePlay() {
    isPlaying = !isPlaying;
  }

  function toggleMute() {
    isMuted = !isMuted;
  }
</script>

<div class="flex-1 bg-black flex flex-col relative">
  <video
    class="w-full h-full object-cover bg-gray-900"
    controls
    autoplay
    muted
    src="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
  ></video>

  <div class="absolute inset-0 flex items-center justify-center z-10">
    {#if !isPlaying}
      <button
        class="w-16 h-16 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center hover:bg-black/80 transition"
        on:click={togglePlay}
      >
        <Play size={32} strokeWidth={3} color="white" />
      </button>
    {/if}
  </div>

  <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4">
    <div class="flex items-center gap-4">
      <button
        class="w-8 h-8 flex items-center justify-center text-white hover:text-gray-300 transition"
        on:click={togglePlay}
      >
        {#if isPlaying}
          <Pause size={20} strokeWidth={3} color="white" />
        {:else}
          <Play size={20} strokeWidth={3} color="white" />
        {/if}
      </button>
      <button
        class="w-8 h-8 flex items-center justify-center text-white hover:text-gray-300 transition"
        on:click={() => {}}
      >
        <Maximize size={20} strokeWidth={3} color="white" />
      </button>

      <div class="flex-1 h-1 bg-gray-600 rounded-full relative group cursor-pointer">
        <div class="absolute top-1/2 left-0 h-2 bg-white rounded-full -mt-1 w-[30%]"></div>
      </div>

      <div class="flex items-center gap-2 text-white text-sm font-mono">
        <span>{Math.floor(currentTime / 60)}:{String(Math.floor(currentTime % 60)).padStart(2, '0')}</span>
        <span class="text-gray-400">/</span>
        <span>{Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, '0')}</span>
      </div>

      <button
        class="w-8 h-8 flex items-center justify-center text-white hover:text-gray-300 transition"
        on:click={toggleMute}
      >
        {#if isMuted}
          <VolumeX size={20} strokeWidth={2} color="white" />
        {:else}
          <Volume2 size={20} strokeWidth={2} color="white" />
        {/if}
      </button>

      <div class="h-3 w-24 bg-gray-600 rounded-full relative cursor-pointer">
        <div class="absolute top-1/2 left-0 h-1.5 bg-white rounded-full -mt-[4px] w-[80%]"></div>
      </div>

      <button class="w-8 h-8 flex items-center justify-center text-white hover:text-gray-300 transition">
        <Maximize size={20} strokeWidth={2} color="white" />
      </button>
    </div>
  </div>
</div>
