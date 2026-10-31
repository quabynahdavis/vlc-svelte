<script lang="ts">
  import { importSettingsFromJson, settings } from '../../stores/settings';
  import Section from './Section.svelte';

  let fileInput: HTMLInputElement | null = null;
  let message = '';
  let messageType: 'success' | 'error' = 'success';
  let messageTimer: ReturnType<typeof setTimeout> | null = null;

  function showMessage(msg: string, type: 'success' | 'error' = 'success'): void {
    message = msg;
    messageType = type;
    if (messageTimer !== null) clearTimeout(messageTimer);
    messageTimer = setTimeout(() => {
      message = '';
      messageTimer = null;
    }, 5000);
  }

  function exportSettings(): void {
    try {
      const data = JSON.stringify($settings, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'kanea-settings.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showMessage('Settings exported successfully.', 'success');
    } catch {
      showMessage('Export failed: the browser blocked the download.', 'error');
    }
  }

  function triggerImport(): void {
    fileInput?.click();
  }

  function handleFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (file.size === 0) {
      showMessage('Import failed: the selected file is empty.', 'error');
      input.value = '';
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const text = typeof reader.result === 'string' ? reader.result : '';
        importSettingsFromJson(text);
        showMessage('Settings imported successfully.', 'success');
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'Unknown error';
        showMessage(`Import failed: ${detail}`, 'error');
      } finally {
        input.value = '';
      }
    };

    reader.onerror = () => {
      showMessage('Import failed: the file could not be read.', 'error');
      input.value = '';
    };

    reader.onabort = () => {
      showMessage('Import cancelled.', 'error');
      input.value = '';
    };

    reader.readAsText(file);
  }
</script>

<div class="flex flex-col gap-9 pb-4">
  <Section title="Export / Import Settings">
    <div class="bg-vlc-card rounded-[8px] p-5 text-vlc-text">
      <p class="text-[14px] text-vlc-secondary mb-4">
        Export your settings to a JSON file or import from a previously exported file.
        Imported files are validated and merged with the current defaults.
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
          accept="application/json,.json"
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
