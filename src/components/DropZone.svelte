<script lang="ts">
  export let accept: string[] = ['*'];
  export let multiple = true;
  export let onDrop: (files: File[]) => void = () => {};

  let dragDepth = 0;
  $: dragging = dragDepth > 0;

  function isAccepted(file: File): boolean {
    if (accept.length === 0 || accept.includes('*')) return true;

    const name = file.name.toLowerCase();
    return accept.some((extension) => {
      const normalized = extension.trim().toLowerCase();
      if (!normalized || normalized === '*') return true;
      return normalized.startsWith('.')
        ? name.endsWith(normalized)
        : name.endsWith(`.${normalized}`);
    });
  }

  function handleDragEnter(event: DragEvent): void {
    event.preventDefault();
    dragDepth += 1;
  }

  function handleDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }

  function handleDragLeave(event: DragEvent): void {
    event.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
  }

  function handleDrop(event: DragEvent): void {
    event.preventDefault();
    dragDepth = 0;

    const dropped = event.dataTransfer?.files;
    if (!dropped || dropped.length === 0) return;

    const files = Array.from(dropped).filter(isAccepted);
    if (files.length === 0) return;

    onDrop(multiple ? files : files.slice(0, 1));
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
  }
</script>

<div
  class="drop-zone"
  class:drag-over={dragging}
  role="button"
  tabindex="0"
  aria-label="Drop files here"
  title="Drop files here"
  on:dragenter={handleDragEnter}
  on:dragover={handleDragOver}
  on:dragleave={handleDragLeave}
  on:drop={handleDrop}
  on:keydown={handleKeydown}
>
  <span>{dragging ? 'Drop files to add them' : 'Drag and drop files here'}</span>
</div>

<style>
  .drop-zone {
    background-color: rgb(var(--bg-card-rgb) / 0.8);
    border: 2px dashed var(--border);
    border-radius: 12px;
    min-height: 160px;
    height: 200px;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.25rem;
    color: var(--text-muted);
    cursor: default;
    text-align: center;
    font-size: 13px;
    line-height: 1.4;
    transition:
      border-color 0.2s ease,
      background-color 0.2s ease,
      color 0.2s ease;
  }

  .drop-zone:hover,
  .drop-zone.drag-over {
    border-color: var(--accent);
    background-color: rgb(var(--accent-rgb) / 0.12);
    color: var(--accent-ink);
  }

  .drop-zone:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px rgb(var(--accent-rgb) / 0.5);
  }
</style>
