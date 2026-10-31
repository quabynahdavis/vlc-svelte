<script lang="ts"></script>

<div class="p-8 max-w-md mx-auto space-y-6">
  <h1 class="text-2xl font-bold text-gray-900">Settings</h1>

  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <span class="text-gray-700">Dark mode</span>
      <label class="relative inline-flex items-center cursor-pointer">
        <input type="checkbox" class="sr-only peer" />
        <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
      </label>
    </div>

    <div class="flex items-center justify-between">
      <span class="text-gray-700">Hardware acceleration</span>
      <label class="relative inline-flex items-center cursor-pointer">
        <input type="checkbox" class="sr-only peer" checked />
        <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
      </label>
    </div>

    <div>
      <label for="default-volume" class="block text-sm font-medium text-gray-700 mb-1">Default volume</label>
      <input
        id="default-volume"
        type="range"
        min="0"
        max="100"
        class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
      />
    </div>
  </div>

  <div class="border-t pt-6 mt-6">
    <h2 class="text-sm font-semibold text-gray-900 mb-4">About</h2>
    <p class="text-gray-500 text-sm">Kanea · Tauri + Svelte</p>
  </div>
</div>
