# Cycle Roadmap

This roadmap is intentionally untimed. Checked items reflect progress visible in the current
documents, package APIs, source, and tests. Unchecked items are the next major feature areas to work
toward.

## Progress So Far

### Product And Architecture

- [x] Defined Cycle as a local-first, Git-backed ticket system for repositories.
- [x] Documented the product direction for human and agent collaboration.
- [x] Documented the application specification in `CYCLE_SPEC.md`.
- [x] Documented the desktop product requirements in `DESKTOP_PRD.md`.
- [x] Documented the package architecture migration target in `SPEC.md`.
- [x] Documented Linear-inspired product requirements in `LINEAR_FEATURES_PRD.md`.
- [x] Documented an implementation plan for shared metadata and Linear-like features in
      `LINEAR_FEATURE_PLAN.md`.

### GitDB Storage

- [x] Implemented repository-scoped GitDB storage under dedicated `refs/gitdb/*` refs.
- [x] Implemented document collections, snapshots, transactions, pointers, history, diffs, and sync.
- [x] Implemented Git CLI, direct filesystem, and in-memory GitDB backends.
- [x] Preserved normal Git branches, `HEAD`, the index, and the worktree outside the ticket store.
- [x] Added GitDB tests for document storage, transactions, ref safety, history, diff, fetch, push,
      merge, and sync behavior.

### Database Projection

- [x] Implemented `@cycle/database` as the app-wide SQLite projection over repository GitDB data.
- [x] Implemented repository registration, sync status, active snapshots, and materialization
      warnings.
- [x] Implemented Markdown issue documents with frontmatter and legacy JSON read support.
- [x] Implemented repository ticket prefixes and collision-safe ticket ID generation.
- [x] Implemented issue create, read, update, transition, archive, delete, restore, and list flows.
- [x] Implemented comments and linked records.
- [x] Implemented issue relations including reciprocal blocking relationships.
- [x] Implemented due date, estimate, labels, assignee, parent, archive, and delete projection fields.
- [x] Implemented full-text search across title, body, and comments.
- [x] Implemented repository history, issue history, revision reads, and issue diffs.
- [x] Implemented shared users, labels, saved views, issue templates, initiatives, and initiative
      update records at the database layer.
- [x] Implemented tests for invalid source objects being skipped with materialization warnings.

### Contracts, Usecases, And API

- [x] Added `@cycle/contracts` as the canonical schema and usecase contract surface.
- [x] Added `@cycle/usecases` runner with input validation, success validation, typed failures, and
      request metadata.
- [x] Added usecase policy checks for status transitions, human approval, self-relations, protected
      planning sections, and deterministic automation reports.
- [x] Added `@cycle/api` local REST request/response envelopes, schema validation, handler
      service, and desktop HTTP client integration.
- [x] Exposed repository, issue, draft, record, relation, history, sync, user, label, view, template,
      initiative, and automation operations through contracts, usecases, and REST routes.

### Desktop Application

- [x] Implemented Electron main, preload, and renderer package structure.
- [x] Implemented Effect-managed desktop runtime composition.
- [x] Implemented secure IPC validation and renderer bridge calls.
- [x] Implemented app config persistence for onboarding, profile, theme, repositories, and local
      preferences.
- [x] Implemented repository add, remove, Git initialization, and repository preference persistence.
- [x] Implemented desktop bootstrap that opens configured repositories and materializes projections.
- [x] Implemented background repository sync scheduling with non-overlapping per-repository work.
- [x] Implemented workspace route helpers and last-route persistence.
- [x] Implemented desktop tests for app config, bootstrap, startup order, route parsing, and
      shortcut behavior.

### User Interface

- [x] Built the shared `@cycle/ui` design system with atoms, molecules, organisms, pages, theme
      tokens, and Storybook stories.
- [x] Added UI architecture tests that keep runtime packages out of reusable UI.
- [x] Added desktop workspace, setup, settings, repository settings, repository history, views,
      issues list, and issue detail surfaces.
- [x] Added issue list search, grouping, saved view selection, saved view creation, and inline
      status, priority, and assignee controls.
- [x] Added issue detail title and description editing, comments, activity, resources, sub-issue
      creation, due date, estimate, status, priority, assignee, labels, and initiative progress
      display hooks.
- [x] Added renderer queries and mutations for repositories, issues, search, metadata, drafts,
      relations, comments, and settings.

## Next 10 Major Features

### 1. Repository Lifecycle And Health Center

- [ ] Make add/open/initialize/remove repository flows fully productized in the desktop UI.
- [ ] Show ready, empty, syncing, degraded, failed, unsupported, and missing repository states.
- [ ] Add detailed materialization warning views with object path, object type, error, and recovery
      guidance.
- [ ] Add repository sync controls for fetch, push, retry, and local resync.
- [ ] Show current branch, remotes, default remote, last sync started/completed, last sync error,
      active snapshot, and warning count in a consolidated health panel.
- [ ] Add degraded-state recovery actions that keep local reads available while sync or projection
      issues are resolved.

### 2. Issue Creation, Drafts, And Templates

- [ ] Complete the create issue dialog for title, Markdown body, status, priority, assignee, labels,
      due date, estimate, parent, and external links.
- [ ] Add create-more behavior for rapid issue entry.
- [ ] Surface durable GitDB-backed drafts in the UI.
- [ ] Add draft recovery when users navigate away from an unfinished issue.
- [ ] Add template selection to the create flow.
- [ ] Add repository-scoped template management for bug, feature, QA, implementation, and initiative
      templates.
- [ ] Support creating issues from selected text, comments, or prefilled deep-link style input.

### 3. Issue Detail Editing And Metadata

- [ ] Complete metadata editing for labels, external links, parent issue, duplicate state, archive,
      delete, and restore actions.
- [ ] Add label picker behavior that can create missing label definitions.
- [ ] Add label settings for color, description, archive, and cleanup.
- [ ] Add due date states for overdue, due soon, future, and no due date.
- [ ] Add estimate editing with a documented default scale.
- [ ] Add copy-as-Markdown and copy-issue-reference actions.
- [ ] Add description history, comparison, and restore/revert affordances.

### 4. Search, Filters, Sorting, And Saved Views

- [ ] Build a complete filter builder for status, priority, assignee, label, parent, relation, due
      date, updated date, estimate presence, archive state, and deletion state.
- [ ] Add sorting by updated date, title, priority, due date, and created date.
- [ ] Add grouping by status, assignee, priority, label, due date, and parent/initiative.
- [ ] Show matched fields for title, body, and comment search results.
- [ ] Seed default saved views for Open Bugs, Assigned to Me, Triage, Review Queue, Stale Backlog,
      and Blocked Work.
- [ ] Let users pin, rename, update, duplicate, and delete saved views.
- [ ] Persist view display options such as density and visible columns/properties.

### 5. Board View, Selection, And Bulk Actions

- [ ] Add a board view backed by saved view definitions.
- [ ] Start with status-grouped columns and preserve the same filter/query model as list views.
- [ ] Add keyboard row navigation for issue lists.
- [ ] Add mouse and keyboard multi-selection.
- [ ] Add a contextual bulk action surface.
- [ ] Support bulk status, assignee, priority, labels, and due date updates.
- [ ] Add drag-and-drop only where the active ordering/grouping mode can persist the result
      coherently.

### 6. Initiatives, Epics, Relations, And Project Updates

- [ ] Make initiatives/epics a first-class desktop surface while storing them as issue documents.
- [ ] Add initiative detail views with owner, target date, priority, labels, child issues, links,
      activity, and progress.
- [ ] Show initiative progress from child status counts and completed/total estimates.
- [ ] Add child issue creation, reorder, detach, and convert-to-child flows.
- [ ] Add async initiative updates for status, blockers, scope changes, progress notes, and next
      steps.
- [ ] Add relation management for related, blocking, blocked-by, and duplicate issues.
- [ ] Add filters for top-level issues, child issues, blocked work, duplicates, and initiative
      membership.

### 7. Comments, Activity, History, And Review

- [ ] Add edit and delete flows for a user's own comments.
- [ ] Add create-sub-issue-from-comment as a polished workflow.
- [ ] Add activity timeline filters for comments, status changes, property changes, relations,
      archive/delete/restore, initiative updates, and agent records.
- [ ] Add issue history UI for revision browsing and body/metadata diffs.
- [ ] Add restore-from-revision for descriptions where safe.
- [ ] Add review records that can capture approval, requested changes, blockers, and final notes.
- [ ] Keep comments and review records as linked records rather than embedding them in issue bodies.

### 8. GitDB Sync, Collaboration, And Conflict Handling

- [ ] Add explicit remote fetch/push UI for Cycle refs.
- [ ] Show remote availability and remote ref status per repository.
- [ ] Detect and explain divergent GitDB histories.
- [ ] Add conflict resolution choices such as keep local, keep remote, or merge where supported.
- [ ] Keep background sync failures isolated per repository.
- [ ] Add sync event history so users can inspect what changed after fetch or push.
- [ ] Document how teams share Cycle refs through an ordinary Git remote.

### 9. Agent Delegation And Worktree Execution

- [ ] Complete local agent provider configuration and health checks.
- [ ] Add issue drafting, expansion, clarification, and splitting workflows using local repository
      context.
- [ ] Add human plan acceptance before agent implementation.
- [ ] Add isolated Git worktree creation and cleanup for implementation jobs.
- [ ] Stream agent output into execution records.
- [ ] Capture commands run, test results, diff summaries, blockers, questions, and final reports.
- [ ] Add review workflow for approve, request changes, or create follow-up issues.
- [ ] Preserve human approval as the default gate before agent-produced work can become done.

### 10. Automation, Hygiene, And Integration Readiness

- [ ] Surface automation evaluation reports in desktop and future CLI/CI entrypoints.
- [ ] Add backlog hygiene views for stale, unassigned high-priority, blocked, and old inactive work.
- [ ] Add explicit archive suggestions for stale done or canceled issues.
- [ ] Add validation checks for ready issues without accepted plans or missing acceptance criteria.
- [ ] Add lightweight repository workflow configuration through `CYCLE_WORKFLOW.md`.
- [ ] Add manual external resource management with title/source metadata.
- [ ] Prepare extension points for future GitHub/GitLab PR links, error tracker imports, mentions,
      reactions, notifications, and richer embeds without making them v1 dependencies.
