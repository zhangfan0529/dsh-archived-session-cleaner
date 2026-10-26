# Archived Session Cleaner

**English** · [中文](README.zh-CN.md)

Permanently delete archived DeepSeek Harness sessions and their subagent logs.

![The permanent-delete confirmation dialog](assets/screenshot.png)

## Features

- "Delete session permanently" in the `...` menu of an archived session
- Removes the session log, its projection cache, and its subagent logs; the row leaves the sidebar
- Archived sessions only, with a confirmation step; deletion is permanent
- Optional agent tool, `delete_archived_sessions` — one Session ID per call

## Install

Settings → Plugins → Add:

```
github:zhangfan0529/dsh-archived-session-cleaner
```

Refresh the page afterwards. For a local checkout, paste its absolute path instead, e.g. `/Users/you/plugins/dsh-archived-session-cleaner`.

Requires DeepSeek Harness 0.2.x with the Web UI.

## Use

1. If the session is not archived yet, archive it first (`...` → Archive session)
2. Switch the sidebar filter to "All conversations (show archived)"
3. `...` → "Delete session permanently" → confirm

To let the agent delete one, send it the Session ID from "Copy Session ID" in the archived row's menu.

## Notes

- Archived sessions only. A session that is running, or still loaded in the current app run, is skipped — restart the app, then delete again
- Deletion is permanent
- Runs entirely on this machine: no network requests, no telemetry

## What gets deleted

- `$DSH_HOME/sessions/<project>/<sessionId>/` (the JSONL log)
- `$DSH_HOME/storages/session_projcache/sessions/<sessionId>.json`
- the subagent session logs recorded under it
- its workspace entry and archive-set entry

`$DSH_HOME` defaults to `~/.dsh`.

## License

MIT — see [LICENSE](LICENSE). Files under `assets/` are not covered by the MIT license.

## Sponsor

[![飞鱼 Token](assets/feiyutoken-logo.png)](https://www.feiyutoken.com)

**[飞鱼 Token](https://www.feiyutoken.com)**
