# Internationalization and Translation

This guide defines how documentation and UI copy are translated in VLC Redesign (Community). English is the source of truth; translations are maintained alongside it.

## Language tags and files

| Scope | Pattern | Example |
| --- | --- | --- |
| Landing page | `docs/README.<tag>.md` | `docs/README.as-twi.md` |
| Documentation tree | `docs/<tag>/` | `docs/en/` |
| Domain folder | `docs/<tag>/<domain>/` | `docs/en/guides/` |
| Topic file | `docs/<tag>/<domain>/NN-topic.md` | `docs/en/guides/03-internationalization.md` |

- Use ISO 639-1 codes where they exist (`en`, `fr`).
- Use a stable project tag for language variants. Asante Twi uses `as-twi`, matching `docs/README.as-twi.md`.
- Keep tags lowercase and hyphenated. Do not rename an existing tag without a migration note in the changelog.

## Required files

Every language root under `docs/<tag>/` must contain:

- `OVERVIEW.md` — scope and file index for that language.
- `CHANGELOG.md` — revision history for that language.

Domain folders (`architecture/`, `design/`, `guides/`) contain numbered topic files only. Do not add duplicate domain-level overview or changelog files.

A translated landing page (`docs/README.<tag>.md`) is an entry point, not a full language tree. When a full tree is added, create `docs/<tag>/` with both required files.

## Source of truth

- `docs/en/` is canonical. Translate from the latest English source, not from an older translation.
- When an English topic changes, update every maintained translation in the same pull request, or mark the translation stale and open a follow-up issue.
- Keep headings, tables, link targets and section order aligned with the English source unless the target language needs a documented exception.
- Translate prose and labels. Keep code identifiers, file paths, commands, API names, product names and license text in English.

## Landing pages

- `docs/README.md` is the English landing page.
- `docs/README.<tag>.md` is the translated landing page.
- Both carry a language switcher at the top and bottom:

```markdown
**Read this in:** **English** · [Asante Twi](README.as-twi.md)
**Kenkan yei wɔ:** [English](README.md) · **Asante Twi**
```

- The current language is bold; other languages are links.
- Keep screenshots and badges identical across landing pages unless the UI itself is localized.
- Do not invent localized screenshots.

## Asante Twi

- File: `docs/README.as-twi.md`.
- Tag: `as-twi`.
- Keep technical terms in English when they are clearer: `Player`, `Library`, `Queue`, `Playlist`, `Settings`, `Fullscreen`, `Layout`, `Theme`, `Subtitle`.
- Use Twi for connective prose, headings and explanations.
- Use the orthography with `ɛ` and `ɔ`.
- A fluent speaker should review new or substantially changed Twi text.
- Machine translation is a drafting aid only; it must be reviewed before merge.

## Terminology

| English | Asante Twi |
| --- | --- |
| Documentation | Nkyerɛw |
| Project | Project |
| Overview | Project no ho nsɛm |
| Contributing | Mmoa a wobɛboa |
| License | License |
| Settings | Settings |
| Player | Player |
| Library | Library |
| Queue | Queue |
| Playlist | Playlist |
| Theme | Theme |
| Download | Download |

Add new terms to this table when a translation introduces a recurring term.

## Adding a language

1. Create `docs/README.<tag>.md` from the English landing page and translate it.
2. Create `docs/<tag>/OVERVIEW.md` and `docs/<tag>/CHANGELOG.md`.
3. Mirror the English domain folders and numbered topic files as translations are completed.
4. Add the language to the switcher on every landing page.
5. Add the language to the documentation index in `docs/en/OVERVIEW.md`.
6. Update `docs/en/CHANGELOG.md` and the new language's `CHANGELOG.md`.
7. Open the translation pull request with the source revision and reviewer noted.

## Translation pull-request checklist

- [ ] The translation is based on the latest English source.
- [ ] Headings, links and tables match the source structure.
- [ ] Code, paths, commands and license text are unchanged.
- [ ] The language switcher links both ways.
- [ ] `OVERVIEW.md` and `CHANGELOG.md` exist for the language root.
- [ ] A fluent reviewer has checked the prose.
- [ ] Screenshots are unchanged or genuinely localized.
