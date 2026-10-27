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
</script>

<div
  class="drop-zone"
  class:drag-over={dragging}
  role="button"
  tabindex="0"
  aria-label="Drop files here"
  on:dragenter={handleDragEnter}
  on:dragover={handleDragOver}
  on:dragleave={handleDragLeave}
  on:drop={handleDrop}
>
  <span>{dragging ? 'Drop files to add them' : 'Drag and drop files here'}</span>
</div>

<style>
  .drop-zone {
    background-color: rgba(26, 26, 26, 0.8); /* #1A1A1A 80% */
    border: 2px dashed #555;
    height: 200px;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #8f8f8f;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .drop-zone:hover,
  .drop-zone.drag-over {
    border-color: #ab6314;
    background-color: rgba(171, 99, 20, 0.8);
    color: #ab6314;
  }
</style>
