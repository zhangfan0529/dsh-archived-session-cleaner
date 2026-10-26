/**
 * Archived Session Cleaner — Host half.
 *
 * DSH keeps archived Sessions as ordinary stored logs and has no
 * Session-delete API, so this plugin owns the operation: it removes a
 * Session's stored log directory and projection-cache entry, detaches the
 * Session from Workspace accounting, and drops it from the registry-global
 * archive set. Subagent logs recorded beneath a deleted Session are part of
 * that Session's work and are removed with it; forks and other Sessions are
 * never touched.
 *
 * The same operation backs two callers: the sidebar UI (through the
 * package-owned HTTP route) and the `delete_archived_sessions` agent tool.
 */
import { readdir, rm, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Package-owned route the Client half posts to. */
const ROUTE = '/dsh-plugin/archived-sessions'
const MAX_BODY_BYTES = 64 * 1024
/** Session ids are filesystem segments, so only these units are accepted. */
const SAFE_ID = /^[A-Za-z0-9._-]{1,200}$/

/**
 * Resolve `$DSH_HOME`, matching the harness convention: a non-blank
 * `DSH_HOME` wins, otherwise `~/.dsh`.
 * @returns the configured harness home directory.
 */
function harnessHome() {
  const configured = process.env.DSH_HOME?.trim()
  return configured !== undefined && configured.length > 0 ? configured : join(homedir(), '.dsh')
}

/**
 * The JSONL persistence root (`root: !!js dshHomePath('sessions')` in the
 * shipped composition).
 * @returns the sessions root directory.
 */
function sessionsRoot() {
  return join(harnessHome(), 'sessions')
}

/**
 * The projection cache stores one `<sessionId>.json` per Session; a stale
 * entry is harmless but it is part of the Session's footprint.
 * @param id - session id.
 * @returns the cache file path.
 */
function projectionCacheFile(id) {
  return join(harnessHome(), 'storages', 'session_projcache', 'sessions', `${id}.json`)
}

/**
 * Encode one raw string as a single safe path segment, exactly as the JSONL
 * backend does before touching the filesystem. Session ids are normally
 * already safe; this keeps traversal impossible for anything else.
 * @param raw - non-empty raw segment.
 * @returns the encoded segment.
 */
function encodeSegment(raw) {
  if (raw === '.') return '~002E'
  if (raw === '..') return '~002E~002E'
  let out = ''
  for (let index = 0; index < raw.length; index += 1) {
    const code = raw.charCodeAt(index)
    const character = String.fromCharCode(code)
    if (character !== '~' && /^[A-Za-z0-9._-]$/.test(character)) out += character
    else out += `~${code.toString(16).toUpperCase().padStart(4, '0')}`
  }
  return out
}

/**
 * Find every stored directory owned by one Session. A Session dir sits one
 * level below its project key, and the same id appears under exactly one
 * project key, so scanning the root avoids duplicating the backend's private
 * project-key encoding.
 * @param root - sessions root.
 * @param id - session id.
 * @returns absolute directory paths (usually zero or one).
 */
async function findSessionDirs(root, id) {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return []
  }
  const segment = encodeSegment(id)
  const dirs = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const candidate = join(root, entry.name, segment)
    try {
      if ((await stat(candidate)).isDirectory()) dirs.push(candidate)
    } catch {
      /* not this project's copy */
    }
  }
  return dirs
}

/**
 * Remove one stored Session: its log directory (and every artifact beside the
 * log) plus its projection-cache entry.
 * @param root - sessions root.
 * @param id - session id.
 * @returns the number of directories removed.
 */
async function removeStoredSession(root, id) {
  const dirs = await findSessionDirs(root, id)
  for (const dir of dirs) await rm(dir, { recursive: true, force: true, maxRetries: 2 })
  await rm(projectionCacheFile(id), { force: true }).catch(() => {})
  return dirs.length
}

/**
 * Normalize a required caller-supplied id list. Every entry point names the
 * sessions it acts on: there is deliberately no "all archived" shorthand, so
 * no single call can wipe the whole archive set.
 * @param value - raw request value.
 * @returns the deduplicated, non-empty id list.
 */
function requireIds(value) {
  if (!Array.isArray(value)) throw new Error('sessionIds must be an array of strings')
  const ids = []
  for (const item of value) {
    if (typeof item !== 'string' || item.length === 0) throw new Error('sessionIds must contain non-empty strings')
    if (!ids.includes(item)) ids.push(item)
  }
  if (ids.length === 0) throw new Error('at least one session id is required')
  return ids
}

/**
 * Select archived targets out of the requested ids.
 * @param archived - registry-global archive set.
 * @param requested - requested ids.
 * @returns selected targets plus ids ignored because they are not archived.
 */
function selectTargets(archived, requested) {
  const known = new Set(archived)
  return {
    targets: requested.filter((id) => known.has(id)),
    ignored: requested.filter((id) => !known.has(id)),
  }
}

/**
 * Collect the subagent Sessions recorded beneath the given roots. Only
 * `origin: 'subagent'` children are owned by their parent Session; a fork
 * carries its own user history and is left alone.
 * @param snapshots - stored Session snapshots.
 * @param roots - Session ids whose descendants are wanted.
 * @returns descendant ids in breadth-first order.
 */
function subagentDescendants(snapshots, roots) {
  const children = new Map()
  for (const snapshot of snapshots) {
    const header = snapshot.header
    if (header.origin !== 'subagent') continue
    const parent = header.parentSession
    if (parent === undefined) continue
    const key = String(parent)
    const list = children.get(key)
    if (list === undefined) children.set(key, [String(header.id)])
    else list.push(String(header.id))
  }
  const result = []
  const seen = new Set(roots.map(String))
  const queue = [...seen]
  while (queue.length > 0) {
    const current = queue.shift()
    for (const child of children.get(current) ?? []) {
      if (seen.has(child)) continue
      seen.add(child)
      result.push(child)
      queue.push(child)
    }
  }
  return result
}

/**
 * Resolve the services the operation needs and build its plan.
 * @param ctx - plugin context.
 * @param requestedIds - requested ids; must name at least one session.
 * @returns the plan shared by preview and delete.
 */
async function collectPlan(ctx, requestedIds) {
  const ids = requireIds(requestedIds)
  const registry = ctx.get('workspaceRegistry')
  if (registry === undefined) throw new Error('the workspace registry is unavailable in this profile')
  const persistence = ctx.get('sessionPersistence')
  if (persistence === undefined) throw new Error('session storage is unavailable in this profile')
  const archived = registry.archivedSessionIds.map(String)
  const { targets, ignored } = selectTargets(archived, ids)
  const snapshots = await persistence.list()
  const live = new Set((ctx.get('sessions')?.list() ?? []).map((session) => String(session.id)))
  const running = new Set()
  const agents = ctx.get('agents')
  if (agents !== undefined) {
    for (const id of live) {
      let status
      try {
        status = agents.get(id)?.status
      } catch {
        status = undefined
      }
      if (status === 'running') running.add(id)
    }
  }
  const families = new Map()
  for (const target of targets) families.set(target, subagentDescendants(snapshots, [target]))
  return { registry, persistence, archived, targets, families, ignored, live, running }
}

/**
 * Why a Session blocks its own deletion.
 *
 * Two states refuse a delete, and they are not the same thing: `running` when
 * the Session's Agent is inside a turn, `resident` when the Host merely keeps
 * the Session loaded in this process. DSH 0.2.x has no per-Session close API,
 * so a Session this app run opened — or archived while it was open — stays in
 * memory until the app exits. Removing the log underneath a loaded Session
 * could let a later flush write it back, so a resident Session is refused too;
 * the caller must restart the app to release it.
 * @param plan - the collected plan.
 * @param id - Session id.
 * @returns the blocking reason, or undefined when the log is free to remove.
 */
function blockingReason(plan, id) {
  if (plan.running.has(id)) return 'running'
  if (plan.live.has(id)) return 'resident'
  return undefined
}

/**
 * Describe what a delete would remove without writing anything.
 * @param ctx - plugin context.
 * @param requestedIds - normalized requested ids.
 * @returns counts for the confirmation dialog.
 */
export async function previewArchivedSessions(ctx, requestedIds) {
  const plan = await collectPlan(ctx, requestedIds)
  let subagents = 0
  let running = 0
  let resident = 0
  for (const target of plan.targets) {
    const family = [target, ...(plan.families.get(target) ?? [])]
    subagents += family.length - 1
    for (const id of family) {
      const reason = blockingReason(plan, id)
      if (reason === 'running') running += 1
      else if (reason === 'resident') resident += 1
    }
  }
  return {
    archived: plan.archived.length,
    targets: plan.targets.length,
    subagents,
    running,
    resident,
    ignored: plan.ignored,
  }
}

/**
 * Permanently delete archived Sessions (and their subagent logs).
 *
 * A Session whose Agent is running is refused, and so is a Session the Host
 * still holds in memory from this app run (`resident`): the app must restart
 * to release it. Nothing is written for a refused Session. A stored log that
 * is already gone is treated as already deleted, and its registry entries are
 * still cleaned up.
 * @param ctx - plugin context.
 * @param requestedIds - normalized requested ids.
 * @returns the per-id outcome.
 */
export async function deleteArchivedSessions(ctx, requestedIds) {
  const plan = await collectPlan(ctx, requestedIds)
  const root = sessionsRoot()
  const deleted = []
  const subagentsDeleted = []
  const skipped = []
  const failed = []

  for (const target of plan.targets) {
    const family = [target, ...(plan.families.get(target) ?? [])]
    const blocked = family.map((id) => blockingReason(plan, id)).filter((reason) => reason !== undefined)
    if (blocked.length > 0) {
      skipped.push({ id: target, reason: blocked.includes('running') ? 'running' : 'resident' })
      continue
    }
    const removedHere = []
    let failure
    for (const id of family) {
      if (!SAFE_ID.test(id)) {
        failure = `refusing unsafe session id ${JSON.stringify(id)}`
        break
      }
      try {
        await removeStoredSession(root, id)
        const remaining = await plan.persistence.stat(id)
        if (remaining !== undefined) throw new Error('the stored log is still present after removal')
        removedHere.push(id)
      } catch (error) {
        failure = error instanceof Error ? error.message : String(error)
        break
      }
    }
    if (failure !== undefined) {
      failed.push({ id: target, error: failure })
      continue
    }
    deleted.push(target)
    for (const id of removedHere) if (id !== target) subagentsDeleted.push(id)
  }

  if (deleted.length > 0) {
    const gone = new Set(deleted)
    for (const workspace of plan.registry.list()) {
      for (const id of [...gone]) {
        if (!workspace.sessionIds.includes(id)) continue
        if (typeof workspace.detachSession === 'function') await workspace.detachSession(id)
      }
    }
    for (const id of deleted) await plan.registry.unarchiveSession(id)
    // `api-session/removed` is the forwarded Host event the Client catalog
    // already listens to; announcing each removal drops the row immediately
    // instead of waiting for the next full Session-list pull.
    for (const id of [...deleted, ...subagentsDeleted]) {
      try {
        ctx.emit('api-session/removed', id)
      } catch {
        /* a listener failure must not turn a completed deletion into a failure */
      }
    }
  }

  return {
    deleted,
    subagentsDeleted,
    skipped,
    failed,
    ignored: plan.ignored,
  }
}

/**
 * Read a bounded JSON request body.
 * @param req - HTTP request.
 * @returns the parsed body.
 */
async function readJsonBody(req) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > MAX_BODY_BYTES) throw new Error('request body is too large')
    chunks.push(chunk)
  }
  if (total === 0) return {}
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('request body must be an object')
  return parsed
}

/**
 * Answer one request with JSON.
 * @param res - HTTP response.
 * @param status - status code.
 * @param body - JSON-serializable body.
 */
function sendJson(res, status, body) {
  const data = Buffer.from(JSON.stringify(body))
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(data.length),
    'cache-control': 'no-store',
  })
  res.end(data)
}

/**
 * Refuse a request that did not originate from this page. The route is local
 * and unauthenticated by construction, so a cross-origin caller is the one
 * case worth rejecting.
 * @param req - HTTP request.
 * @returns whether the request is a same-origin browser request.
 */
function sameOrigin(req) {
  const origin = req.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === req.headers.host
  } catch {
    return false
  }
}

/**
 * Register the sidebar's HTTP entry point and the agent tool.
 * @param ctx - plugin context.
 */
export function apply(ctx) {
  const operations = {
    preview: (ids) => previewArchivedSessions(ctx, ids),
    delete: (ids) => deleteArchivedSessions(ctx, ids),
  }

  ctx.inject(['webServer'], (webCtx) => {
    const webServer = webCtx.webServer
    webCtx.effect(
      () =>
        webServer.register({
          kind: 'exact',
          path: ROUTE,
          handler: async (req, res) => {
            if (!sameOrigin(req)) {
              sendJson(res, 403, { ok: false, error: 'cross-origin request refused' })
              return
            }
            if (req.method !== 'POST') {
              sendJson(res, 405, { ok: false, error: 'method not allowed' })
              return
            }
            let body
            try {
              body = await readJsonBody(req)
            } catch (error) {
              sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
              return
            }
            let ids
            try {
              ids = requireIds(body.sessionIds)
            } catch (error) {
              sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
              return
            }
            try {
              if (body.action === 'preview') {
                sendJson(res, 200, { ok: true, preview: await operations.preview(ids) })
                return
              }
              if (body.action === 'delete') {
                sendJson(res, 200, { ok: true, result: await operations.delete(ids) })
                return
              }
              sendJson(res, 400, { ok: false, error: 'action must be "preview" or "delete"' })
            } catch (error) {
              sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
            }
          },
        }),
      'archived-session-cleaner:route',
    )
  })

  ctx.inject(['tools'], (toolCtx) => {
    toolCtx.effect(
      () =>
        toolCtx.tools.register({
          name: 'delete_archived_sessions',
          description:
            'Permanently delete ONE archived session from disk and from the workspace registry. sessionId is required and must be the exact id the user provided — this tool never deletes every archived session at once, and an id must never be guessed. Only archived sessions can be deleted: a session whose agent is running is refused, and so is a session this app still holds in memory (the user must restart the app to release it); an id that is not archived is ignored. Subagent session logs recorded beneath the session are deleted with it; forks and other sessions are never touched. This is irreversible.',
          parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {
              sessionId: {
                type: 'string',
                description: 'The archived session to delete, exactly as the user provided it (the archived row offers Copy Session ID). Required; there is no "delete all archived sessions" mode.',
              },
            },
            required: ['sessionId'],
          },
          output: {
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                deleted: { type: 'array', items: { type: 'string' } },
                subagentsDeleted: { type: 'array', items: { type: 'string' } },
                skipped: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      id: { type: 'string' },
                      reason: { type: 'string' },
                    },
                  },
                },
                failed: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      id: { type: 'string' },
                      error: { type: 'string' },
                    },
                  },
                },
                ignored: { type: 'array', items: { type: 'string' } },
              },
            },
            render(_args, value) {
              const lines = [`Deleted ${value.deleted.length} archived session(s) and ${value.subagentsDeleted.length} subagent log(s).`]
              if (value.skipped.length > 0) lines.push(`Skipped: ${value.skipped.map((entry) => `${entry.id} (${entry.reason})`).join(', ')}`)
              if (value.failed.length > 0) lines.push(`Failed: ${value.failed.map((entry) => `${entry.id} (${entry.error})`).join(', ')}`)
              if (value.ignored.length > 0) lines.push(`Not archived, left untouched: ${value.ignored.join(', ')}`)
              return [{ type: 'text', text: lines.join('\n') }]
            },
          },
          async execute(args) {
            const sessionId = args !== null && typeof args === 'object' ? args.sessionId : undefined
            if (typeof sessionId !== 'string' || sessionId.length === 0) throw new Error('sessionId is required')
            return await operations.delete([sessionId])
          },
        }),
      'archived-session-cleaner:tool',
    )
  })
}
