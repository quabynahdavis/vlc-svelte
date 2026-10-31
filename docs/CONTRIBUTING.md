# Contributing to Kanea

Thanks for helping improve Kanea, a community-built desktop interface for VLC Media Player. This guide covers setup, design rules, checks, commit standards, documentation structure, translations and the pull-request flow.

**Languages:** **English** · [Asante Twi README](README.as-twi.md)

## Before you start

- Read the [project overview](en/OVERVIEW.md) and the [design system](en/design/01-design-system.md).
- Check open issues and pull requests so work is not duplicated.
- For larger changes, open an issue first so the direction can be agreed.
- Be respectful and constructive in issues, reviews and discussions.

## Development setup

You need **bun**, **Rust stable + Cargo**, and the Tauri v2 system packages for your platform. The full list is in [en/guides/01-setup.md](en/guides/01-setup.md).

```bash
git clone https://github.com/quabynahdavis/vlc-svelte.git
cd vlc-svelte
bun install
bun run dev
```

Browser-only frontend: `bun run dev:frontend`.

## Project layout

| Path | What lives there |
| --- | --- |
| `src/` | Svelte 4 + TypeScript UI |
| `src/components/` | Shell, player, dock and dialog components |
| `src/views/` | Browse views |
| `src/stores/` | Writable stores and persistence |
| `src-tauri/` | Tauri v2 shell and Rust entry point |
| `docs/` | Documentation, translations and README landing pages |
| `public/` | Static assets and the demo clip |

## Design rules

- Keep the orange VLC cone and accent, neutral gray surfaces, and softened rectangular corners. Do not introduce pill-shaped controls.
- Use the semantic tokens in `src/app.css`; do not hard-code palette hex values in components.
- Decorative menu icons may be two-tone; interactive controls stay monochrome.
- Preserve keyboard access, focus rings, ARIA labels and the existing contrast rules.
- Update [en/design/01-design-system.md](en/design/01-design-system.md) when a token or shared component changes.

## Coding conventions

- Use Svelte 4 syntax, TypeScript and Tailwind utilities with the `vlc-*` tokens.
- Keep state in `src/stores/`; components should not duplicate persisted state.
- Validate persisted data when adding a storage key, and follow the existing `vlc.*.v1` pattern.
- Keep mock data in `src/lib/mock.ts`; keep session-only imports clearly separate from persisted data.
- Prefer small, focused components and existing helpers before adding new abstractions.
- Do not commit generated build output.

## Checks

Run these before opening a pull request:

```bash
bun run check
bunx vite build
```

`bun run check` must report **0 errors and 0 warnings**. The Vite build writes to `src-tauri/gen/dist/`.

Smoke-test the changed flow in the app or the built preview, and mention what you tested in the PR.

## Commit standards

History is part of the project. Commits must be reviewable, reversible and meaningful on their own.

### Atomic commits

- Make one logical change per commit. A feature, a fix, a documentation update and a dependency bump are separate commits.
- Each commit should build and pass `bun run check` on its own. Do not land a commit that only works after the next one.
- Do not mix unrelated formatting, renames or refactors into a feature commit. Land them as a separate `style`, `refactor` or `chore` commit first.
- Commit after every completed feature, fix, chore or documentation update — do not batch a day of work into one commit.
- Do not leave `WIP`, `autosave` or `tmp` commits in the history. Squash or reword them before opening the PR:

```bash
git rebase -i origin/main
git commit --amend
```

### Message format

Use Conventional Commits:

```text
<type>(<scope>): <subject>

<body>

<footer>
```

- **Subject**: imperative mood, lowercase, no trailing period, ideally 72 characters or fewer. Write `add compact library drawer`, not `added` or `adds`.
- **Scope**: optional but preferred; use the area of the codebase being changed.
- **Body**: explain *why* the change is needed and any trade-offs. Wrap at 72 characters. Skip it for trivial changes.
- **Footer**: reference issues with `Closes #123` and call out breaking changes with `BREAKING CHANGE: ...`.

### Types

| Type | Use for |
| --- | --- |
| `feat` | A new user-visible feature or capability. |
| `fix` | A bug fix. |
| `docs` | Documentation, README, changelog or comment-only changes. |
| `style` | Formatting, whitespace or lint fixes with no behaviour change. |
| `refactor` | Code restructuring that neither fixes a bug nor adds a feature. |
| `perf` | A performance improvement. |
| `test` | Adding or fixing tests. |
| `build` | Build system, bundler or dependency changes. |
| `ci` | CI configuration and automation. |
| `chore` | Maintenance that touches neither `src/` nor `docs/`. |
| `revert` | Reverting an earlier commit, quoting its subject. |

### Scopes

Use the surface you touched:

`shell`, `player`, `fullscreen`, `library`, `music`, `network`, `playlists`, `queue`, `settings`, `layout`, `hotkeys`, `profiles`, `onboarding`, `theme`, `dock`, `a11y`, `docs`, `deps`, `release`.

### Examples

```text
feat(player): add compact library drawer
fix(fullscreen): restore focus when chrome hides
docs(guides): add internationalization guide
docs(contributing): document commit and translation standards
refactor(stores): extract persisted settings helper
chore(deps): bump vite to 5.4.8
```

Avoid vague subjects such as `update stuff`, `fixes`, `wip` or `changes`. If a commit needs the word "and" to describe it, it is probably two commits.

### Authorship

- Commit authorship stays with the human contributor. Do not add yourself, an AI tool or a model as a co-author.
- Never add `Co-authored-by:` trailers for AI assistance.
- Do not rewrite other contributors' authorship when rebasing or squashing.

## Documentation structure

Documentation is part of the deliverable. A code change that alters behaviour, persistence or configuration must update the relevant document in the same pull request.

### Layout

```text
docs/
├── README.md
├── README.<tag>.md
├── CONTRIBUTING.md
├── assets/
│   ├── vlc.svg
│   └── screenshots/
└── <lang>/
    ├── OVERVIEW.md
    ├── CHANGELOG.md
    └── <domain>/
        └── NN-topic.md
```

- **Language root**: `docs/<lang>/`, for example `docs/en/`.
- **Domain folder**: `docs/<lang>/<domain>/`, for example `docs/en/guides/`.
- **Topic file**: `docs/<lang>/<domain>/NN-topic.md`, for example `docs/en/guides/03-internationalization.md`.
- **Landing page**: `docs/README.md` for English and `docs/README.<tag>.md` for translations.

### Rules

- Every language root **must** contain `OVERVIEW.md` (scope and file index) and `CHANGELOG.md` (revision history). A language root without both is incomplete.
- Domain folders contain numbered topic files only. Do not add a second `OVERVIEW.md` or `CHANGELOG.md` inside `architecture/`, `design/` or `guides/`.
- Use sequential prefixes: `01-setup.md`, `02-design-reference.md`, `03-internationalization.md`. Do not renumber existing files without a migration note.
- Keep topic names lowercase and hyphenated, and describe the content rather than the format.
- English under `docs/en/` is canonical. Translate from it; never translate from an older translation.
- Update the index in [en/OVERVIEW.md](en/OVERVIEW.md) and the entries in [en/CHANGELOG.md](en/CHANGELOG.md) in the same pull request.
- Put documentation assets under `docs/assets/` and screenshots under `docs/assets/screenshots/`. Reference them with relative paths.
- Check every local link before opening the PR. Broken links block review.
- Do not commit generated documentation, build output or editor caches.

## Internationalization and translation

The full rules live in [en/guides/03-internationalization.md](en/guides/03-internationalization.md). In short:

### Language tags and required files

- Use ISO 639-1 codes where they exist (`en`, `fr`). Use a stable project tag for language variants; Asante Twi uses `as-twi`.
- Keep tags lowercase and hyphenated. Do not rename an existing tag without a changelog migration note.
- Every language root under `docs/<tag>/` must have `OVERVIEW.md` and `CHANGELOG.md`.
- A translated landing page (`docs/README.<tag>.md`) is an entry point, not a full language tree. Add `docs/<tag>/` with both required files when a full translation starts.

### Source of truth and synchronization

- `docs/en/` is canonical. Translate from the latest English source.
- When an English topic changes, update every maintained translation in the same pull request, or mark the translation stale and open a follow-up issue.
- Keep headings, tables, section order and link targets aligned with the English source unless the target language needs a documented exception.
- Translate prose and labels. Keep code identifiers, file paths, commands, API names, product names and license text in English.

### Landing pages

- `docs/README.md` is English; `docs/README.<tag>.md` is the translated landing page.
- Every landing page carries a language switcher at the top and bottom. The current language is bold, the others are links.
- Keep badges and screenshots identical across languages unless the UI itself is localized. Do not invent localized screenshots.

### Asante Twi

- File: `docs/README.as-twi.md`; tag: `as-twi`.
- Keep technical terms in English when they are clearer: `Player`, `Library`, `Queue`, `Playlist`, `Settings`, `Fullscreen`, `Layout`, `Theme`, `Subtitle`.
- Use Twi for connective prose, headings and explanations, with the `ɛ` and `ɔ` orthography.
- A fluent speaker must review new or substantially changed Twi text. Machine translation is a drafting aid only and must be reviewed before merge.

### Adding a language

1. Create `docs/README.<tag>.md` from the English landing page and translate it.
2. Create `docs/<tag>/OVERVIEW.md` and `docs/<tag>/CHANGELOG.md`.
3. Mirror the English domain folders and numbered topic files as translations are completed.
4. Add the language to the switcher on every landing page.
5. Add the language to the index in [en/OVERVIEW.md](en/OVERVIEW.md).
6. Update [en/CHANGELOG.md](en/CHANGELOG.md) and the new language's `CHANGELOG.md`.
7. Open the translation PR with the source revision and reviewer noted.

### Translation pull-request checklist

- [ ] Based on the latest English source.
- [ ] Headings, links and tables match the source structure.
- [ ] Code, paths, commands and license text are unchanged.
- [ ] The language switcher links both ways.
- [ ] `OVERVIEW.md` and `CHANGELOG.md` exist for the language root.
- [ ] A fluent reviewer has checked the prose.
- [ ] Screenshots are unchanged or genuinely localized.

## Pull requests

1. Fork the repository and create a branch from `main`, for example `feat/library-filters` or `fix/fullscreen-focus`.
2. Make the change and add or update the relevant documentation.
3. Run the checks and smoke-test the affected flow.
4. Rebase and clean the commit history before opening the PR.
5. Open the PR with a short summary, screenshots for UI changes, and test notes.
6. Link the issue the PR closes, if any.

UI changes should include before/after screenshots and note dark and light theme behaviour. Changes to persistence should describe validation, fallback and migration behaviour. Documentation and translation PRs should state the source revision and the reviewer.

## Licensing

- The UI redesign source and original documentation are released under the [MIT License](../LICENSE).
- libvlc and VLC-derived components remain under the [LGPL-2.1-or-later](../LICENSES/LGPL-2.1.txt). See [LICENSES/README.md](../LICENSES/README.md) for scope.
- By contributing, you agree that your original contributions are licensed under MIT. Do not submit code or assets you cannot license.
- The design reference exports in `VLC Redesign (Community)/` were created by [Juxtopposed](https://www.youtube.com/channel/UCa8W2_uf81Ew6gYuw0VPSeA) and are **not** covered by the MIT license. Do not relicense or redistribute them as project assets.
- Kanea is an independent community redesign and is not affiliated with or endorsed by VideoLAN.
- VLC, the VLC cone and libvlc are VideoLAN project marks or components; this repository does not relicense them.

## Questions

Open a discussion or issue on [GitHub](https://github.com/quabynahdavis/vlc-svelte). For security reports, use GitHub's private security advisory flow instead of a public issue.
