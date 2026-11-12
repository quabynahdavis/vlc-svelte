import type { MusicSortKey } from "../../stores/music";
import type { MusicTrack } from "../../stores/musicLibrary";

export interface SortOption {
    key: MusicSortKey;
    label: string;
}

export interface ArtistEntry {
    name: string;
    albumCount: number;
    trackCount: number;
    duration: number;
    /** First track with artwork (else the first track) — the card cover source. */
    representative: MusicTrack | null;
}

export interface AlbumEntry {
    /** `artist\0album` identity used by `selectedAlbumId`. */
    key: string;
    artist: string;
    title: string;
    year: number | null;
    tracks: MusicTrack[];
    representative: MusicTrack | null;
}

export interface GenreEntry {
    name: string;
    trackCount: number;
    albumCount: number;
    duration: number;
}

/** A configured music root or one of its subfolders on the Folders tab. */
export interface MusicFolderCard {
    name: string;
    /** `Name[ParentName]` when duplicate-named roots need disambiguation. */
    displayName: string;
    /** Absolute folder path — doubles as the folder context-menu id. */
    path: string;
    directCount: number;
    totalTracks: number;
    duration: number;
    representative: MusicTrack | null;
}
