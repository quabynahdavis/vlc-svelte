<script lang="ts">
  import { settings } from '../../stores/settings';
  import Section from './Section.svelte';

  let fileInput: HTMLInputElement | null = null;
  let message = '';
  let messageType: 'success' | 'error' = 'success';

  function clearMessage() {
    message = '';
  }

  function showMessage(msg: string, type: 'success' | 'error' = 'success') {
    message = msg;
    messageType = type;
    clearMessage();
    setTimeout(clearMessage, 3000);
  }

  function exportSettings() {
    try {
      const data = JSON.stringify($settings, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'vlc-settings.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showMessage('Settings exported successfully');
    } catch {
      showMessage('Export failed', 'error');
    }
  }

  function triggerImport() {
    fileInput?.click();
  }

  function handleFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result as string;
        const parsed = JSON.parse(text);
        settings.set(parsed);
        showMessage('Settings imported successfully');
      } catch {
        showMessage('Invalid JSON file', 'error');
      } finally {
        if (input) input.value = '';
      }
    };
    reader.onerror = () => showMessage('Failed to read file', 'error');
    reader.readAsText(file);
  }
</script>

<div class="flex flex-col gap-9 pb-4">
  <Section title="Export / Import Settings">
    <div class="bg-vlc-card rounded-[8px] p-5 text-vlc-text">
      <p class="text-[14px] text-vlc-secondary mb-4">
        Export your settings to a JSON file or import from a previously exported file.
      </p>
      <div class="flex items-center gap-3">
        <button
          type="button"
          class="h-9 px-4 rounded-[8px] bg-vlc-raised border border-vlc-border text-[13px] text-vlc-secondary transition-colors hover:border-vlc-orange/50 hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
          aria-label="Export settings to JSON"
          on:click={exportSettings}
        >
          Export Settings
        </button>
        <button
          type="button"
          class="h-9 px-4 rounded-[8px] bg-vlc-raised border border-vlc-border text-[13px] text-vlc-secondary transition-colors hover:border-vlc-orange/50 hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/50"
          aria-label="Import settings from JSON"
          on:click={triggerImport}
        >
          Import Settings
        </button>
        <input
          bind:this={fileInput}
          type="file"
          accept="application/json"
          class="hidden"
          aria-label="Import settings file"
          on:change={handleFileChange}
        />
      </div>

      {#if message}
        <div
          class="mt-4 text-[13px] {messageType === 'success' ? 'text-vlc-text' : 'text-vlc-danger'}"
          role="status"
          aria-live="polite"
        >
          {message}
        </div>
      {/if}
    </div>
  </Section>
</div>
