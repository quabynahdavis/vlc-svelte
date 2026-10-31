<script lang="ts">
  import { BookmarkPlus, Check, Pencil, Trash2 } from 'lucide-svelte';
  import {
    DEFAULT_PROFILE,
    MAX_PROFILE_NAME_LENGTH,
    MAX_PROFILES,
    applyProfile,
    deleteProfile,
    isBuiltInProfile,
    profileMatchesCurrentSettings,
    profiles,
    renameProfile,
    saveCurrentAsProfile,
    type SettingsProfile,
  } from '../../stores/settingsProfiles';
  import Section from './Section.svelte';

  let newName = '';
  let saveError = '';
  let notice = '';
  let noticeTimer: ReturnType<typeof setTimeout> | null = null;

  let pendingApplyId: string | null = null;
  let pendingDeleteId: string | null = null;

  let renamingId: string | null = null;
  let renameValue = '';
  let renameError = '';

  const dateFormatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  $: allProfiles = [DEFAULT_PROFILE, ...$profiles];
  $: savedCount = $profiles.length;

  function formatUpdated(profile: SettingsProfile): string {
    if (isBuiltInProfile(profile)) return 'Built-in defaults · read-only';
    return `Updated ${dateFormatter.format(new Date(profile.updatedAt))}`;
  }

  function showNotice(message: string): void {
    notice = message;
    if (noticeTimer !== null) clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
      notice = '';
      noticeTimer = null;
    }, 4000);
  }

  function handleSave(): void {
    const result = saveCurrentAsProfile(newName);
    if (!result.ok) {
      saveError = result.error;
      return;
    }

    saveError = '';
    newName = '';
    pendingApplyId = null;
    showNotice(`Saved “${result.profile.name}”.`);
  }

  function requestApply(profile: SettingsProfile): void {
    pendingDeleteId = null;
    renamingId = null;
    renameError = '';

    // Applying a profile identical to the current settings loses nothing, so
    // skip the inline confirmation in that case.
    if (profileMatchesCurrentSettings(profile)) {
      applyNow(profile);
      return;
    }

    pendingApplyId = profile.id;
  }

  function applyNow(profile: SettingsProfile): void {
    if (!applyProfile(profile.id)) {
      pendingApplyId = null;
      return;
    }
    pendingApplyId = null;
    showNotice(`Applied “${profile.name}”.`);
  }

  function startRename(profile: SettingsProfile): void {
    pendingApplyId = null;
    pendingDeleteId = null;
    renamingId = profile.id;
    renameValue = profile.name;
    renameError = '';
  }

  function cancelRename(): void {
    renamingId = null;
    renameValue = '';
    renameError = '';
  }

  function commitRename(): void {
    if (renamingId === null) return;

    const result = renameProfile(renamingId, renameValue);
    if (!result.ok) {
      renameError = result.error;
      return;
    }

    showNotice(`Renamed to “${renameValue.trim()}”.`);
    cancelRename();
  }

  function requestDelete(profile: SettingsProfile): void {
    pendingApplyId = null;
    renamingId = null;
    pendingDeleteId = pendingDeleteId === profile.id ? null : profile.id;
  }

  function confirmDelete(profile: SettingsProfile): void {
    if (deleteProfile(profile.id)) showNotice(`Deleted “${profile.name}”.`);
    pendingDeleteId = null;
  }
</script>

<div class="flex flex-col gap-9 pb-4">
  <Section title="Settings profiles">
    <p class="mb-5 max-w-[640px] text-[13px] leading-5 text-vlc-muted">
      Profiles are snapshots of every setting on this device. Save your current setup, then switch
      between them without losing your place.
    </p>

    <form
      class="flex flex-col gap-2 rounded-[10px] border border-vlc-border bg-vlc-card p-4 sm:flex-row sm:items-start"
      on:submit|preventDefault={handleSave}
    >
      <label class="min-w-0 flex-1">
        <span class="mb-1.5 block text-[12px] text-vlc-secondary">Profile name</span>
        <input
          bind:value={newName}
          type="text"
          maxlength={MAX_PROFILE_NAME_LENGTH}
          placeholder="e.g. Home theater"
          autocomplete="off"
          aria-label="New profile name"
          class="h-9 w-full rounded-[8px] border border-vlc-border bg-vlc-app px-3 text-[13px] text-vlc-text outline-none transition-colors placeholder:text-vlc-muted focus:border-vlc-orange/70 focus-visible:ring-2 focus-visible:ring-vlc-orange/40"
          on:input={() => (saveError = '')}
        />
      </label>
      <button
        type="submit"
        class="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 self-end rounded-[8px] bg-vlc-orange px-4 text-[13px] font-medium text-vlc-app transition-colors hover:bg-vlc-orangeDark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60 focus-visible:ring-offset-2 focus-visible:ring-offset-vlc-card"
      >
        <BookmarkPlus size={15} strokeWidth={1.9} aria-hidden="true" />
        Save current settings as profile
      </button>
    </form>

    {#if saveError}
      <p class="mt-2 text-[12px] text-vlc-danger" role="alert">{saveError}</p>
    {/if}
    {#if notice}
      <p class="mt-2 inline-flex items-center gap-1.5 text-[12px] text-vlc-secondary" role="status">
        <Check size={13} strokeWidth={2} aria-hidden="true" />
        {notice}
      </p>
    {/if}

    <p class="mt-4 text-[12px] text-vlc-muted">
      {savedCount} of {MAX_PROFILES} profiles used. Profiles are stored on this device.
    </p>
  </Section>

  <Section title="Saved profiles">
    {#if savedCount === 0}
      <div class="rounded-[10px] border border-dashed border-vlc-borderStrong px-5 py-8 text-center">
        <p class="text-[13px] text-vlc-secondary">No saved profiles yet</p>
        <p class="mx-auto mt-1 max-w-[420px] text-[12px] leading-5 text-vlc-muted">
          Give your current settings a name above to create your first profile. The built-in Default
          profile is always available.
        </p>
      </div>
    {/if}

    <ul class="mt-3 flex flex-col gap-2">
      {#each allProfiles as profile (profile.id)}
        {@const builtIn = isBuiltInProfile(profile)}
        <li class="rounded-[10px] border border-vlc-border bg-vlc-card p-3.5">
          <div class="flex flex-wrap items-center gap-3">
            <div class="min-w-0 flex-1">
              {#if renamingId === profile.id}
                <form class="flex flex-wrap items-center gap-2" on:submit|preventDefault={commitRename}>
                  <input
                    bind:value={renameValue}
                    type="text"
                    maxlength={MAX_PROFILE_NAME_LENGTH}
                    aria-label={`Rename ${profile.name}`}
                    class="h-8 min-w-0 flex-1 rounded-[6px] border border-vlc-border bg-vlc-app px-2.5 text-[13px] text-vlc-text outline-none focus:border-vlc-orange/70 focus-visible:ring-2 focus-visible:ring-vlc-orange/40"
                    on:input={() => (renameError = '')}
                    on:keydown={(event) => {
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        event.stopPropagation();
                        cancelRename();
                      }
                    }}
                  />
                  <button
                    type="submit"
                    class="h-8 rounded-[6px] bg-vlc-orange px-3 text-[12px] font-medium text-vlc-app transition-colors hover:bg-vlc-orangeDark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    class="h-8 rounded-[6px] border border-vlc-border px-3 text-[12px] text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60"
                    on:click={cancelRename}
                  >
                    Cancel
                  </button>
                </form>
              {:else}
                <div class="flex items-center gap-2">
                  <p class="truncate text-[14px] text-vlc-text">{profile.name}</p>
                  {#if builtIn}
                    <span
                      class="shrink-0 rounded-full bg-vlc-raised px-2 py-0.5 text-[10px] uppercase tracking-[0.06em] text-vlc-muted"
                    >
                      Built-in
                    </span>
                  {/if}
                </div>
                <p class="mt-0.5 text-[12px] text-vlc-muted">{formatUpdated(profile)}</p>
              {/if}

              {#if renameError && renamingId === profile.id}
                <p class="mt-1.5 text-[12px] text-vlc-danger" role="alert">{renameError}</p>
              {/if}
            </div>

            {#if renamingId !== profile.id}
              <div class="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  class="h-8 rounded-[6px] bg-vlc-orange px-3 text-[12px] font-medium text-vlc-app transition-colors hover:bg-vlc-orangeDark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60"
                  aria-label={`Apply profile ${profile.name}`}
                  on:click={() => requestApply(profile)}
                >
                  Apply
                </button>

                {#if !builtIn}
                  <button
                    type="button"
                    class="flex h-8 w-8 items-center justify-center rounded-[6px] text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60"
                    aria-label={`Rename profile ${profile.name}`}
                    title="Rename profile"
                    on:click={() => startRename(profile)}
                  >
                    <Pencil size={14} strokeWidth={1.8} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    class="flex h-8 w-8 items-center justify-center rounded-[6px] text-vlc-dim transition-colors hover:bg-vlc-danger/10 hover:text-vlc-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-danger/50"
                    aria-label={`Delete profile ${profile.name}`}
                    title="Delete profile"
                    on:click={() => requestDelete(profile)}
                  >
                    <Trash2 size={14} strokeWidth={1.8} aria-hidden="true" />
                  </button>
                {/if}
              </div>
            {/if}
          </div>

          {#if pendingApplyId === profile.id}
            <div
              class="mt-3 rounded-[8px] border border-vlc-orange/40 bg-vlc-orange/10 p-3"
              role="alertdialog"
              aria-label={`Confirm applying ${profile.name}`}
            >
              <p class="text-[12px] leading-5 text-vlc-secondary">
                Applying “{profile.name}” replaces your current settings, including changes you have
                not saved to a profile.
              </p>
              <div class="mt-2.5 flex flex-wrap gap-2">
                <button
                  type="button"
                  class="h-8 rounded-[6px] bg-vlc-orange px-3 text-[12px] font-medium text-vlc-app transition-colors hover:bg-vlc-orangeDark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60"
                  on:click={() => applyNow(profile)}
                >
                  Apply profile
                </button>
                <button
                  type="button"
                  class="h-8 rounded-[6px] border border-vlc-border px-3 text-[12px] text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60"
                  on:click={() => (pendingApplyId = null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          {/if}

          {#if pendingDeleteId === profile.id}
            <div
              class="mt-3 rounded-[8px] border border-vlc-danger/40 bg-vlc-danger/10 p-3"
              role="alertdialog"
              aria-label={`Confirm deleting ${profile.name}`}
            >
              <p class="text-[12px] leading-5 text-vlc-secondary">
                Delete “{profile.name}”? This cannot be undone.
              </p>
              <div class="mt-2.5 flex flex-wrap gap-2">
                <button
                  type="button"
                  class="h-8 rounded-[6px] bg-vlc-danger px-3 text-[12px] font-medium text-white transition-colors hover:bg-vlc-danger/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-danger/60"
                  on:click={() => confirmDelete(profile)}
                >
                  Delete profile
                </button>
                <button
                  type="button"
                  class="h-8 rounded-[6px] border border-vlc-border px-3 text-[12px] text-vlc-secondary transition-colors hover:bg-vlc-raised hover:text-vlc-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vlc-orange/60"
                  on:click={() => (pendingDeleteId = null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  </Section>
</div>
