/**
 * Mock media library used by the browse/library phase.
 *
 * Layout mirrors the "The Wand" season export: newest episodes first, then
 * the four watched episodes that close out the season.
 */
export interface MediaItem {
  id: string;
  title: string;
  season: number;
  episode: number;
  durationSeconds: number;
  /** Playback position from 0 to 1; 0 hides the card's progress bar. */
  progress: number;
  /** Optional artwork. No artwork is bundled yet, so cards fall back to a placeholder. */
  thumbnailPath?: string;
  /** Optional local media source. Demo library items point at the bundled sample clip. */
  src?: string;
}

/** Small bundled clip used by the demo library and music queues. */
export const DEMO_MEDIA_SRC = '/demo/sample.mp4';

export const showsBreadcrumb: string[] = ['Videos', 'Shows', 'The Wand', 'S01'];

/** Music domain types */
export interface Track {
  id: string;
  title: string;
  artistId: string;
  albumId: string;
  durationSeconds: number;
  trackNumber: number;
}

export interface Album {
  id: string;
  title: string;
  artistId: string;
  year: number;
  trackCount: number;
  durationSeconds: number;
  tracks: Track[];
}

export interface Artist {
  id: string;
  name: string;
  albumCount: number;
  albums: Album[];
}

/** Network domain types */
export type NetworkCategory =
  | 'Local Network'
  | 'Podcasts'
  | 'Internet Radio'
  | 'Shoutcast'
  | 'Jamendo'
  | 'Icecast'
  | 'Custom URL';

export interface RadioStation {
  id: string;
  name: string;
  genre: string;
  bitrate: number;
  country: string;
  streamUrl: string;
}

export interface PodcastShow {
  id: string;
  title: string;
  author: string;
  episodeCount: number;
}

export interface PodcastEpisode {
  id: string;
  showId: string;
  title: string;
  published: string; // ISO date
  durationSeconds: number;
}

/** Recent domain types */
export type RecentItemType = 'media' | 'device' | 'network';
export interface RecentMediaItem {
  id: string;
  type: RecentItemType;
  title: string;
  source: string;
  timestamp: number; // epoch ms
  duration?: number;
  thumbnailPath?: string;
}

/** Playlists domain types */
export interface PlaylistTrack {
  id: string;
  title: string;
  artist: string;
  durationSeconds: number;
  source?: string;
}

export interface Playlist {
  id: string;
  name: string;
  trackCount: number;
  totalDurationSeconds: number;
  lastModified: number; // epoch ms
  tracks: PlaylistTrack[];
}

/** Exact display order from the reference screenshot. */
const EPISODE_ORDER = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 1, 2, 3, 4];

const EPISODE_DURATIONS = [
  1384, 1461, 1402, 1517, 1350, 1288, 1436, 1499, 1424, 1337, 1552, 1391, 1478, 1309, 1445,
];

/** The first four episodes were watched almost to the end. */
const WATCHED_PROGRESS: Record<number, number> = {
  1: 0.94,
  2: 0.98,
  3: 1,
  4: 0.96,
};

export const showsItems: MediaItem[] = EPISODE_ORDER.map((episode) => {
  const episodeCode = `S01E${String(episode).padStart(2, '0')}`;

  return {
    id: `the-wand-${episodeCode.toLowerCase()}`,
    title: `The_Wand_${episodeCode}.mp4`,
    season: 1,
    episode,
    durationSeconds: EPISODE_DURATIONS[episode - 1],
    progress: episode <= 4 ? WATCHED_PROGRESS[episode] ?? 1 : 0,
    thumbnailPath: undefined,
    src: DEMO_MEDIA_SRC,
  };
});

/* ---------- Music mock ---------- */
const ARTIST_NAMES = [
  'Nirvana', 'Radiohead', 'Tame Impala', 'Fleetwood Mac', 'Beyoncé', 'Kendrick Lamar', 'Ariana Grande', 'The Weeknd', 'Daft Punk', 'Billie Eilish', 'Coldplay', 'Lorde'
];

function makeTracks(artistId: string, albumId: string, count: number): Track[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${artistId}-${albumId}-${i + 1}`,
    title: `Track ${i + 1}`,
    artistId,
    albumId,
    durationSeconds: 180 + Math.floor(Math.random() * 150),
    trackNumber: i + 1,
  }));
}

function makeAlbums(artistId: string, artistName: string, numAlbums: number): Album[] {
  return Array.from({ length: numAlbums }, (_, i) => {
    const count = 8 + Math.floor(Math.random() * 5);
    const tracks = makeTracks(artistId, `${artistId}-a${i + 1}`, count);
    const total = tracks.reduce((a, t) => a + t.durationSeconds, 0);
    return {
      id: `${artistId}-a${i + 1}`,
      title: `${artistName} Album ${i + 1}`,
      artistId,
      year: 2000 + Math.floor(Math.random() * 24),
      trackCount: count,
      durationSeconds: total,
      tracks,
    };
  });
}

export const artists: Artist[] = ARTIST_NAMES.map((name, i) => {
  const id = `artist-${i + 1}`;
  const numAlbums = 4 + Math.floor(Math.random() * 3);
  const albums = makeAlbums(id, name, numAlbums);
  return { id, name, albumCount: albums.length, albums };
});

/* ---------- Network mock ---------- */
export const networkCategories: NetworkCategory[] = [
  'Local Network', 'Podcasts', 'Internet Radio', 'Shoutcast', 'Jamendo', 'Icecast', 'Custom URL'
];

export const radioStations: RadioStation[] = Array.from({ length: 30 }, (_, i) => ({
  id: `station-${i + 1}`,
  name: `Station ${i + 1} FM`,
  genre: ['Rock', 'Pop', 'Jazz', 'Electronic', 'Hip-Hop', 'Classical'][i % 6],
  bitrate: [128, 192, 256, 320][i % 4],
  country: ['US', 'UK', 'DE', 'FR', 'JP', 'CA'][i % 6],
  streamUrl: `http://stream${i + 1}.example.com/stream`,
}));

export const podcastShows: PodcastShow[] = Array.from({ length: 8 }, (_, i) => ({
  id: `podcast-${i + 1}`,
  title: `Podcast Show ${i + 1}`,
  author: `Author ${i + 1}`,
  episodeCount: 10,
}));

export const podcastEpisodes: PodcastEpisode[] = podcastShows.flatMap(show =>
  Array.from({ length: 10 }, (_, i) => ({
    id: `${show.id}-ep${i + 1}`,
    showId: show.id,
    title: `Episode ${i + 1} - ${show.title}`,
    published: new Date(Date.now() - i * 86400000 * 7).toISOString().split('T')[0],
    durationSeconds: 600 + Math.floor(Math.random() * 1800),
  }))
);

/* ---------- Recent mock ---------- */
function daysAgo(d: number) {
  return Date.now() - d * 86400000;
}

export const recentMediaItems: RecentMediaItem[] = [
  { id: 'r1', type: 'media', title: 'The_Wand_S01E05.mp4', source: 'Videos/Shows/The Wand', timestamp: daysAgo(0), duration: 1384 },
  { id: 'r2', type: 'media', title: 'Track 03 - Nirvana Album 1.mp3', source: 'Music/Nirvana', timestamp: daysAgo(0), duration: 210 },
  { id: 'r3', type: 'device', title: '/media/external/Drive1', source: 'Devices', timestamp: daysAgo(1) },
  { id: 'r4', type: 'network', title: 'Station 12 FM', source: 'Internet Radio', timestamp: daysAgo(1) },
  { id: 'r5', type: 'media', title: 'The_Wand_S01E06.mp4', source: 'Videos/Shows/The Wand', timestamp: daysAgo(2), duration: 1461 },
  { id: 'r6', type: 'media', title: 'The_Wand_S01E07.mp4', source: 'Videos/Shows/The Wand', timestamp: daysAgo(3), duration: 1402 },
  { id: 'r7', type: 'device', title: 'Network Share - Living Room', source: 'Local Network', timestamp: daysAgo(4) },
  { id: 'r8', type: 'network', title: 'Podcast Show 3 - Episode 4', source: 'Podcasts', timestamp: daysAgo(5), duration: 1200 },
  { id: 'r9', type: 'media', title: 'Fleetwood Mac Album 2 Track 5.mp3', source: 'Music/Fleetwood Mac', timestamp: daysAgo(7), duration: 240 },
  { id: 'r10', type: 'media', title: 'The_Wand_S01E01.mp4', source: 'Videos/Shows/The Wand', timestamp: daysAgo(10), duration: 1391 },
  { id: 'r11', type: 'device', title: '/media/usb/Backup', source: 'Devices', timestamp: daysAgo(12) },
  { id: 'r12', type: 'network', title: 'Station 2 FM', source: 'Internet Radio', timestamp: daysAgo(15) },
];

export const recentItems = recentMediaItems.sort((a, b) => b.timestamp - a.timestamp);

/* ---------- Playlists mock ---------- */
export const playlists: Playlist[] = [
  {
    id: 'pl-1',
    name: 'Cool Songs',
    trackCount: 12,
    totalDurationSeconds: 0,
    lastModified: daysAgo(0),
    tracks: Array.from({ length: 12 }, (_, i) => ({
      id: `pt-${i + 1}`,
      title: `Song ${i + 1}`,
      artist: ARTIST_NAMES[i % ARTIST_NAMES.length],
      durationSeconds: 180 + Math.floor(Math.random() * 150),
    })),
  },
  {
    id: 'pl-2',
    name: 'Anime to Watch',
    trackCount: 8,
    totalDurationSeconds: 0,
    lastModified: daysAgo(2),
    tracks: Array.from({ length: 8 }, (_, i) => ({
      id: `pt-a-${i + 1}`,
      title: `Anime Track ${i + 1}`,
      artist: 'Various Artists',
      durationSeconds: 200 + Math.floor(Math.random() * 120),
    })),
  },
  {
    id: 'pl-3',
    name: 'Workout Mix',
    trackCount: 15,
    totalDurationSeconds: 0,
    lastModified: daysAgo(1),
    tracks: Array.from({ length: 15 }, (_, i) => ({
      id: `pt-w-${i + 1}`,
      title: `Workout ${i + 1}`,
      artist: ARTIST_NAMES[(i + 3) % ARTIST_NAMES.length],
      durationSeconds: 180 + Math.floor(Math.random() * 180),
    })),
  },
].map(pl => ({
  ...pl,
  totalDurationSeconds: pl.tracks.reduce((a, t) => a + t.durationSeconds, 0),
}));
