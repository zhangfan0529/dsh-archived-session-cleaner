# Archived Session Cleaner

**English** · [中文](README.zh-CN.md)

A DeepSeek Harness plugin bundle that **permanently deletes archived sessions** from the sidebar.

## Why this exists

DSH treats the session log as the only source of truth and ships no way to delete a
session. Archiving only hides a session from the sidebar's grouping: its log stays on
disk, in the archived filter, and in the workspace registry. Archived conversations
accumulate and clutter the sidebar. This plugin adds the missing operation.

## What it does

- Adds **“Delete session permanently”** to the `...` menu of an **archived** session row.
- Asks for confirmation first, and states exactly what will be removed — the session
  plus the subagent logs recorded beneath it.
- Deletes the stored session directory, its projection-cache entry, and the subagent
  sessions under it.
- Detaches the session from workspace accounting, drops it from the archive set, and
  lets the sidebar remove the row immediately.
- Exposes an agent tool, `delete_archived_sessions`, backed by the same implementation.
  It takes exactly **one required `sessionId`** — there is no "delete all archived
  sessions" mode for the agent.

![The permanent-delete confirmation dialog](assets/screenshot.png)

Safety boundaries: only archived sessions can be deleted, a live session is refused,
an id that is not archived is ignored, and deletion cannot be undone.

## Requirements

- DeepSeek Harness 0.2.x with the Web UI (developed against `0.2.1-rc.3`).
- The UI half is a web client plugin, so the profile must run the Web GUI.

## Install

### From GitHub

Settings → Plugins → Add, then paste:

```
github:zhangfan0529/dsh-archived-session-cleaner
```

or `git+https://github.com/zhangfan0529/dsh-archived-session-cleaner.git`.

The installer requires approval and runs `pnpm`. The repository root must be this
package — the directory containing the `package.json` with `dsh.bundle.patch`.

### From a local directory

Settings → Plugins → Add, with the absolute path to this directory:

```
/Users/you/plugins/dsh-archived-session-cleaner
```

After installing, refresh the page once so the client bundle loads.

## Usage

1. Archive a session if it is not archived yet (its `...` menu → **Archive session**).
2. Make archived sessions visible in the sidebar filter.
3. Open the archived row's `...` menu → **Delete session permanently**.
4. Confirm.

Or ask the agent to delete one session. The tool requires that session's id (copy it from
the archived row's `...` menu → **Copy Session ID**); the agent cannot delete every
archived session in one call.

## How it works

- **Host half** ([index.js](index.js)) owns the deletion. It registers a package-owned
  local route (`POST /dsh-plugin/archived-sessions`; browser calls are same-origin only,
  and the route is not an authenticated API) for the client half and the
  `delete_archived_sessions` tool for agents; both call one implementation.
- **Client half** ([client.js](client.js)) registers the menu row and the confirmation
  dialog in the sidebar. The dialog renders the harness `Modal`/`Button` primitives when
  they are available, so it matches the shipped dialogs exactly, in light and dark mode,
  with a local fallback when the private module is missing.
- The route is local and loopback-only: no external network, no telemetry. The browser
  cannot touch the filesystem, so the client half sends a command (`preview` or
  `delete`) and the host performs it in-process.

## What it removes

- `$DSH_HOME/sessions/<project>/<sessionId>/` — the JSONL log and its artifacts
- `$DSH_HOME/storages/session_projcache/sessions/<sessionId>.json`
- subagent sessions recorded beneath the deleted session (`origin: "subagent"`)
- the session's workspace accounting slot and its archive-set entry

`$DSH_HOME` defaults to `~/.dsh`.

## Notes

- DSH 0.2.x has no public session-delete API, so this plugin implements the operation
  against the storage layout above. A future version that changes that layout — or ships
  its own delete API — may require updating or replacing this plugin.
- The confirmation dialog prefers `@deepseek-ai/dsh-client-ui-primitives`, a private
  client API. It can change between harness versions; if it does, the built-in fallback
  renders instead.
- No build step: plain ESM, no runtime dependencies.

## Files

| File | Purpose |
| --- | --- |
| `package.json` | Bundle manifest: `dsh.bundle.patch`, `dsh.client`, exports |
| `cordis.patch.yml` | Loader patch that inserts the plugin row |
| `index.js` | Host half: deletion, local route, agent tool |
| `client.js` | Client half: menu row, confirmation dialog |
| `locale/en.json`, `locale/zh.json` | Plugin list title and description |
| `icon.svg` | Plugin list artwork |
| `LICENSE` | MIT license |

## License

MIT — see [LICENSE](LICENSE). Files under `assets/` are not covered by the MIT license.

## Sponsor

[![飞鱼 Token](assets/feiyutoken-logo.png)](https://www.feiyutoken.com)

**[飞鱼 Token](https://www.feiyutoken.com)**
