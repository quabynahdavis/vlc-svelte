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
}

export const showsBreadcrumb: string[] = ['Videos', 'Shows', 'The Wand', 'S01'];

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
  };
});
