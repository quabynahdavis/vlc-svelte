/**
 * Parsers for podcast feeds and the public radio directories.
 *
 * Durations and artwork are copied only when the payload has them. A failed
 * or retired directory stays empty instead of being filled with placeholders.
 */

export type FeedEpisode = {
  title: string;
  url: string;
  durationSeconds?: number;
  thumbnailUrl?: string;
};

export type ParsedFeed = {
  title: string;
  episodes: FeedEpisode[];
};

export type DirectoryStation = {
  name: string;
  url: string;
};

export type JamendoTrack = {
  id: string;
  title: string;
  url: string;
  durationSeconds?: number;
  thumbnailUrl?: string;
};

const MAX_EPISODES = 200;
const MAX_STATIONS = 200;

export function decodeXml(input: string): string {
  return input.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (entity) => {
    const body = entity.slice(1, -1);
    if (body === 'amp') return '&';
    if (body === 'lt') return '<';
    if (body === 'gt') return '>';
    if (body === 'quot') return '"';
    if (body === 'apos') return "'";
    const hex = body.startsWith('#x') || body.startsWith('#X');
    const code = hex ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
    if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return entity;
    try {
      return String.fromCodePoint(code);
    } catch {
      return entity;
    }
  });
}

function stripCdata(value: string): string {
  const match = value.match(/<!\[CDATA\[([\s\S]*?)\]\]>/i);
  return match ? match[1] : value;
}

function textOf(block: string, localName: string): string {
  const pattern = new RegExp(
    `<(?:[\\w.-]+:)?${localName}\\b[^>]*>([\\s\\S]*?)</(?:[\\w.-]+:)?${localName}>`,
    'i',
  );
  const match = block.match(pattern);
  if (!match) return '';
  return decodeXml(stripCdata(match[1])).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function tagAttr(tag: string, name: string): string {
  const pattern = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i');
  const match = tag.match(pattern);
  return decodeXml((match?.[1] ?? match?.[2] ?? '').trim());
}

/** Seconds from `HH:MM:SS`, `MM:SS`, or a plain number. Zero and blanks are absent. */
export function parseClockDuration(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const whole = trimmed.split('.')[0] ?? trimmed;
  const parts = whole.split(':').map((part) => Number.parseInt(part, 10));
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) return undefined;
  let total = 0;
  if (parts.length === 1) total = parts[0] ?? 0;
  else if (parts.length === 2) total = (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
  else if (parts.length === 3) total = (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
  else return undefined;
  return total > 0 ? total : undefined;
}

function httpUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (!parsed.hostname) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function blocks(xml: string, localName: string): string[] {
  const pattern = new RegExp(
    `<(?:[\\w.-]+:)?${localName}\\b[\\s\\S]*?</(?:[\\w.-]+:)?${localName}>`,
    'gi',
  );
  return xml.match(pattern) ?? [];
}

function enclosureFrom(block: string): { url: string; durationSeconds?: number } | null {
  const tags = block.match(/<(?:enclosure|[\w.-]+:content|link)\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const rel = tagAttr(tag, 'rel').toLowerCase();
    const type = tagAttr(tag, 'type').toLowerCase();
    const medium = tagAttr(tag, 'medium').toLowerCase();
    const isEnclosure = /<enclosure\b/i.test(tag) || rel === 'enclosure' || medium === 'audio' || medium === 'video';
    if (!isEnclosure && !type.startsWith('audio/') && !type.startsWith('video/')) continue;
    if (type.startsWith('image/')) continue;
    const href = httpUrl(tagAttr(tag, 'url') || tagAttr(tag, 'href'));
    if (!href) continue;
    const durationSeconds = parseClockDuration(tagAttr(tag, 'duration'));
    return durationSeconds ? { url: href, durationSeconds } : { url: href };
  }
  return null;
}

function thumbnailFrom(block: string): string | undefined {
  const image = textOf(block, 'image') || textOf(block, 'thumbnail');
  const fromText = httpUrl(image);
  if (fromText) return fromText;
  const tags = block.match(/<(?:[\w.-]+:)?(?:image|thumbnail)\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const href = httpUrl(tagAttr(tag, 'href') || tagAttr(tag, 'url'));
    if (href) return href;
  }
  return undefined;
}

export function parseFeed(xml: string): ParsedFeed | null {
  const source = xml.trim();
  if (!source || (!/<rss\b/i.test(source) && !/<feed\b/i.test(source) && !/<channel\b/i.test(source))) {
    return null;
  }
  const itemSource = source.match(/<(?:rss|feed|channel)\b[\s\S]*$/i)?.[0] ?? source;
  const preamble = itemSource.split(/<(?:[\w.-]+:)?(?:item|entry)\b/i)[0] ?? itemSource;
  const title = textOf(preamble, 'title') || 'Podcast';
  const chunks = [...blocks(itemSource, 'item'), ...blocks(itemSource, 'entry')];
  const episodes: FeedEpisode[] = [];
  for (const chunk of chunks) {
    const media = enclosureFrom(chunk);
    if (!media) continue;
    const episodeTitle = textOf(chunk, 'title') || 'Episode';
    const episode: FeedEpisode = { title: episodeTitle.slice(0, 180), url: media.url };
    const duration =
      media.durationSeconds ??
      parseClockDuration(textOf(chunk, 'duration'));
    if (duration) episode.durationSeconds = duration;
    const thumbnail = thumbnailFrom(chunk);
    if (thumbnail) episode.thumbnailUrl = thumbnail;
    episodes.push(episode);
    if (episodes.length >= MAX_EPISODES) break;
  }
  if (!episodes.length && title === 'Podcast' && !textOf(preamble, 'title')) return null;
  return { title: title.slice(0, 180), episodes };
}

export function parseIcecastDirectory(xml: string): { stations: DirectoryStation[]; truncated: boolean } {
  const stations: DirectoryStation[] = [];
  let truncated = false;
  for (const entry of blocks(xml, 'entry')) {
    const url = httpUrl(textOf(entry, 'listen_url'));
    if (!url) continue;
    const named = textOf(entry, 'server_name');
    let name = named;
    if (!name) {
      try {
        name = new URL(url).host;
      } catch {
        name = 'Icecast stream';
      }
    }
    stations.push({ name: name.slice(0, 180), url });
    if (stations.length >= MAX_STATIONS) {
      truncated = blocks(xml, 'entry').length > MAX_STATIONS;
      break;
    }
  }
  return { stations, truncated };
}

export function parseJamendoTracks(body: string): { ok: true; tracks: JamendoTrack[] } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body) as unknown;
  } catch {
    return { ok: false, error: 'Jamendo did not return a track list.' };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'Jamendo did not return a track list.' };
  }
  const record = parsed as { headers?: { status?: string; error_message?: string }; results?: unknown };
  const status = record.headers?.status;
  if (status && status.toLowerCase() !== 'success') {
    const reason = record.headers?.error_message?.trim();
    return { ok: false, error: reason || 'Jamendo rejected the request.' };
  }
  if (!Array.isArray(record.results)) {
    return { ok: false, error: 'Jamendo did not return a track list.' };
  }
  const tracks: JamendoTrack[] = [];
  for (const entry of record.results) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as {
      id?: string | number;
      name?: string;
      audio?: string;
      duration?: number;
      image?: string;
    };
    const url = typeof row.audio === 'string' ? httpUrl(row.audio) : null;
    if (!url || typeof row.name !== 'string' || !row.name.trim()) continue;
    const track: JamendoTrack = {
      id: String(row.id ?? url).slice(0, 80),
      title: row.name.trim().slice(0, 180),
      url,
    };
    if (typeof row.duration === 'number' && Number.isFinite(row.duration) && row.duration > 0) {
      track.durationSeconds = Math.floor(row.duration);
    }
    if (typeof row.image === 'string') {
      const image = httpUrl(row.image);
      if (image) track.thumbnailUrl = image;
    }
    tracks.push(track);
    if (tracks.length >= 50) break;
  }
  return { ok: true, tracks };
}

/**
 * The legacy Shoutcast YP is retired. A body without station records is an
 * unavailable directory, not an empty catalog to invent.
 */
export function parseShoutcastDirectory(body: string): { available: boolean; stations: DirectoryStation[] } {
  if (!/<station\b/i.test(body)) {
    return { available: false, stations: [] };
  }
  const stations: DirectoryStation[] = [];
  const tags = body.match(/<station\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const name = tagAttr(tag, 'name') || tagAttr(tag, 'ct');
    if (!name) continue;
    const direct = httpUrl(tagAttr(tag, 'url') || tagAttr(tag, 'stream') || tagAttr(tag, 'listenurl'));
    const id = tagAttr(tag, 'id');
    const url = direct || (id && /^\d+$/.test(id) ? `http://yp.shoutcast.com/sbin/tunein-station.pls?id=${id}` : null);
    if (!url) continue;
    stations.push({ name: name.slice(0, 180), url });
    if (stations.length >= MAX_STATIONS) break;
  }
  if (!stations.length) return { available: false, stations: [] };
  return { available: true, stations };
}

export function normalizeFeedUrl(input: string): string | null {
  return httpUrl(input.trim());
}

/** Jamendo client ids are public app keys, never a built-in secret. */
export function normalizeJamendoClientId(input: string): string | null {
  const trimmed = input.trim();
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(trimmed)) return null;
  return trimmed;
}
