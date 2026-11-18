/**
 * Loads one Network drill-in level from a real scan.
 *
 * UPnP and SMB run in the desktop shell. Podcast feeds and the public
 * directories use a timed fetch. Every failure is a message, never a made-up row.
 */
import { hasTauri, invokeCommand } from './tauriFs';
import {
  parseFeed,
  parseIcecastDirectory,
  parseJamendoTracks,
  parseShoutcastDirectory,
  type FeedEpisode,
} from './networkParse';
import { renamePodcastSubscription, type PodcastSubscription } from '../stores/network';

export type ScanFolder = {
  id: string;
  title: string;
  summary: string;
  icon: string;
};

export type ScanMedia = {
  id: string;
  title: string;
  url: string;
  durationSeconds?: number;
  thumbnailUrl?: string;
};

export type LoadedLevel = {
  status: 'ready' | 'error';
  folders: ScanFolder[];
  media: ScanMedia[];
  message: string;
  note: string;
};

type FetchText = {
  ok: boolean;
  status: number;
  body: string;
  error: string | null;
};

type UpnpServer = {
  name: string;
  location: string;
  controlUrl: string | null;
};

type UpnpScan = {
  servers: UpnpServer[];
  error: string | null;
};

type UpnpEntry = {
  id: string;
  title: string;
  container: boolean;
  url: string | null;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
};

type UpnpBrowse = {
  ok: boolean;
  error: string | null;
  entries: UpnpEntry[];
};

type SmbShare = {
  server: string;
  name: string;
  comment: string;
};

type SmbScan = {
  shares: SmbShare[];
  message: string | null;
  toolMissing: boolean;
};

type SmbEntry = {
  name: string;
  directory: boolean;
};

type SmbBrowse = {
  ok: boolean;
  error: string | null;
  entries: SmbEntry[];
};

const upnpServers = new Map<string, UpnpServer>();
const smbShares = new Map<string, SmbShare>();

const ICECAST_URL = 'https://dir.xiph.org/yp.xml';
const SHOUTCAST_URL = 'http://yp.shoutcast.com/sbin/newxml.phtml';
const JAMENDO_URL = 'https://api.jamendo.com/v3.0/tracks/';

const ready = (partial: Partial<LoadedLevel> = {}): LoadedLevel => ({
  status: 'ready',
  folders: [],
  media: [],
  message: '',
  note: '',
  ...partial,
});

const failed = (message: string): LoadedLevel => ready({ status: 'error', message });

function withTimeout<T>(promise: Promise<T | null>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

export async function fetchText(url: string, maxBytes: number, timeoutMs = 8000): Promise<FetchText> {
  if (hasTauri()) {
    const result = await withTimeout(
      invokeCommand<FetchText>('network_fetch_text', { url, maxBytes }),
      timeoutMs + 2000,
    );
    if (!result) {
      return { ok: false, status: 0, body: '', error: 'The request timed out.' };
    }
    return result;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: '*/*' },
    });
    const body = (await response.text()).slice(0, maxBytes);
    if (!response.ok) {
      return { ok: false, status: response.status, body, error: `The server returned ${response.status}.` };
    }
    return { ok: true, status: response.status, body, error: null };
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === 'AbortError';
    return {
      ok: false,
      status: 0,
      body: '',
      error: aborted
        ? 'The request timed out.'
        : 'The request failed. The desktop app can reach addresses this preview cannot.',
    };
  } finally {
    clearTimeout(timer);
  }
}

function segment(value: string): string {
  return encodeURIComponent(value);
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function mediaFromEpisode(prefix: string, episode: FeedEpisode, index: number): ScanMedia {
  const media: ScanMedia = {
    id: `${prefix}:${index}:${episode.url}`,
    title: episode.title,
    url: episode.url,
  };
  if (episode.durationSeconds) media.durationSeconds = episode.durationSeconds;
  if (episode.thumbnailUrl) media.thumbnailUrl = episode.thumbnailUrl;
  return media;
}

async function loadUpnp(path: readonly string[]): Promise<LoadedLevel> {
  if (!hasTauri()) {
    return failed('UPnP discovery runs in the desktop app, which can send an SSDP search on this network.');
  }
  if (path.length === 2) {
    const scanned = await withTimeout(invokeCommand<UpnpScan>('network_discover_upnp'), 14000);
    if (!scanned) return failed('UPnP discovery timed out. You can go back and try again.');
    upnpServers.clear();
    for (const server of scanned.servers ?? []) {
      if (server?.location) upnpServers.set(server.location, server);
    }
    const folders = (scanned.servers ?? []).filter((server) => server?.location).map((server) => ({
      id: segment(server.location),
      title: server.name || 'Media server',
      summary: server.controlUrl ? 'Content directory' : 'Discovered server',
      icon: 'upnp',
    }));
    if (!folders.length) {
      return ready({
        message: scanned.error || 'No UPnP or DLNA media servers answered the search on this network.',
        status: scanned.error ? 'error' : 'ready',
      });
    }
    return ready({ folders });
  }

  const location = decodeSegment(path[2] ?? '');
  let server = upnpServers.get(location);
  if (!server) {
    const scanned = await withTimeout(invokeCommand<UpnpScan>('network_discover_upnp'), 14000);
    for (const found of scanned?.servers ?? []) {
      if (found?.location) upnpServers.set(found.location, found);
    }
    server = upnpServers.get(location);
  }
  if (!server) {
    return failed('That media server is no longer in the search results.');
  }
  if (!server.controlUrl) {
    return ready({
      message: `${server.name} answered discovery, but it did not advertise a ContentDirectory to browse.`,
    });
  }
  const objectId = path.length > 3 ? decodeSegment(path[path.length - 1] ?? '0') : '0';
  const browsed = await withTimeout(
    invokeCommand<UpnpBrowse>('network_browse_upnp', { controlUrl: server.controlUrl, objectId }),
    12000,
  );
  if (!browsed) return failed(`${server.name} did not answer the browse in time.`);
  if (!browsed.ok) {
    return ready({
      message: browsed.error || `${server.name} answered discovery, but its folders could not be browsed.`,
    });
  }
  const folders: ScanFolder[] = [];
  const media: ScanMedia[] = [];
  for (const entry of browsed.entries ?? []) {
    if (!entry?.title) continue;
    if (entry.container) {
      folders.push({
        id: segment(entry.id),
        title: entry.title,
        summary: 'Folder',
        icon: 'folder',
      });
      continue;
    }
    if (!entry.url) continue;
    const item: ScanMedia = {
      id: `upnp:${location}:${entry.id}`,
      title: entry.title,
      url: entry.url,
    };
    if (entry.durationSeconds && entry.durationSeconds > 0) item.durationSeconds = entry.durationSeconds;
    if (entry.thumbnailUrl) item.thumbnailUrl = entry.thumbnailUrl;
    media.push(item);
  }
  return ready({
    folders,
    media,
    message: folders.length || media.length ? '' : 'This folder has nothing to show.',
    note: (browsed.entries ?? []).length >= 100 ? 'Showing the first 100 results from this folder.' : '',
  });
}

async function loadSmb(path: readonly string[]): Promise<LoadedLevel> {
  if (!hasTauri()) {
    return failed('SMB browsing runs in the desktop app.');
  }
  if (path.length === 2) {
    const scanned = await withTimeout(invokeCommand<SmbScan>('network_discover_smb'), 12000);
    if (!scanned) return failed('SMB browsing timed out. You can go back and try again.');
    smbShares.clear();
    const folders: ScanFolder[] = [];
    for (const share of scanned.shares ?? []) {
      if (!share?.server || !share.name) continue;
      const id = segment(`${share.server}/${share.name}`);
      smbShares.set(id, share);
      folders.push({
        id,
        title: share.name,
        summary: share.comment ? `${share.server} · ${share.comment}` : share.server,
        icon: 'smb',
      });
    }
    if (!folders.length) {
      return ready({
        message: scanned.message || 'No shared folders were found.',
        status: scanned.message ? 'error' : 'ready',
      });
    }
    return ready({ folders });
  }

  const shareId = path[2] ?? '';
  let share = smbShares.get(shareId);
  if (!share) {
    const scanned = await withTimeout(invokeCommand<SmbScan>('network_discover_smb'), 12000);
    for (const found of scanned?.shares ?? []) {
      if (!found?.server || !found.name) continue;
      smbShares.set(segment(`${found.server}/${found.name}`), found);
    }
    share = smbShares.get(shareId);
  }
  if (!share) return failed('That share is no longer in the list.');
  const relative = path.slice(3).map(decodeSegment).join('/');
  const browsed = await withTimeout(
    invokeCommand<SmbBrowse>('network_browse_smb', {
      server: share.server,
      share: share.name,
      path: relative,
    }),
    12000,
  );
  if (!browsed) return failed(`Listing ${share.name} timed out.`);
  if (!browsed.ok) {
    return ready({ message: browsed.error || `${share.name} is visible, but its contents could not be listed.` });
  }
  const folders: ScanFolder[] = [];
  const media: ScanMedia[] = [];
  const base = [share.server, share.name, ...path.slice(3).map(decodeSegment)];
  for (const entry of browsed.entries ?? []) {
    if (!entry?.name) continue;
    if (entry.directory) {
      folders.push({ id: segment(entry.name), title: entry.name, summary: 'Folder', icon: 'folder' });
      continue;
    }
    const url = `smb://${[...base, entry.name].map(encodeURIComponent).join('/')}`;
    media.push({ id: url, title: entry.name, url });
  }
  return ready({
    folders,
    media,
    message: folders.length || media.length ? '' : 'This folder has nothing to show.',
  });
}

function loadPodcastList(podcasts: readonly PodcastSubscription[]): LoadedLevel {
  return ready({
    folders: podcasts.map((subscription) => ({
      id: subscription.id,
      title: subscription.title,
      summary: subscription.feedUrl,
      icon: 'podcasts',
    })),
    message: podcasts.length ? '' : 'Add an RSS or Atom feed URL. Episodes from that feed are listed here.',
  });
}

async function loadPodcastShow(subscription: PodcastSubscription | undefined): Promise<LoadedLevel> {
  if (!subscription) return failed('That podcast is no longer subscribed.');
  const fetched = await fetchText(subscription.feedUrl, 2_000_000, 8000);
  if (!fetched.ok) {
    return failed(fetched.error || 'The feed could not be loaded. The subscription is still saved.');
  }
  const feed = parseFeed(fetched.body);
  if (!feed) return failed('That address did not return an RSS or Atom feed.');
  if (feed.title && feed.title !== subscription.title) renamePodcastSubscription(subscription.id, feed.title);
  const media = feed.episodes.map((episode, index) => mediaFromEpisode(subscription.id, episode, index));
  return ready({
    media,
    message: media.length ? '' : 'This feed has no audio episodes.',
    note: feed.episodes.length >= 200 ? 'Showing the first 200 episodes.' : '',
  });
}

export async function previewPodcastFeed(url: string): Promise<{ ok: true; feed: { title: string; episodes: FeedEpisode[] } } | { ok: false; error: string }> {
  const fetched = await fetchText(url, 2_000_000, 8000);
  if (!fetched.ok) return { ok: false, error: fetched.error || 'The feed could not be loaded.' };
  const feed = parseFeed(fetched.body);
  if (!feed) return { ok: false, error: 'That address did not return an RSS or Atom feed.' };
  if (!feed.episodes.length) return { ok: false, error: 'That feed has no audio episodes.' };
  return { ok: true, feed };
}

async function loadIcecast(): Promise<LoadedLevel> {
  const fetched = await fetchText(ICECAST_URL, 8_000_000, 12000);
  if (!fetched.ok) {
    return failed(fetched.error || 'The Icecast directory could not be loaded.');
  }
  const parsed = parseIcecastDirectory(fetched.body);
  if (!parsed.stations.length) {
    return ready({ message: 'The Icecast directory returned no stations.' });
  }
  return ready({
    media: parsed.stations.map((station) => ({
      id: `icecast:${station.url}`,
      title: station.name,
      url: station.url,
    })),
    note: parsed.truncated ? 'Showing the first 200 stations that published a stream URL.' : '',
  });
}

async function loadJamendo(clientId: string): Promise<LoadedLevel> {
  if (!clientId) {
    return ready({
      message: 'Jamendo needs a client id before any albums can be listed. No client id is configured.',
    });
  }
  const url = new URL(JAMENDO_URL);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '50');
  const fetched = await fetchText(url.href, 2_000_000, 8000);
  if (!fetched.ok) return failed(fetched.error || 'Jamendo could not be loaded.');
  const parsed = parseJamendoTracks(fetched.body);
  if (!parsed.ok) return failed(parsed.error);
  if (!parsed.tracks.length) return ready({ message: 'Jamendo returned no tracks.' });
  return ready({
    media: parsed.tracks.map((track) => {
      const item: ScanMedia = { id: `jamendo:${track.id}`, title: track.title, url: track.url };
      if (track.durationSeconds) item.durationSeconds = track.durationSeconds;
      if (track.thumbnailUrl) item.thumbnailUrl = track.thumbnailUrl;
      return item;
    }),
  });
}

async function loadShoutcast(): Promise<LoadedLevel> {
  const fetched = await fetchText(SHOUTCAST_URL, 2_000_000, 8000);
  if (!fetched.ok) {
    return failed('The Shoutcast directory is unavailable.');
  }
  const parsed = parseShoutcastDirectory(fetched.body);
  if (!parsed.available) return failed('The Shoutcast directory is unavailable.');
  return ready({
    media: parsed.stations.map((station) => ({
      id: `shoutcast:${station.url}`,
      title: station.name,
      url: station.url,
    })),
  });
}

export function isScannedPath(path: readonly string[]): boolean {
  if (path[0] === 'local' && (path[1] === 'upnp' || path[1] === 'smb')) return true;
  return path[0] === 'podcasts' || path[0] === 'icecast' || path[0] === 'jamendo' || path[0] === 'shoutcast';
}

export async function loadNetworkLevel(
  path: readonly string[],
  ctx: { podcasts: readonly PodcastSubscription[]; jamendoClientId: string },
): Promise<LoadedLevel> {
  try {
    if (path[0] === 'local' && path[1] === 'upnp') return await loadUpnp(path);
    if (path[0] === 'local' && path[1] === 'smb') return await loadSmb(path);
    if (path[0] === 'podcasts' && path.length === 1) return loadPodcastList(ctx.podcasts);
    if (path[0] === 'podcasts') {
      return await loadPodcastShow(ctx.podcasts.find((subscription) => subscription.id === path[1]));
    }
    if (path[0] === 'icecast') return await loadIcecast();
    if (path[0] === 'jamendo') return await loadJamendo(ctx.jamendoClientId);
    if (path[0] === 'shoutcast') return await loadShoutcast();
    return ready();
  } catch {
    return failed('The scan failed. The rest of Network is still available.');
  }
}
