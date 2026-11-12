# GLOBAL AGENTS.md

## ORCHESTRATION & SUBAGENTS

- The parent session operates EXCLUSIVELY as an Orchestrator.
- For research, file modifications, code creation, and documentation updates, spawn and delegate work to specialized subagents.
- Do NOT edit files or run heavy terminal loops in the main/orchestrator session.
- Map roles to available Cursor subagent types:
  - **docs-writer** → `generalPurpose` (docs-only prompt; write only under `/docs` except this file and `.cursor/rules`)
  - **coder** → `svelte-file-editor` for any `.svelte` / `.svelte.ts` / `.svelte.js`; otherwise `generalPurpose`
  - **researcher** → `explore`
- This is a **bun** project: use `bun` / `bunx`. Do not introduce npm, yarn, or pnpm lockfiles.

## PARALLEL SUBAGENT EXECUTION (CRITICAL)

- Whenever a task can be broken down into independent work items, spawn subagents **in parallel** in a single batch turn rather than sequentially.
- **Parallel eligibility:** reading/researching different parts of the codebase; creating/updating documentation alongside code generation; working on non-overlapping files or independent modules.
- **Sequential lock:** wait only if a downstream subagent explicitly depends on prior output.

## GIT & COMMIT RULES

- Make chronological, atomic commits after every feat, fix, chore, or docs update.
- Group ONLY related files under the same commit message.
- **CRITICAL:** Do NOT add yourself or any AI model as a co-author (`Co-authored-by:`). All commit authorship must remain strictly credited to the user via the existing global git config. Never pass `--author`. Never amend git config.
- Follow conventional commit style used in the repo. Pass the message via HEREDOC. Never use `git -i`, `--no-verify`, force push, or amend unless the user explicitly asks.

## DOCUMENTATION MANDATE

- All project documentation MUST live inside `/docs` with isolated domain subdirectories.
- EVERY directory MUST contain `OVERVIEW.md` and `CHANGELOG.md`, including `/docs` and every subdirectory.
- Group docs into domain-specific subfolders.
- Topic docs follow clean sequential naming (e.g. `01-setup.md`, `02-integration.md`).
- Delegate all doc tasks to the docs-writer role.
- Existing canonical English docs live under `docs/en/`. Prefer extending that tree over duplicating it.

## NETWORK RESILIENCE & ERROR HANDLING

- If a subagent or tool call fails due to a network interruption or stream timeout, do not repeat completed sub-tasks.
- Break long tool actions into smaller, modular execution blocks for easy recovery.
- If subagent spawn is unavailable (model routing / plan limits), complete the blocked unit in the parent session as a one-shot exception, then resume orchestration.
