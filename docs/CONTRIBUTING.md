# Contributing to VLC Redesign (Community)

Thanks for helping improve the project. This guide covers setup, design rules, checks and the pull-request flow.

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
| `docs/` | Documentation and README translations |
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

## Commits

- Use atomic commits: one logical change per commit.
- Follow the existing style: `feat(scope): ...`, `fix(scope): ...`, `docs: ...`, `chore: ...`.
- Do not add AI tools or models as co-authors. Commit authorship stays with the human contributor.
- Keep unrelated formatting or refactors out of a feature commit.

## Pull requests

1. Fork the repository and create a branch from `main`, for example `feat/library-filters` or `fix/fullscreen-focus`.
2. Make the change and add or update the relevant documentation.
3. Run the checks and smoke-test the affected flow.
4. Open the PR with a short summary, screenshots for UI changes, and test notes.
5. Link the issue the PR closes, if any.

UI changes should include before/after screenshots and note dark and light theme behaviour. Changes to persistence should describe validation, fallback and migration behaviour.

## Documentation

- Canonical docs live in `docs/en/`; keep them in English.
- The [English README](README.md) and [Asante Twi README](README.as-twi.md) are the language entry points.
- Update [en/CHANGELOG.md](en/CHANGELOG.md) for user-visible changes.
- Use the existing numbered topic files and update the index in [en/OVERVIEW.md](en/OVERVIEW.md).

## Licensing

- The UI redesign source and original documentation are released under the [MIT License](../LICENSE).
- libvlc and VLC-derived components remain under the [LGPL-2.1-or-later](../LICENSES/LGPL-2.1.txt). See [LICENSES/README.md](../LICENSES/README.md) for scope.
- By contributing, you agree that your original contributions are licensed under MIT. Do not submit code or assets you cannot license.
- VLC, the VLC cone and libvlc are VideoLAN project marks or components; this repository does not relicense them.

## Questions

Open a discussion or issue on [GitHub](https://github.com/quabynahdavis/vlc-svelte). For security reports, use GitHub's private security advisory flow instead of a public issue.
