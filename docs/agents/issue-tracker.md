# Issue tracker: Linear

Issues and PRDs for this repo live in **Linear** — workspace `mdr`, project **Quiniela App** (slug `quiniela-app`, id `f16b52fd26fa`). Use the official Linear MCP plugin (`mcp.linear.app`) for all operations. In Claude Code the Linear MCP tools are deferred — find them with `ToolSearch` (e.g. `select:create_issue,list_issues,get_issue`) before calling.

## Target

- **Workspace**: `mdr`
- **Project**: Quiniela App — `quiniela-app` (id `f16b52fd26fa`)
- **Team**: resolve the project's owning team at runtime via `get_project` / `list_teams` if `create_issue` requires a `team`. Always set `project` to `f16b52fd26fa`.

## Conventions

- **Create**: `create_issue` with `title`, `description` (Markdown), `team`, `project=f16b52fd26fa`. Apply triage state/labels per `triage-labels.md`.
- **Read**: `get_issue` by identifier; `list_comments` for the thread.
- **List**: `list_issues` filtered by `project=f16b52fd26fa` plus `state` / `label` / `assignee`. `list_my_issues` for your own queue.
- **Comment**: `create_comment` with issue id + Markdown `body`.
- **Labels**: `update_issue` with `labels` (ids via `list_issue_labels`; create missing with `create_issue_label`).
- **Workflow state**: `update_issue` with `state` (ids via `list_issue_statuses`) — used for the Triage and Canceled states.
- **Close / cancel**: `update_issue` to a Done or Canceled state.

## When a skill says "publish to the issue tracker"

Create a Linear issue in the Quiniela App project (`create_issue`, `project=f16b52fd26fa`).

## When a skill says "fetch the relevant ticket"

Resolve it with `get_issue` (and `list_comments` for the thread).
