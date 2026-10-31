import { writable } from 'svelte/store';

export interface OnboardingState {
  completed: boolean;
  completedAt: number | null;
}

const STORAGE_KEY = 'vlc.onboarding.v1';

function load(): OnboardingState {
  if (typeof localStorage === 'undefined') {
    return { completed: false, completedAt: null };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
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

function persist(state: OnboardingState): void {
  if (typeof localStorage === 'undefined') return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage can be unavailable in private windows; the session still works.
  }
}

export function completeOnboarding(): void {
  onboarding.set({ completed: true, completedAt: Date.now() });
  persist({ completed: true, completedAt: Date.now() });
}

export function resetOnboarding(): void {
  onboarding.set({ completed: false, completedAt: null });
  persist({ completed: false, completedAt: null });
}
