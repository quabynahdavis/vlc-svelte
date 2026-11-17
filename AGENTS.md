# GLOBAL AGENTS.md

## ORCHESTRATION & SUBAGENTS
- You operate EXCLUSIVELY as an Orchestrator.
- For research, file modifications, code creation, and documentation updates, you MUST spawn and delegate work to specialized subagents.
- DO NOT edit files or run heavy terminal loops yourself in the main session.

## SHELL & ENVIRONMENT PATHS
- This is a bun project. Use `bun` / `bunx` for installs, scripts, and one-off CLIs.
- Do not introduce npm, yarn, or pnpm, and do not add `package-lock.json`, `yarn.lock`, or `pnpm-lock.yaml`.

## PARALLEL SUBAGENT EXECUTION (CRITICAL)
- Whenever a task can be broken down into independent work items, you MUST spawn subagents **IN PARALLEL** in a single batch turn rather than executing them sequentially one by one.
- **PARALLEL ELIGIBILITY:**
  - Reading/researching different parts of the codebase.
  - Creating/updating documentation alongside code generation (e.g., `coder` + `docs-writer` together).
  - Working on non-overlapping files or independent microservices/modules.
- **SEQUENTIAL LOCK:** You may only wait for a subagent to complete sequentially if a downstream subagent explicitly depends on its output.

## GIT & COMMIT RULES
- Make chronological, atomic commits after every feat, fix, chore, or docs update.
- Group ONLY related files under the same commit message.
- **CRITICAL:** DO NOT add yourself or any AI model as a co-author (`Co-authored-by:`). All commit authorship must remain strictly credited to the user, using the existing global git config. Never pass `--author`. Never amend git config.
- Follow the repository's conventional commit style. Pass the message via HEREDOC. Never use `git -i`, `--no-verify`, force push, or amend unless the user explicitly asks.

## DOCUMENTATION MANDATE
- All project documentation MUST live inside `/docs` with isolated domain subdirectories.
- EVERY directory MUST contain `OVERVIEW.md` and `CHANGELOG.md`.
- Group docs into domain-specific subfolders (e.g., `docs/env`, `docs/architecture`, `docs/tensorflow`).
- **EVERY SINGLE FOLDER** (including `/docs` and every subdirectory inside it) MUST contain:
  1. `OVERVIEW.md` (Domain scope and file index)
  2. `CHANGELOG.md` (Doc revision history for that domain)
- Topic docs must follow clean sequential naming (e.g., `01-setup.md`, `02-integration.md`).
- Delegate all doc tasks to the `docs-writer` subagent. In Cursor that role is the `generalPurpose` subagent with a docs-only prompt. Write only under `/docs`.

## NETWORK RESILIENCE & ERROR HANDLING
- If a subagent or tool execution call fails due to a network interruption or stream timeout, do not repeat completed sub-tasks.
- Break long tool actions into smaller, modular execution blocks to allow easy recovery if the connection drops.
