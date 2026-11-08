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