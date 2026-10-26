export type NavId =
  | 'home'
  | 'videos'
  | 'music'
  | 'network'
  | 'playlists'
  | 'recent';

export type RailItemId = NavId | 'add';

export interface NavItem {
  id: RailItemId;
  label: string;
  icon: string;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'home', label: 'Home', icon: 'Home' },
  { id: 'videos', label: 'Videos', icon: 'Video' },
  { id: 'music', label: 'Music', icon: 'Music' },
  { id: 'network', label: 'Network', icon: 'Radio' },
  { id: 'playlists', label: 'Playlists', icon: 'ListVideo' },
  { id: 'recent', label: 'Recent', icon: 'History' },
];

export const ADD_ITEM: NavItem = {
  id: 'add',
  label: 'Add Item',
  icon: 'Plus',
};

export const NAV_LABELS: Record<NavId, string> = {
  home: 'Home',
  videos: 'Videos',
  music: 'Music',
  network: 'Network',
  playlists: 'Playlists',
  recent: 'Recent',
};
