export function hasTauri(): boolean {
	return '__TAURI_INTERNALS__' in window;
}

export async function invokeCommand<T>(cmd: string, args?: any): Promise<T | null> {
	try {
		const { invoke } = await import('@tauri-apps/api/core');
		return await invoke<T>(cmd, args);
	} catch (e) {
		console.warn(`Tauri invoke failed for "${cmd}":`, e);
		return null;
	}
}

/**
 * Native OS folder picker shown by the desktop shell (Tauri dialog plugin).
 * Returns the picked absolute folder path, or null when cancelled or when the
 * dialog is unavailable. Browser callers fall back to the webkitdirectory
 * input instead.
 */
export async function pickFolderViaDialog(): Promise<string | null> {
	try {
		const dialog = await import('@tauri-apps/plugin-dialog');
		const picked = await dialog.open({
			directory: true,
			multiple: false,
			title: 'Add folder to library',
		});
		return typeof picked === 'string' && picked.length > 0 ? picked : null;
	} catch (e) {
		console.warn('Folder dialog failed:', e);
		return null;
	}
}

export async function toFileSrc(absPath: string): Promise<string | null> {
	try {
		const fileSrc = await import('@tauri-apps/api/core').then(m => m.convertFileSrc(absPath));
		return fileSrc;
	} catch (e) {
		console.warn(`Failed to convert file src for "${absPath}":`, e);
		return null;
	}
}

// TS types mirroring ScanResult/ScannedFolder/ScannedFile — Tauri serializes
// the Rust structs with #[serde(rename_all = "camelCase")], so every multi-word
// field arrives camelCased over IPC.
export interface ScannedFile {
	name: string;
	relativePath: string;
	path: string;
	sizeBytes: number;
}

export interface ScannedFolder {
	name: string;
	path: string;
	files: number;
	total: number;
}

export interface ScanResult {
	root: string;
	folders: ScannedFolder[];
	files: ScannedFile[];
}