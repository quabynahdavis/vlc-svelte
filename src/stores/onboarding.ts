import { writable } from 'svelte/store';
import { createKeyWriter, loadPersistedRaw } from '../lib/dbPersistence';
import { hasTauri } from '../lib/tauriFs';

export interface OnboardingState {
  completed: boolean;
  completedAt: number | null;
}

const STORAGE_KEY = 'vlc.onboarding.v1';

function load(): OnboardingState {
  // Desktop shell: start uncompleted; the snapshot is applied by the boot
  // hydration. Browser preview keeps the direct localStorage read.
  if (hasTauri()) return { completed: false, completedAt: null };

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { completed: false, completedAt: null };

    const parsed = JSON.parse(raw) as Partial<OnboardingState> | null;
    if (!parsed || typeof parsed !== 'object') return { completed: false, completedAt: null };

    return {
      completed: parsed.completed === true,
      completedAt:
        typeof parsed.completedAt === 'number' && Number.isFinite(parsed.completedAt)
          ? parsed.completedAt
          : null,
    };
  } catch {
    return { completed: false, completedAt: null };
  }
}

export const onboarding = writable<OnboardingState>(load());

const writeState = createKeyWriter(STORAGE_KEY);
/** Set when a mutation lands before the SQLite snapshot has been applied. */
let changedSinceBoot = false;

function persist(state: OnboardingState): void {
  changedSinceBoot = true;
  void writeState(JSON.stringify(state));
}

// Desktop hydration: apply the persisted snapshot only when no mutation
// landed while reading.
void (async () => {
  const raw = await loadPersistedRaw(STORAGE_KEY);
  if (raw === null || changedSinceBoot) return;
  try {
    const parsed = JSON.parse(raw) as Partial<OnboardingState> | null;
    if (!parsed || typeof parsed !== 'object') return;
    onboarding.set({
      completed: parsed.completed === true,
      completedAt:
        typeof parsed.completedAt === 'number' && Number.isFinite(parsed.completedAt)
          ? parsed.completedAt
          : null,
    });
  } catch {
    // Malformed legacy blob: defaults stand.
  }
})();

export function completeOnboarding(): void {
  onboarding.set({ completed: true, completedAt: Date.now() });
  persist({ completed: true, completedAt: Date.now() });
}

export function resetOnboarding(): void {
  onboarding.set({ completed: false, completedAt: null });
  persist({ completed: false, completedAt: null });
}
