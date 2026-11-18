<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { get } from 'svelte/store';
  import type { ComponentType } from 'svelte';
  import {
    ArrowLeft,
    ChevronRight,
    Folder,
    Link2,
    Music,
    Pencil,
    Play,
    Plus,
    Podcast,
    Radio,
    RefreshCw,
    Search,
    Server,
    Trash2,
  } from 'lucide-svelte';
  import AddStreamDialog from '../components/AddStreamDialog.svelte';
  import LibraryDetails from '../components/LibraryDetails.svelte';
  import MediaCard from '../components/MediaCard.svelte';
  import MediaListRow from '../components/MediaListRow.svelte';
  import ViewModeToggle from '../components/ViewModeToggle.svelte';
  import type { MediaItem } from '../lib/mock';
  import { normalizeFeedUrl } from '../lib/networkParse';
  import {
    loadNetworkLevel,
    previewPodcastFeed,
    type LoadedLevel,
    type ScanMedia,
  } from '../lib/networkScan';
  import { navigate } from '../stores/navigation';
  import {
    addPodcastSubscription,
    addSavedStream,
    clearJamendoClientId,
    describeNetworkLocationError,
    describeStreamUrlError,
    jamendoClientId,
    networkContextMedia,
    networkLocationTitle,
    networkPath,
    networkSearch,
    normalizeNetworkLocation,
    podcastSubscriptions,
    removePodcastSubscription,
    removeSavedStream,
    savedStreams,
    setJamendoClientId,
    type SavedStream,
  } from '../stores/network';
  import { setQueue } from '../stores/player';
  import { openSavedStreamContextMenu } from '../stores/ui';
  import { networkViewMode, type ViewMode } from '../stores/viewModes';

  type SourceDef = {
    id: string;
    title: string;
    summary: string;
    emptyTitle: string;
    emptyBody: string;
    children?: SourceDef[];
  };

  type DrillRow = {
    id: string;
    title: string;
    summary: string;
    icon?: string;
  };

  const OPEN_PROTOCOLS = [
    'HTTP',
    'HTTPS',
    'FTP',
    'FTPS',
    'SFTP',
    'SMB',
    'NFS',
    'RTSP',
    'RTP',
    'UDP',
    'MMS',
    'RTMP',
  ];

  const SOURCES: SourceDef[] = [
    {
      id: 'saved',
      title: 'Saved Streams',
      summary: 'Your URLs',
      emptyTitle: 'No saved streams yet',
      emptyBody:
        'Add a radio, podcast or video stream URL and it will appear here for quick playback.',
    },
    {
      id: 'open-url',
      title: 'Open Network URL',
      summary: 'HTTP, FTP, RTSP, SMB…',
      emptyTitle: 'Open a network URL',
      emptyBody: 'Play an address without saving it.',
    },
    {
      id: 'local',
      title: 'Local Network',
      summary: 'UPnP and SMB',
      emptyTitle: 'Nothing on the local network',
      emptyBody: 'UPnP, DLNA and SMB sources are listed here.',
      children: [
        {
          id: 'upnp',
          title: 'UPnP / DLNA',
          summary: 'Media servers',
          emptyTitle: 'No UPnP or DLNA servers',
          emptyBody:
            'Media servers that answer an SSDP search on this network are listed here. A server stays listed by name when its folders cannot be browsed.',
        },
        {
          id: 'smb',
          title: 'SMB',
          summary: 'Shared folders',
          emptyTitle: 'No shared folders',
          emptyBody:
            'Shares found by smbtree or smbclient are listed here. Passwords are not stored. An smb:// address can still be played from Open Network URL.',
        },
      ],
    },
    {
      id: 'podcasts',
      title: 'Podcasts',
      summary: 'Shows and episodes',
      emptyTitle: 'No podcasts',
      emptyBody:
        'Add an RSS or Atom feed URL. Episodes from that feed are listed here, with a duration or image only when the feed includes one.',
    },
    {
      id: 'radio',
      title: 'Internet Radio',
      summary: 'Station directory',
      emptyTitle: 'No stations',
      emptyBody:
        'Stations from the Internet Radio directory will show up here when that catalog is connected.',
    },
    {
      id: 'icecast',
      title: 'Icecast',
      summary: 'Icecast directory',
      emptyTitle: 'No Icecast stations',
      emptyBody: 'Stations published by the Icecast directory are listed here with their stream URL.',
    },
    {
      id: 'jamendo',
      title: 'Jamendo',
      summary: 'Jamendo directory',
      emptyTitle: 'No Jamendo music',
      emptyBody:
        'Jamendo needs a client id before any albums can be listed. No client id is configured.',
    },
    {
      id: 'shoutcast',
      title: 'Shoutcast',
      summary: 'Shoutcast directory',
      emptyTitle: 'No Shoutcast stations',
      emptyBody: 'The Shoutcast directory is unavailable.',
    },
  ];

  const ICONS: Record<string, ComponentType> = {
    saved: Radio,
    'open-url': Link2,
    local: Server,
    upnp: Server,
    smb: Folder,
    podcasts: Podcast,
    radio: Radio,
    icecast: Radio,
    jamendo: Music,
    shoutcast: Radio,
  };

  const focusRing =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60 focus-visible:ring-offset-1 focus-visible:ring-offset-vlc-app';

  const emptyActionClass =
    'rounded-control border border-vlc-border bg-vlc-card px-3 py-1.5 text-xs text-vlc-secondary transition-colors hover:border-vlc-borderStrong hover:text-vlc-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-vlc-orange/50';

  type PageScan = Omit<LoadedLevel, 'status'> & { status: 'idle' | 'loading' | 'ready' | 'error' };

  const idleScan: PageScan = {
    status: 'idle',
    folders: [],
    media: [],
    message: '',
    note: '',
  };

  function loadingCopy(segments: readonly string[]): string {
    if (segments[1] === 'upnp' && segments.length === 2) return 'Searching this network for UPnP and DLNA servers.';
    if (segments[1] === 'upnp') return 'Browsing this server.';
    if (segments[1] === 'smb' && segments.length === 2) return 'Looking for SMB shares.';
    if (segments[1] === 'smb') return 'Listing this share.';
    if (segments[0] === 'podcasts' && segments.length === 1) return 'Loading subscriptions.';
    if (segments[0] === 'podcasts') return 'Loading episodes.';
    if (segments[0] === 'icecast') return 'Loading the Icecast directory.';
    if (segments[0] === 'jamendo') return 'Loading Jamendo.';
    if (segments[0] === 'shoutcast') return 'Checking the Shoutcast directory.';
    return 'Loading.';
  }

  function scanKeyFor(segments: readonly string[], podcastKey: string, jamendoSet: boolean): string {
    if (segments[0] === 'local' && (segments[1] === 'upnp' || segments[1] === 'smb')) {
      return segments.join('\u0001');
    }
    if (segments[0] === 'podcasts' && segments.length === 1) return `podcasts\u0001${podcastKey}`;
    if (segments[0] === 'podcasts') return segments.join('\u0001');
    if (segments[0] === 'icecast' || segments[0] === 'shoutcast') return segments[0];
    if (segments[0] === 'jamendo') return jamendoSet ? 'jamendo\u0001set' : 'jamendo';
    return '';
  }

  function sourceById(id: string): SourceDef | null {
    return SOURCES.find((source) => source.id === id) ?? null;
  }

  function sourceAt(path: readonly string[]): SourceDef | null {
    const root = path[0] ? sourceById(path[0]) : null;
    if (!root) return null;
    if (path.length < 2) return root;
    return root.children?.find((child) => child.id === path[1]) ?? null;
  }

  function streamProtocol(url: string): string {
    const bindAll = url.match(/^(udp|rtp):/i);
    if (bindAll && url.includes('@:')) return bindAll[1].toUpperCase();
    try {
      return new URL(url).protocol.replace(':', '').toUpperCase();
    } catch {
      return '';
    }
  }

  function streamHost(url: string): string {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  }

  function streamLocation(stream: SavedStream): string {
    const protocol = streamProtocol(stream.url);
    const host = streamHost(stream.url);
    return protocol ? `${protocol} · ${host}` : host;
  }

  function formatAddedAt(timestamp: number): string {
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime())
      ? 'Unknown date'
      : date.toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        });
  }

  function mediaItemFromScan(file: ScanMedia): MediaItem {
    const item: MediaItem = {
      id: file.id,
      title: file.title,
      season: 0,
      episode: 0,
      durationSeconds: file.durationSeconds ?? 0,
      progress: 0,
      src: file.url,
    };
    if (file.thumbnailUrl) item.thumbnailPath = file.thumbnailUrl;
    return item;
  }

  function segmentLabel(segment: string): string {
    let decoded = segment;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      decoded = segment;
    }
    try {
      const url = new URL(decoded);
      return url.host || decoded;
    } catch {
      return decoded;
    }
  }

  let query = '';
  let urlDraft = '';
  let urlTouched = false;
  let detailsItemId: string | null = null;
  let dialogOpen = false;
  let dialogMode: 'add' | 'edit' = 'add';
  let editingStream: SavedStream | null = null;
  let dialogTrigger: HTMLElement | null = null;
  let addButtonEl: HTMLButtonElement | null = null;
  let pendingRemoveId: string | null = null;
  let removeButtonEl: HTMLButtonElement | null = null;
  let confirmRemoveEl: HTMLButtonElement | null = null;
  let statusMessage = '';
  let statusTimer: ReturnType<typeof setTimeout> | undefined;
  let scanState: PageScan = idleScan;
  let scanToken = 0;
  let activeScanKey = '';
  let folderTitles: Record<string, string> = {};
  let feedDraft = '';
  let feedError = '';
  let feedBusy = false;
  let clientDraft = '';
  let clientError = '';
  let pendingPodcastRemove = false;

  $: path = $networkPath;
  $: atRoot = path.length === 0;
  $: openUrl = path[0] === 'open-url';
  $: savedList = path[0] === 'saved' && path.length === 1;
  $: savedDetail =
    path[0] === 'saved' && path.length > 1
      ? $savedStreams.find((stream) => stream.id === path[1]) ?? null
      : null;
  $: savedMissing = path[0] === 'saved' && path.length > 1 && savedDetail === null;
  $: currentSource = sourceAt(path);
  $: showAdd = atRoot || path[0] === 'saved';
  $: normalizedQuery = query.trim().toLowerCase();

  $: crumbs = (() => {
    const items: { label: string; depth: number }[] = [{ label: 'Network', depth: 0 }];
    const root = path[0] ? sourceById(path[0]) : null;
    if (!root) return items;
    items.push({ label: root.title, depth: 1 });
    if (path[0] === 'saved' && path[1]) {
      items.push({ label: savedDetail?.name ?? 'Stream', depth: 2 });
      return items;
    }
    const child = root.children?.find((entry) => entry.id === path[1]);
    if (child) items.push({ label: child.title, depth: 2 });
    const start = child ? 3 : 2;
    for (let depth = start; depth <= path.length; depth += 1) {
      const key = path.slice(0, depth).join('\u0001');
      const podcast = path[0] === 'podcasts' ? $podcastSubscriptions.find((entry) => entry.id === path[depth - 1]) : null;
      items.push({
        label: folderTitles[key] ?? podcast?.title ?? segmentLabel(path[depth - 1] ?? ''),
        depth,
      });
    }
    return items;
  })();

  function matches(title: string, extra: string): boolean {
    if (!normalizedQuery) return true;
    return (
      title.toLowerCase().includes(normalizedQuery) ||
      extra.toLowerCase().includes(normalizedQuery)
    );
  }

  $: podcastKey = $podcastSubscriptions.map((subscription) => subscription.id).join('|');
  $: jamendoSet = Boolean($jamendoClientId);
  $: scanKey = scanKeyFor(path, podcastKey, jamendoSet);
  $: scanning = scanKey !== '';
  $: podcastDetail =
    path[0] === 'podcasts' && path[1]
      ? $podcastSubscriptions.find((subscription) => subscription.id === path[1]) ?? null
      : null;

  $: if (scanKey !== activeScanKey) {
    void runScan(scanKey, path);
  }

  async function runScan(key: string, segments: readonly string[]) {
    const token = ++scanToken;
    activeScanKey = key;
    if (!key) {
      scanState = idleScan;
      return;
    }
    const snapshot = segments.slice();
    scanState = { status: 'loading', folders: [], media: [], message: loadingCopy(snapshot), note: '' };
    const loaded = await loadNetworkLevel(snapshot, {
      podcasts: get(podcastSubscriptions),
      jamendoClientId: get(jamendoClientId),
    });
    if (token !== scanToken) return;
    scanState = loaded;
  }

  function rescan() {
    activeScanKey = '';
  }

  $: drillRows = ((): DrillRow[] => {
    if (openUrl || (path[0] === 'saved' && path.length > 1)) return [];
    if (atRoot) {
      return SOURCES.filter((source) => matches(source.title, source.summary)).map((source) => ({
        id: source.id,
        title: source.title,
        summary:
          source.id === 'saved'
            ? $savedStreams.length === 1
              ? '1 saved stream'
              : `${$savedStreams.length} saved streams`
            : source.summary,
      }));
    }
    if (savedList) return [];
    if (scanning) {
      return scanState.folders
        .filter((folder) => matches(folder.title, folder.summary))
        .map((folder) => ({
          id: folder.id,
          title: folder.title,
          summary: folder.summary,
          icon: folder.icon,
        }));
    }
    const children = currentSource?.children ?? [];
    return children
      .filter((child) => matches(child.title, child.summary))
      .map((child) => ({
        id: child.id,
        title: child.title,
        summary: child.summary,
      }));
  })();

  $: liveStreams = savedList
    ? $savedStreams.filter(
        (stream) => matches(stream.name, stream.url) || matches(stream.name, streamLocation(stream)),
      )
    : [];

  $: mediaItems = (scanning ? scanState.media : [])
    .filter((file) => Boolean(file.url))
    .filter((file) => matches(file.title, file.url))
    .map(mediaItemFromScan);

  $: networkContextMedia.set(mediaItems);

  $: detailsItem = detailsItemId
    ? mediaItems.find((item) => item.id === detailsItemId) ?? null
    : null;

  $: listing = !openUrl && !(path[0] === 'saved' && path.length > 1);
  $: listCount = drillRows.length + liveStreams.length + mediaItems.length;
  $: playableHref = normalizeNetworkLocation(urlDraft);
  $: locationError =
    urlTouched && !playableHref ? describeNetworkLocationError(urlDraft) : null;
  $: canSaveLocation = playableHref !== null && describeStreamUrlError(playableHref) === null;

  function setViewMode(mode: ViewMode) {
    networkViewMode.set(mode);
  }

  function clearQuery() {
    query = '';
    networkSearch.set('');
  }

  function goToDepth(depth: number) {
    networkPath.set(get(networkPath).slice(0, depth));
    clearQuery();
    detailsItemId = null;
    pendingRemoveId = null;
    pendingPodcastRemove = false;
    urlTouched = false;
  }

  function goBack() {
    const current = get(networkPath);
    if (current.length === 0) return;
    goToDepth(current.length - 1);
  }

  function openDrill(id: string) {
    networkPath.set([...get(networkPath), id]);
    clearQuery();
    detailsItemId = null;
    pendingRemoveId = null;
    pendingPodcastRemove = false;
    urlTouched = false;
  }

  function openScanFolder(row: DrillRow) {
    const next = [...get(networkPath), row.id];
    folderTitles = { ...folderTitles, [next.join('\u0001')]: row.title };
    openDrill(row.id);
  }

  function openSaved(stream: SavedStream) {
    networkPath.set(['saved', stream.id]);
    clearQuery();
    detailsItemId = null;
    pendingRemoveId = null;
  }

  function playLocation(id: string, title: string, url: string, duration = 0) {
    setQueue([{ id, title, duration, src: url }], 0);
    navigate('home');
  }

  function playStream(stream: SavedStream) {
    playLocation(stream.id, stream.name, stream.url, 0);
  }

  function playMedia(item: MediaItem) {
    if (!item.src) return;
    const tracks = mediaItems
      .filter((entry) => entry.src)
      .map((entry) => ({
        id: entry.id,
        title: entry.title,
        duration: entry.durationSeconds > 0 ? entry.durationSeconds : 0,
        src: entry.src,
      }));
    const index = Math.max(0, tracks.findIndex((entry) => entry.id === item.id));
    setQueue(tracks.length ? tracks : [{ id: item.id, title: item.title, duration: item.durationSeconds, src: item.src }], index);
    navigate('home');
  }

  async function submitFeed() {
    feedError = '';
    const url = normalizeFeedUrl(feedDraft);
    if (!url) {
      feedError = 'Enter an http or https feed URL.';
      return;
    }
    feedBusy = true;
    const preview = await previewPodcastFeed(url);
    feedBusy = false;
    if (!preview.ok) {
      feedError = preview.error;
      return;
    }
    const saved = addPodcastSubscription({ feedUrl: url, title: preview.feed.title });
    if (!saved.ok) {
      feedError = saved.error;
      return;
    }
    feedDraft = '';
    folderTitles = {
      ...folderTitles,
      [['podcasts', saved.subscription.id].join('\u0001')]: saved.subscription.title,
    };
    announce(saved.duplicate ? 'That podcast is already subscribed' : `Subscribed to ${saved.subscription.title}`);
    clearQuery();
    networkPath.set(['podcasts', saved.subscription.id]);
  }

  function saveClientId() {
    const result = setJamendoClientId(clientDraft);
    if (!result.ok) {
      clientError = result.error;
      return;
    }
    clientError = '';
    clientDraft = '';
    announce('Jamendo client id saved');
    rescan();
  }

  function forgetClientId() {
    clearJamendoClientId();
    clientDraft = '';
    clientError = '';
    rescan();
  }

  function confirmPodcastRemove(subscriptionId: string) {
    removePodcastSubscription(subscriptionId);
    pendingPodcastRemove = false;
    networkPath.set(['podcasts']);
    announce('Podcast removed');
  }

  function announce(message: string) {
    statusMessage = message;
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      statusMessage = '';
    }, 3200);
  }

  function openAddDialog(event?: MouseEvent) {
    dialogMode = 'add';
    editingStream = null;
    dialogTrigger =
      event?.currentTarget instanceof HTMLElement ? event.currentTarget : addButtonEl;
    dialogOpen = true;
  }

  function openEditDialog(stream: SavedStream, trigger: HTMLElement | null) {
    dialogMode = 'edit';
    editingStream = stream;
    dialogTrigger = trigger ?? addButtonEl;
    dialogOpen = true;
  }

  function closeDialog() {
    dialogOpen = false;
  }

  function handleStreamSaved(event: CustomEvent<{ stream: SavedStream; message: string }>) {
    const { stream, message } = event.detail;
    clearQuery();
    networkPath.set(['saved', stream.id]);
    pendingRemoveId = null;
    urlTouched = false;
    if (dialogMode === 'add') dialogTrigger = addButtonEl;
    dialogOpen = false;
    announce(message);
  }

  async function requestRemove(id: string) {
    pendingRemoveId = id;
    await tick();
    confirmRemoveEl?.focus();
  }

  function cancelRemove() {
    pendingRemoveId = null;
    tick().then(() => removeButtonEl?.focus());
  }

  function confirmRemove(stream: SavedStream) {
    removeSavedStream(stream.id);
    pendingRemoveId = null;
    if (get(networkPath)[1] === stream.id) networkPath.set(['saved']);
    announce('Stream removed');
    tick().then(() => addButtonEl?.focus());
  }

  function submitLocation() {
    urlTouched = true;
    const href = normalizeNetworkLocation(urlDraft);
    if (!href) return;
    playLocation(`network-${href}`, networkLocationTitle(href), href, 0);
  }

  function saveLocation() {
    const href = normalizeNetworkLocation(urlDraft);
    if (!href) {
      urlTouched = true;
      return;
    }
    const result = addSavedStream({ url: href, name: networkLocationTitle(href) });
    if (!result.ok) {
      announce(result.error);
      return;
    }
    clearQuery();
    networkPath.set(['saved', result.stream.id]);
    urlDraft = '';
    urlTouched = false;
    announce(result.duplicate ? 'That stream is already saved' : 'Stream saved');
  }

  function handleSearchInput(event: Event) {
    query = (event.currentTarget as HTMLInputElement).value;
    networkSearch.set(query);
  }

  onMount(() => {
    function onEdit(event: Event) {
      const id = (event as CustomEvent<string>).detail;
      const stream = get(savedStreams).find((entry) => entry.id === id);
      if (!stream) return;
      openEditDialog(stream, null);
    }

    function onRemove(event: Event) {
      const id = (event as CustomEvent<string>).detail;
      const stream = get(savedStreams).find((entry) => entry.id === id);
      if (!stream) return;
      networkPath.set(['saved', stream.id]);
      clearQuery();
      void requestRemove(stream.id);
    }

    function onInfo(event: Event) {
      const id = (event as CustomEvent<string>).detail;
      if (!id) return;
      if (get(networkContextMedia).some((item) => item.id === id)) detailsItemId = id;
    }

    window.addEventListener('vlc-edit-saved-stream', onEdit);
    window.addEventListener('vlc-remove-saved-stream', onRemove);
    window.addEventListener('vlc-show-media-info', onInfo);
    return () => {
      window.removeEventListener('vlc-edit-saved-stream', onEdit);
      window.removeEventListener('vlc-remove-saved-stream', onRemove);
      window.removeEventListener('vlc-show-media-info', onInfo);
    };
  });

  onDestroy(() => {
    if (statusTimer) clearTimeout(statusTimer);
    networkContextMedia.set([]);
  });
</script>

<div class="relative flex h-full min-h-0 flex-col bg-vlc-app">
  <header class="flex h-16 shrink-0 items-center gap-3 border-b border-vlc-border px-6">
    <button
      type="button"
      class="flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text {focusRing}"
      title="Back"
      aria-label="Go back"
      on:click={goBack}
    >
      <ArrowLeft size={18} strokeWidth={1.75} aria-hidden="true" />
    </button>

    <nav
      class="flex min-w-0 items-center gap-2 text-[13px] leading-none"
      aria-label="Breadcrumb"
    >
      {#each crumbs as crumb, index (crumb.depth)}
        {#if index > 0}
          <ChevronRight
            size={14}
            strokeWidth={1.75}
            class="shrink-0 text-vlc-muted"
            aria-hidden="true"
          />
        {/if}
        <button
          type="button"
          class="min-w-0 truncate whitespace-nowrap rounded-[4px] px-0.5 transition-colors {focusRing}"
          class:text-vlc-text={index === crumbs.length - 1}
          class:text-vlc-secondary={index !== crumbs.length - 1}
          class:hover:text-vlc-text={index !== crumbs.length - 1}
          aria-current={index === crumbs.length - 1 ? 'page' : undefined}
          title={index === crumbs.length - 1 ? crumb.label : `Go to ${crumb.label}`}
          on:click={() => goToDepth(crumb.depth)}
        >
          {crumb.label}
        </button>
      {/each}
    </nav>

    <div class="ml-auto flex min-w-0 items-center gap-1">
      {#if listing && !detailsItem}
        <span class="mr-2 whitespace-nowrap text-xs text-vlc-muted" aria-live="polite">
          {#if scanning && scanState.status === 'loading'}
            Searching…
          {:else}
            {listCount} {listCount === 1 ? 'item' : 'items'}
          {/if}
        </span>
      {/if}

      {#if listing && !detailsItem}
        <label class="relative ml-1 min-w-0 max-w-60 flex-1">
          <Search
            size={14}
            strokeWidth={1.75}
            class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-vlc-muted"
            aria-hidden="true"
          />
          <input
            type="search"
            placeholder="Search"
            aria-label="Search network"
            value={query}
            on:input={handleSearchInput}
            class="h-8 w-full rounded-input border border-vlc-border bg-vlc-card pl-8 pr-3 text-xs text-vlc-text outline-none transition-colors placeholder:text-vlc-muted focus:border-vlc-orange/40 focus:ring-1 focus:ring-vlc-orange/40"
          />
        </label>
      {/if}

      {#if scanning && !detailsItem}
        <button
          type="button"
          class="flex h-8 w-8 items-center justify-center rounded-control text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text disabled:opacity-40 {focusRing}"
          title="Scan again"
          aria-label="Scan again"
          disabled={scanState.status === 'loading'}
          on:click={rescan}
        >
          <RefreshCw size={15} strokeWidth={1.75} aria-hidden="true" />
        </button>
      {/if}

      <ViewModeToggle
        value={$networkViewMode}
        onChange={setViewMode}
        label="Network view mode"
      />

      {#if showAdd}
        <button
          bind:this={addButtonEl}
          type="button"
          class="ml-1 flex h-8 shrink-0 items-center gap-1.5 rounded-control bg-vlc-orange px-2.5 text-[12px] font-medium text-vlc-orangeDeep transition-[filter,background-color] hover:brightness-110 {focusRing}"
          title="Add stream"
          aria-label="Add stream"
          on:click={openAddDialog}
        >
          <Plus size={16} strokeWidth={2} aria-hidden="true" />
          <span class="hidden xl:inline">Add Stream</span>
        </button>
      {/if}
    </div>
  </header>

  <div class="min-h-0 flex-1 overflow-y-auto">
    {#if detailsItem}
      <LibraryDetails
        item={detailsItem}
        breadcrumb={crumbs.map((crumb) => crumb.label)}
        onBack={() => {
          const id = detailsItemId;
          detailsItemId = null;
          tick().then(() => {
            if (id) document.querySelector<HTMLElement>(`[data-media-info="${id}"]`)?.focus();
          });
        }}
        onPlay={playMedia}
      />
    {:else if openUrl}
      <section class="mx-auto w-full max-w-xl px-6 py-8" aria-label="Open network URL">
        <h1 class="text-[17px] font-medium text-vlc-text">Open a network URL</h1>
        <p class="mt-1 text-[13px] leading-5 text-vlc-secondary">
          Play an address on the current queue. HTTP, HTTPS, RTSP, RTMP and MMS can also be saved.
          FTP, FTPS, SFTP, SMB, NFS, RTP and UDP play from here.
        </p>

        <ul class="mt-4 flex flex-wrap gap-1.5" aria-label="Supported protocols">
          {#each OPEN_PROTOCOLS as protocol (protocol)}
            <li
              class="rounded-full border border-vlc-border bg-vlc-card px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-vlc-secondary"
            >
              {protocol}
            </li>
          {/each}
        </ul>

        <form class="mt-5" on:submit|preventDefault={submitLocation}>
          <label for="network-url" class="mb-1.5 block text-[12px] font-medium text-vlc-secondary">
            Network URL
          </label>
          <input
            id="network-url"
            bind:value={urlDraft}
            on:input={() => {
              if (urlTouched) urlTouched = false;
            }}
            type="url"
            maxlength="2048"
            autocomplete="url"
            spellcheck="false"
            placeholder="https://example.com/stream"
            class="h-10 w-full rounded-control border bg-vlc-card px-3 text-[13px] text-vlc-text outline-none transition-colors placeholder:text-vlc-muted focus:ring-1 focus:ring-inset focus:ring-vlc-orange/50 {locationError
              ? 'border-vlc-danger'
              : 'border-vlc-border'}"
            aria-invalid={locationError ? 'true' : undefined}
            aria-describedby={locationError ? 'network-url-error' : 'network-url-hint'}
          />
          {#if locationError}
            <p id="network-url-error" class="mt-1 text-[11px] text-vlc-danger" role="alert">
              {locationError}
            </p>
          {:else}
            <p id="network-url-hint" class="mt-1 text-[11px] text-vlc-muted">
              For example rtsp://camera.local/stream or smb://server/share/movie.mkv
            </p>
          {/if}

          <div class="mt-4 flex flex-wrap gap-2">
            <button
              type="submit"
              class="flex h-8 items-center gap-1.5 rounded-control bg-vlc-orange px-3 text-[12px] font-medium text-vlc-orangeDeep transition-[filter,background-color] hover:brightness-110 {focusRing}"
            >
              <Play size={15} strokeWidth={2} aria-hidden="true" />
              Play
            </button>
            {#if canSaveLocation}
              <button
                type="button"
                class="flex h-8 items-center gap-1.5 rounded-control border border-vlc-border bg-vlc-card px-3 text-[12px] text-vlc-secondary transition-colors hover:border-vlc-borderStrong hover:bg-vlc-raised hover:text-vlc-text {focusRing}"
                on:click={saveLocation}
              >
                <Plus size={14} strokeWidth={1.75} aria-hidden="true" />
                Save stream
              </button>
            {/if}
          </div>
        </form>
      </section>
    {:else if savedDetail}
      {@const stream = savedDetail}
      <section class="mx-auto w-full max-w-xl px-6 py-8" aria-label={`${stream.name} details`}>
        <p class="text-[11px] font-medium uppercase tracking-[0.08em] text-vlc-muted">
          Saved stream
        </p>
        <h1 class="mt-1.5 break-words text-xl font-semibold leading-tight text-vlc-text">
          {stream.name}
        </h1>
        <p class="mt-2 text-[13px] text-vlc-secondary">{streamLocation(stream)}</p>

        <div class="mt-4 flex flex-wrap items-center gap-1.5">
          <span
            class="rounded-full border border-vlc-border bg-vlc-card px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-vlc-secondary"
          >
            {streamProtocol(stream.url)}
          </span>
          <span class="text-[11px] text-vlc-muted">Added {formatAddedAt(stream.addedAt)}</span>
        </div>

        <dl class="mt-5 space-y-2.5 border-t border-vlc-border pt-4 text-[12px]">
          <div>
            <dt class="text-vlc-muted">Address</dt>
            <dd class="mt-0.5 break-all text-vlc-secondary">{stream.url}</dd>
          </div>
          <div>
            <dt class="text-vlc-muted">Host</dt>
            <dd class="mt-0.5 truncate text-vlc-secondary">{streamHost(stream.url)}</dd>
          </div>
        </dl>

        <div class="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            class="flex h-8 items-center gap-1.5 rounded-control bg-vlc-orange px-3 text-[12px] font-medium text-vlc-orangeDeep transition-[filter,background-color] hover:brightness-110 {focusRing}"
            on:click={() => playStream(stream)}
          >
            <Play size={15} strokeWidth={2} aria-hidden="true" />
            Play
          </button>
          <button
            type="button"
            class="flex h-8 items-center gap-1.5 rounded-control border border-vlc-border bg-vlc-card px-3 text-[12px] text-vlc-secondary transition-colors hover:border-vlc-borderStrong hover:bg-vlc-raised hover:text-vlc-text {focusRing}"
            on:click={(event) =>
              openEditDialog(stream, event.currentTarget instanceof HTMLElement ? event.currentTarget : null)}
          >
            <Pencil size={14} strokeWidth={1.75} aria-hidden="true" />
            Edit
          </button>
          <button
            bind:this={removeButtonEl}
            type="button"
            class="flex h-8 items-center gap-1.5 rounded-control border border-vlc-danger/40 px-3 text-[12px] text-vlc-danger transition-colors hover:bg-vlc-danger/10 {focusRing}"
            on:click={() => requestRemove(stream.id)}
          >
            <Trash2 size={14} strokeWidth={1.75} aria-hidden="true" />
            Remove
          </button>
        </div>

        {#if pendingRemoveId === stream.id}
          <div
            class="mt-3 rounded-control border border-vlc-danger/40 bg-vlc-danger/10 p-3"
            role="alertdialog"
            aria-labelledby="remove-stream-title"
            aria-describedby="remove-stream-desc"
          >
            <p id="remove-stream-title" class="text-[12px] font-medium text-vlc-text">
              Remove this stream?
            </p>
            <p id="remove-stream-desc" class="mt-1 text-[11px] leading-4 text-vlc-secondary">
              It will be removed from Saved Streams.
            </p>
            <div class="mt-2.5 flex gap-2">
              <button
                bind:this={confirmRemoveEl}
                type="button"
                class="h-7 rounded-control border border-vlc-danger/50 px-2.5 text-[11px] font-medium text-vlc-danger transition-colors hover:bg-vlc-danger/10 {focusRing}"
                on:click={() => confirmRemove(stream)}
              >
                Remove
              </button>
              <button
                type="button"
                class="h-7 rounded-control px-2.5 text-[11px] text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text {focusRing}"
                on:click={cancelRemove}
              >
                Cancel
              </button>
            </div>
          </div>
        {/if}
      </section>
    {:else}
      {#if path[0] === 'podcasts' && path.length === 1}
        <form class="mx-auto w-full max-w-xl px-6 pt-6" on:submit|preventDefault={submitFeed}>
          <label for="podcast-feed" class="mb-1.5 block text-[12px] font-medium text-vlc-secondary">
            Podcast feed
          </label>
          <div class="flex flex-wrap gap-2">
            <input
              id="podcast-feed"
              bind:value={feedDraft}
              type="url"
              maxlength="2048"
              autocomplete="url"
              spellcheck="false"
              placeholder="https://example.com/feed.xml"
              class="h-10 min-w-0 flex-1 rounded-control border bg-vlc-card px-3 text-[13px] text-vlc-text outline-none placeholder:text-vlc-muted focus:ring-1 focus:ring-inset focus:ring-vlc-orange/50 {feedError
                ? 'border-vlc-danger'
                : 'border-vlc-border'}"
              aria-invalid={feedError ? 'true' : undefined}
              aria-describedby={feedError ? 'podcast-feed-error' : undefined}
            />
            <button
              type="submit"
              class="flex h-10 items-center gap-1.5 rounded-control bg-vlc-orange px-3 text-[12px] font-medium text-vlc-orangeDeep transition-[filter] hover:brightness-110 disabled:opacity-50 {focusRing}"
              disabled={feedBusy}
            >
              <Plus size={14} strokeWidth={1.75} aria-hidden="true" />
              {feedBusy ? 'Adding…' : 'Add feed'}
            </button>
          </div>
          {#if feedError}
            <p id="podcast-feed-error" class="mt-1 text-[11px] text-vlc-danger" role="alert">{feedError}</p>
          {/if}
        </form>
      {/if}

      {#if path[0] === 'jamendo' && path.length === 1}
        <form class="mx-auto w-full max-w-xl px-6 pt-6" on:submit|preventDefault={saveClientId}>
          <label for="jamendo-client" class="mb-1.5 block text-[12px] font-medium text-vlc-secondary">
            Jamendo client id
          </label>
          <p class="mb-2 text-[12px] leading-5 text-vlc-muted">
            Jamendo's catalog needs a client id from your own application. Kanea does not include one.
          </p>
          <div class="flex flex-wrap gap-2">
            <input
              id="jamendo-client"
              bind:value={clientDraft}
              type="text"
              maxlength="64"
              autocomplete="off"
              spellcheck="false"
              placeholder="Client id"
              class="h-10 min-w-0 flex-1 rounded-control border bg-vlc-card px-3 text-[13px] text-vlc-text outline-none placeholder:text-vlc-muted focus:ring-1 focus:ring-inset focus:ring-vlc-orange/50 {clientError
                ? 'border-vlc-danger'
                : 'border-vlc-border'}"
              aria-invalid={clientError ? 'true' : undefined}
              aria-describedby={clientError ? 'jamendo-client-error' : undefined}
            />
            <button
              type="submit"
              class="h-10 rounded-control bg-vlc-orange px-3 text-[12px] font-medium text-vlc-orangeDeep transition-[filter] hover:brightness-110 {focusRing}"
            >
              Save
            </button>
            {#if $jamendoClientId}
              <button
                type="button"
                class="h-10 rounded-control border border-vlc-border px-3 text-[12px] text-vlc-secondary transition-colors hover:text-vlc-text {focusRing}"
                on:click={forgetClientId}
              >
                Clear
              </button>
            {/if}
          </div>
          {#if clientError}
            <p id="jamendo-client-error" class="mt-1 text-[11px] text-vlc-danger" role="alert">{clientError}</p>
          {:else if $jamendoClientId}
            <p class="mt-1 text-[11px] text-vlc-muted">A client id is saved on this device.</p>
          {/if}
        </form>
      {/if}

      {#if podcastDetail}
        <div class="mx-auto flex w-full max-w-xl items-center justify-end px-6 pt-4">
          {#if pendingPodcastRemove}
            <div class="flex items-center gap-2" role="group" aria-label="Remove podcast">
              <span class="text-[12px] text-vlc-secondary">Remove this subscription?</span>
              <button
                type="button"
                class="h-7 rounded-control border border-vlc-danger/50 px-2.5 text-[11px] font-medium text-vlc-danger {focusRing}"
                on:click={() => confirmPodcastRemove(podcastDetail.id)}
              >
                Remove
              </button>
              <button
                type="button"
                class="h-7 rounded-control px-2.5 text-[11px] text-vlc-secondary {focusRing}"
                on:click={() => (pendingPodcastRemove = false)}
              >
                Cancel
              </button>
            </div>
          {:else}
            <button
              type="button"
              class="flex h-8 items-center gap-1.5 rounded-control border border-vlc-danger/40 px-3 text-[12px] text-vlc-danger transition-colors hover:bg-vlc-danger/10 {focusRing}"
              on:click={() => (pendingPodcastRemove = true)}
            >
              <Trash2 size={14} strokeWidth={1.75} aria-hidden="true" />
              Remove
            </button>
          {/if}
        </div>
      {/if}

      {#if scanState.note && (drillRows.length > 0 || mediaItems.length > 0)}
        <p class="px-6 pt-4 text-[12px] text-vlc-muted">{scanState.note}</p>
      {/if}

      {#if drillRows.length > 0 || liveStreams.length > 0 || mediaItems.length > 0}
      {#if drillRows.length > 0}
        {#if $networkViewMode === 'grid'}
          <div
            class="grid grid-cols-2 gap-x-5 gap-y-7 p-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
            role="group"
            aria-label={atRoot ? 'Network sources' : 'Network folders'}
          >
            {#each drillRows as row (row.id)}
              <button
                type="button"
                class="group text-left focus-visible:outline-none"
                aria-label={`Open ${row.title}`}
                on:click={() => (scanning ? openScanFolder(row) : openDrill(row.id))}
              >
                <div
                  class="relative flex aspect-[16/10] w-full flex-col justify-end overflow-hidden rounded-lg border border-vlc-border bg-[linear-gradient(180deg,#1B1B1B_0%,#0E0E0E_100%)] p-4 transition-[border-color,filter] duration-150 group-hover:border-vlc-borderStrong group-hover:brightness-105 group-focus-visible:border-vlc-orange/70"
                >
                  <div
                    class="flex h-11 w-11 items-center justify-center rounded-panel border border-vlc-border bg-vlc-card text-vlc-orange"
                  >
                    <svelte:component
                      this={ICONS[row.icon ?? row.id] ?? Folder}
                      size={22}
                      strokeWidth={1.6}
                      aria-hidden="true"
                    />
                  </div>
                </div>
                <div
                  class="mt-2.5 truncate text-[12px] font-medium leading-4 text-vlc-secondary group-hover:text-vlc-text"
                >
                  {row.title}
                </div>
                <div class="truncate text-[10px] leading-4 text-vlc-muted">{row.summary}</div>
              </button>
            {/each}
          </div>
        {:else}
          <div class="px-6 pt-6">
            <div
              class="overflow-hidden rounded-panel border border-vlc-border bg-vlc-panel"
              role="group"
              aria-label={atRoot ? 'Network sources' : 'Network folders'}
            >
              {#each drillRows as row (row.id)}
                <button
                  type="button"
                  class="flex w-full items-center gap-3 border-b border-vlc-border text-left transition-colors last:border-b-0 hover:bg-vlc-raised focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-vlc-orange/50 {$networkViewMode ===
                  'compact'
                    ? 'px-3 py-1.5'
                    : 'px-3 py-2.5'}"
                  aria-label={`Open ${row.title}`}
                  on:click={() => (scanning ? openScanFolder(row) : openDrill(row.id))}
                >
                  <span
                    class="flex h-9 w-9 shrink-0 items-center justify-center rounded-input border border-vlc-border bg-vlc-card text-vlc-orange"
                  >
                    <svelte:component
                      this={ICONS[row.icon ?? row.id] ?? Folder}
                      size={18}
                      strokeWidth={1.6}
                      aria-hidden="true"
                    />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-[13px] text-vlc-text">{row.title}</span>
                    {#if $networkViewMode !== 'compact'}
                      <span class="block truncate text-[10px] text-vlc-muted">{row.summary}</span>
                    {/if}
                  </span>
                  {#if $networkViewMode === 'compact'}
                    <span class="shrink-0 truncate text-[11px] text-vlc-muted">{row.summary}</span>
                  {/if}
                  <ChevronRight
                    size={14}
                    strokeWidth={1.75}
                    class="shrink-0 text-vlc-muted"
                    aria-hidden="true"
                  />
                </button>
              {/each}
            </div>
          </div>
        {/if}
      {/if}

      {#if liveStreams.length > 0}
        {#if $networkViewMode === 'grid'}
          <div
            class="grid grid-cols-1 gap-3 p-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"
            role="group"
            aria-label="Saved streams"
          >
            {#each liveStreams as stream (stream.id)}
              <div
                class="group flex min-h-[88px] items-start gap-3 rounded-panel border border-vlc-border bg-vlc-card p-4 transition-colors hover:border-vlc-borderStrong hover:bg-vlc-raised"
                role="group"
                aria-label={`${stream.name}, ${streamLocation(stream)}`}
                on:contextmenu={(event) => openSavedStreamContextMenu(event, stream.id)}
              >
                <span
                  class="flex h-10 w-10 shrink-0 items-center justify-center rounded-control border border-vlc-border bg-vlc-panel text-vlc-secondary"
                  aria-hidden="true"
                >
                  <Radio size={18} strokeWidth={1.75} />
                </span>
                <button
                  type="button"
                  class="min-w-0 flex-1 text-left {focusRing}"
                  aria-label={`Open ${stream.name}, ${streamLocation(stream)}, added ${formatAddedAt(stream.addedAt)}`}
                  on:click={() => openSaved(stream)}
                >
                  <span class="block truncate text-sm font-medium text-vlc-text">{stream.name}</span>
                  <span class="mt-0.5 block truncate text-xs text-vlc-secondary">
                    {streamLocation(stream)}
                  </span>
                  <span class="mt-2 block text-[11px] text-vlc-muted">
                    Added {formatAddedAt(stream.addedAt)}
                  </span>
                </button>
              </div>
            {/each}
          </div>
        {:else if $networkViewMode === 'list'}
          <div class="px-6 py-4" role="group" aria-label="Saved streams">
            <div
              class="grid grid-cols-[1fr_180px_120px] gap-3 px-3 py-2 text-[11px] uppercase tracking-wide text-vlc-muted"
              aria-hidden="true"
            >
              <span>Name</span>
              <span>Source</span>
              <span class="text-right">Added</span>
            </div>
            <ul>
              {#each liveStreams as stream (stream.id)}
                <li>
                  <button
                    type="button"
                    class="grid w-full grid-cols-[1fr_180px_120px] items-center gap-3 rounded-control border-t border-vlc-border/30 px-3 py-2 text-left text-[13px] text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text {focusRing}"
                    aria-label={`Open ${stream.name}, ${streamLocation(stream)}, added ${formatAddedAt(stream.addedAt)}`}
                    on:click={() => openSaved(stream)}
                    on:contextmenu={(event) => openSavedStreamContextMenu(event, stream.id)}
                  >
                    <span class="truncate text-vlc-text">{stream.name}</span>
                    <span class="truncate">{streamLocation(stream)}</span>
                    <span class="text-right text-vlc-muted">{formatAddedAt(stream.addedAt)}</span>
                  </button>
                </li>
              {/each}
            </ul>
          </div>
        {:else}
          <div class="px-6 py-3" role="group" aria-label="Saved streams">
            <ul>
              {#each liveStreams as stream (stream.id)}
                <li>
                  <button
                    type="button"
                    class="grid h-7 w-full grid-cols-[1fr_180px] items-center gap-3 rounded-input px-2 text-left text-xs text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text {focusRing}"
                    aria-label={`Open ${stream.name}, ${streamLocation(stream)}`}
                    on:click={() => openSaved(stream)}
                    on:contextmenu={(event) => openSavedStreamContextMenu(event, stream.id)}
                  >
                    <span class="inline-flex min-w-0 items-center gap-2 text-vlc-text">
                      <Radio size={12} strokeWidth={1.75} class="shrink-0 text-vlc-muted" aria-hidden="true" />
                      <span class="truncate">{stream.name}</span>
                    </span>
                    <span class="truncate text-right text-vlc-muted">{streamLocation(stream)}</span>
                  </button>
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      {/if}

      {#if mediaItems.length > 0}
        {#if $networkViewMode === 'grid'}
          <div class="grid grid-cols-2 gap-x-5 gap-y-7 p-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {#each mediaItems as item (item.id)}
              <MediaCard
                {item}
                captureFrame={false}
                showMissingDuration={false}
                onSelect={playMedia}
                on:info={(event) => (detailsItemId = event.detail.id)}
              />
            {/each}
          </div>
        {:else if $networkViewMode === 'list'}
          <div class="p-6">
            <div
              class="overflow-hidden rounded-panel border border-vlc-border bg-vlc-panel"
              role="group"
              aria-label="Network media"
            >
              {#each mediaItems as item (item.id)}
                <MediaListRow
                  {item}
                  mode="list"
                  captureFrame={false}
                  showMissingDuration={false}
                  onSelect={playMedia}
                  on:info={(event) => (detailsItemId = event.detail.id)}
                />
              {/each}
            </div>
          </div>
        {:else}
          <div class="py-1" role="group" aria-label="Network media">
            {#each mediaItems as item (item.id)}
              <MediaListRow
                {item}
                mode="compact"
                captureFrame={false}
                showMissingDuration={false}
                onSelect={playMedia}
                on:info={(event) => (detailsItemId = event.detail.id)}
              />
            {/each}
          </div>
        {/if}
      {/if}
    {:else}
      <div class="flex h-full min-h-[360px] flex-col items-center justify-center px-6 text-center">
        <div
          class="mb-3 flex h-12 w-12 items-center justify-center rounded-panel border border-vlc-border bg-vlc-card text-vlc-muted"
        >
          {#if normalizedQuery}
            <Search size={22} strokeWidth={1.5} aria-hidden="true" />
          {:else if savedList || atRoot}
            <Radio size={22} strokeWidth={1.5} aria-hidden="true" />
          {:else if currentSource?.id === 'podcasts'}
            <Podcast size={22} strokeWidth={1.5} aria-hidden="true" />
          {:else}
            <Server size={22} strokeWidth={1.5} aria-hidden="true" />
          {/if}
        </div>

        {#if normalizedQuery}
          <p class="text-sm font-medium text-vlc-secondary">
            No results for “{query.trim()}”
          </p>
          <p class="mt-1 text-xs text-vlc-muted">Try a different name or clear the search.</p>
          <div class="mt-4">
            <button type="button" class={emptyActionClass} on:click={clearQuery}>Clear search</button>
          </div>
        {:else if savedMissing}
          <p class="text-sm font-medium text-vlc-secondary">This stream is no longer saved</p>
          <p class="mt-1 max-w-sm text-xs text-vlc-muted">
            It was removed from Saved Streams. Go back to the list to choose another.
          </p>
        {:else if savedList}
          <p class="text-sm font-medium text-vlc-secondary">{SOURCES[0].emptyTitle}</p>
          <p class="mt-1 max-w-sm text-xs text-vlc-muted">{SOURCES[0].emptyBody}</p>
          <div class="mt-4">
            <button type="button" class={emptyActionClass} on:click={openAddDialog}>Add stream</button>
          </div>
        {:else if scanning && scanState.status === 'loading'}
          <p class="text-sm font-medium text-vlc-secondary">Searching…</p>
          <p class="mt-1 max-w-md text-xs leading-5 text-vlc-muted">{scanState.message}</p>
        {:else if scanning && scanState.message}
          <p class="text-sm font-medium text-vlc-secondary">
            {currentSource?.emptyTitle ?? 'Nothing listed'}
          </p>
          <p class="mt-1 max-w-md text-xs leading-5 text-vlc-muted">{scanState.message}</p>
          {#if scanState.status === 'error'}
            <div class="mt-4">
              <button type="button" class={emptyActionClass} on:click={rescan}>Try again</button>
            </div>
          {/if}
        {:else if currentSource}
          <p class="text-sm font-medium text-vlc-secondary">{currentSource.emptyTitle}</p>
          <p class="mt-1 max-w-md text-xs leading-5 text-vlc-muted">{currentSource.emptyBody}</p>
        {/if}
      </div>
      {/if}
    {/if}
  </div>

  {#if statusMessage}
    <div
      class="pointer-events-none absolute bottom-6 right-6 z-20 rounded-control border border-vlc-borderStrong bg-vlc-panel px-3 py-2 text-[12px] text-vlc-text shadow-lg"
      role="status"
      aria-live="polite"
    >
      {statusMessage}
    </div>
  {/if}
</div>

<AddStreamDialog
  open={dialogOpen}
  mode={dialogMode}
  stream={editingStream}
  returnFocusTo={dialogTrigger}
  on:close={closeDialog}
  on:saved={handleStreamSaved}
/>
