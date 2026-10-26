/**
 * Archived Session Cleaner — Client half.
 *
 * One entry point over the Host operation: a row in an archived Session's
 * `...` menu. It opens a confirmation dialog that mirrors the shipped
 * destructive-confirm dialog (title + close, description, footer buttons),
 * colored only from theme tokens so it follows light and dark mode.
 *
 * The Host route owns the deletion; the workspace registry frames and a
 * Session-list refresh keep the sidebar honest afterwards.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-archived-session-cleaner',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'archived-session-cleaner'
    const ROUTE = '/dsh-plugin/archived-sessions'

    /**
     * The harness client baseline exposes its primitives module to every
     * bundle. Rendering the shipped Modal, Button, and MenuItemButton keeps the
     * dialog and the menu row identical to the host — same geometry, motion,
     * mask blur, focus trap and theme tokens, in both light and dark mode.
     * The module is a private API that may change between versions, so a
     * missing shape falls back to the local copy at the bottom of this file.
     */
    let primitives = null
    try {
      primitives = require('@deepseek-ai/dsh-client-ui-primitives')
    } catch {
      primitives = null
    }
    const NativeModal = typeof primitives?.Modal === 'function' ? primitives.Modal : null
    const NativeButton = typeof primitives?.Button === 'function' ? primitives.Button : null
    const NativeMenuItemButton = typeof primitives?.MenuItemButton === 'function' ? primitives.MenuItemButton : null
    const nativeDialog = NativeModal !== null && NativeButton !== null

    const zh = {
      'menu.delete': '永久删除会话',
      'dialog.title': '永久删除归档会话？',
      'dialog.single': '“{title}”将被永久删除。此操作无法撤销。',
      'dialog.subagents': '同时删除 {m} 个子智能体会话日志。',
      'dialog.live': '其中 {n} 个正在运行，会被跳过。',
      'dialog.nothing': '没有可删除的归档会话。',
      'dialog.cancel': '取消',
      'dialog.confirm': '永久删除',
      'dialog.running': '正在删除…',
      'dialog.loading': '正在检查…',
      'dialog.done': '已删除 {n} 个归档会话。',
      'dialog.partial': '已删除 {n} 个；跳过 {s} 个，失败 {f} 个。',
      'dialog.close': '关闭',
      'dialog.failed': '删除失败：{message}',
    }

    const en = {
      'menu.delete': 'Delete session permanently',
      'dialog.title': 'Permanently delete archived session?',
      'dialog.single': '“{title}” will be permanently deleted. This cannot be undone.',
      'dialog.subagents': '{m} subagent session log(s) will be deleted too.',
      'dialog.live': '{n} of them are running and will be skipped.',
      'dialog.nothing': 'There is no archived session to delete.',
      'dialog.cancel': 'Cancel',
      'dialog.confirm': 'Delete permanently',
      'dialog.running': 'Deleting…',
      'dialog.loading': 'Checking…',
      'dialog.done': 'Deleted {n} archived session(s).',
      'dialog.partial': 'Deleted {n}; skipped {s}, failed {f}.',
      'dialog.close': 'Close',
      'dialog.failed': 'Delete failed: {message}',
    }

    /**
     * Geometry and colors mirror the shipped Modal/Button primitives — the
     * panel radius, layer-2 surface, 22/14/12/24 header padding, 16px title,
     * 14/22 description, 36px outline buttons and .5px border — using theme
     * tokens only, so light and dark mode both follow the harness.
     */
    const CSS = `
.asc-menu-item{display:flex;align-items:center;gap:6px;width:100%;min-height:34px;padding:6px 8px;color:var(--dsw-alias-state-error-primary);font-size:13px;line-height:20px;text-align:left;background:transparent;border:none;border-radius:var(--dsw-radius-md,8px);cursor:pointer}
.asc-menu-item:hover{background:var(--dsw-alias-interactive-bg-hover-danger)}
.asc-menu-item svg{flex:none;width:14px;height:14px}
.asc-root{pointer-events:auto;position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:24px}
.asc-mask{position:absolute;inset:0;background:var(--dsw-alias-bg-mask-1,rgba(0,0,0,.35));backdrop-filter:var(--dsw-mask-blur,blur(2px))}
.asc-dialog{box-sizing:border-box;position:relative;z-index:1;display:flex;flex-direction:column;gap:20px;width:min(380px,100%);padding:0 0 24px;overflow:hidden;border-radius:var(--dsw-radius-panel,16px);background:var(--dsw-alias-bg-layer-2);box-shadow:var(--dsw-elevation-prominent);animation:asc-enter var(--ds-transition-duration,140ms) var(--ds-ease-in-out,ease)}
.asc-dialog:focus{outline:none}
.asc-header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:22px 14px 12px 24px}
.asc-title{margin:0;font-size:16px;line-height:24px;font-weight:500;color:var(--dsw-alias-label-primary)}
.asc-close{flex:none;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:none;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.asc-close:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.asc-close:disabled{opacity:.4;cursor:not-allowed}
.asc-close svg{width:16px;height:16px}
.asc-description{margin:0;padding:0 24px;font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary)}
.asc-body{display:flex;flex-direction:column;gap:6px;padding:0 24px}
.asc-notes{display:flex;flex-direction:column;gap:6px}
.asc-note{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);white-space:pre-wrap}
.asc-error{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary);white-space:pre-wrap}
.asc-footer{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:0 24px}
.asc-button{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;height:36px;padding:0 14px;font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary);background:transparent;border:none;border-radius:var(--dsw-radius-md,8px);cursor:pointer}
.asc-button:disabled{cursor:not-allowed;opacity:.4}
.asc-button-outline{border:.5px solid var(--dsw-alias-border-l3);background:transparent}
.asc-button-outline:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.asc-button-danger:not(:disabled){color:var(--dsw-alias-state-error-primary)}
.asc-danger:not(:disabled){color:var(--dsw-alias-state-error-primary)}
.asc-button:focus-visible,.asc-close:focus-visible,.asc-menu-item:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
@keyframes asc-enter{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
`

    function TrashIcon({ size = 14 }) {
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: size,
          height: size,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
        },
        h('path', { d: 'M4 7h16' }),
        h('path', { d: 'M9 7V5.4A1.4 1.4 0 0 1 10.4 4h3.2A1.4 1.4 0 0 1 15 5.4V7' }),
        h('path', { d: 'M6.6 7l.8 11.1A2.1 2.1 0 0 0 9.5 20h5a2.1 2.1 0 0 0 2.1-1.9L17.4 7' }),
        h('path', { d: 'M10.2 11v4.6M13.8 11v4.6' }),
      )
    }

    function CloseIcon() {
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: 16,
          height: 16,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.8,
          strokeLinecap: 'round',
          'aria-hidden': true,
        },
        h('path', { d: 'M6 6l12 12M18 6L6 18' }),
      )
    }

    function createRequestStore() {
      let current = null
      let sequence = 0
      const listeners = new Set()
      const notify = () => {
        for (const listener of [...listeners]) listener()
      }
      return {
        get: () => current,
        subscribe: (listener) => {
          listeners.add(listener)
          return () => {
            listeners.delete(listener)
          }
        },
        open: (request) => {
          sequence += 1
          current = { ...request, key: sequence }
          notify()
        },
        close: () => {
          if (current === null) return
          current = null
          notify()
        },
      }
    }

    async function callHost(action, sessionIds) {
      const body = sessionIds === undefined || sessionIds === null ? { action } : { action, sessionIds }
      const response = await fetch(ROUTE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      let payload
      try {
        payload = await response.json()
      } catch {
        payload = undefined
      }
      if (!response.ok || payload === undefined || payload.ok !== true) {
        throw new Error((payload && payload.error) || `request failed (${response.status})`)
      }
      return payload
    }

    /** The `...` menu row: only an archived Session offers it. */
    function DeleteArchivedMenuItem(props) {
      const { sessionId, displayTitle, useWorkspaces, useMenuOpenState, t, open } = props
      const [, setMenuOpen] = useMenuOpenState()
      const archived = useWorkspaces((state) => state.archivedSessionIds.includes(sessionId))
      if (!archived) return null
      const select = (event) => {
        event?.stopPropagation?.()
        setMenuOpen(false)
        open({ sessionId, title: displayTitle || sessionId })
      }
      if (NativeMenuItemButton !== null) {
        return h(NativeMenuItemButton, { danger: true, icon: h(TrashIcon), onSelect: select }, t('menu.delete'))
      }
      return h(
        'button',
        { type: 'button', role: 'menuitem', className: 'asc-menu-item', onClick: select },
        h(TrashIcon),
        h('span', null, t('menu.delete')),
      )
    }

    /** The modal: one request at a time, keyed so its state dies with the request. */
    function PurgeDialog({ store, t, refreshSessions }) {
      const request = React.useSyncExternalStore(store.subscribe, store.get)
      if (request === null) return null
      return h(PurgeForm, { key: request.key, request, store, t, refreshSessions })
    }

    function PurgeForm({ request, store, t, refreshSessions }) {
      const [state, setState] = React.useState({ phase: 'loading' })
      const dialogRef = React.useRef(null)
      const cancelRef = React.useRef(null)
      const closing = state.phase === 'running'

      const close = () => {
        if (closing) return
        store.close()
      }

      React.useEffect(() => {
        let cancelled = false
        callHost('preview', [request.sessionId])
          .then((payload) => {
            if (!cancelled) setState({ phase: 'ready', preview: payload.preview })
          })
          .catch((error) => {
            if (!cancelled) setState({ phase: 'error', message: error instanceof Error ? error.message : String(error) })
          })
        return () => {
          cancelled = true
        }
      }, [request.key])

      React.useEffect(() => {
        if (nativeDialog) return
        cancelRef.current?.focus()
      }, [])

      React.useEffect(() => {
        if (nativeDialog) return
        const onKeyDown = (event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            close()
            return
          }
          if (event.key !== 'Tab' || dialogRef.current === null) return
          const focusable = dialogRef.current.querySelectorAll('button:not(:disabled)')
          if (focusable.length === 0) return
          const first = focusable[0]
          const last = focusable[focusable.length - 1]
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault()
            last.focus()
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first.focus()
          }
        }
        document.addEventListener('keydown', onKeyDown)
        return () => document.removeEventListener('keydown', onKeyDown)
      }, [closing])

      React.useEffect(() => {
        if (state.phase !== 'done') return
        const result = state.result
        if (result.skipped.length + result.failed.length > 0) return
        const timer = setTimeout(() => store.close(), 1600)
        return () => clearTimeout(timer)
      }, [state])

      const confirm = async () => {
        setState({ phase: 'running' })
        try {
          const payload = await callHost('delete', [request.sessionId])
          try {
            refreshSessions()
          } catch {
            /* the sidebar still updates from the workspace frames */
          }
          setState({ phase: 'done', result: payload.result })
        } catch (error) {
          setState({ phase: 'error', message: error instanceof Error ? error.message : String(error) })
        }
      }

      const preview = state.phase === 'ready' ? state.preview : undefined
      const nothingToDo = state.phase === 'ready' && preview.targets === 0
      const done = state.phase === 'done'
      const partial = done && state.result.skipped.length + state.result.failed.length > 0

      let description
      let notes = []
      let errorText = null
      if (done) {
        description = partial
          ? t('dialog.partial', { n: state.result.deleted.length, s: state.result.skipped.length, f: state.result.failed.length })
          : t('dialog.done', { n: state.result.deleted.length })
        if (partial) {
          notes = [
            [...state.result.skipped.map((entry) => `${entry.id} (${entry.reason})`), ...state.result.failed.map((entry) => `${entry.id} (${entry.error})`)].join('\n'),
          ]
        }
      } else if (nothingToDo) {
        description = t('dialog.nothing')
      } else {
        description = t('dialog.single', { title: request.title })
        if (state.phase === 'loading') notes = [t('dialog.loading')]
        else if (state.phase === 'running') notes = [t('dialog.running')]
        else if (state.phase === 'ready') {
          if (preview.subagents > 0) notes.push(t('dialog.subagents', { m: preview.subagents }))
          if (preview.live > 0) notes.push(t('dialog.live', { n: preview.live }))
        } else if (state.phase === 'error') {
          errorText = t('dialog.failed', { message: state.message })
        }
      }

      const action = (key, label, options) => {
        if (nativeDialog) {
          return h(
            NativeButton,
            {
              key,
              variant: 'outline',
              ...(options.danger === true ? { className: 'asc-danger' } : {}),
              ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
              onClick: options.onClick,
            },
            label,
          )
        }
        return h(
          'button',
          {
            key,
            ...(options.ref === undefined ? {} : { ref: options.ref }),
            type: 'button',
            className: `asc-button asc-button-outline${options.danger === true ? ' asc-button-danger' : ''}`,
            ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
            onClick: options.onClick,
          },
          label,
        )
      }

      const actions = []
      if (done) {
        if (partial) actions.push(action('close', t('dialog.close'), { onClick: close }))
      } else if (nothingToDo || state.phase === 'error') {
        actions.push(action('close', t('dialog.close'), { onClick: close }))
      } else {
        actions.push(action('cancel', t('dialog.cancel'), { ref: cancelRef, onClick: close, disabled: closing }))
        actions.push(
          action('confirm', t('dialog.confirm'), { danger: true, onClick: confirm, disabled: closing || state.phase !== 'ready' }),
        )
      }

      const bodyNodes = [
        ...notes.map((note, index) => h('p', { key: index, className: 'asc-note' }, note)),
        ...(errorText === null ? [] : [h('p', { key: 'error', className: 'asc-error' }, errorText)]),
      ]
      const bodyNode =
        bodyNodes.length === 0
          ? null
          : h('div', { className: nativeDialog ? 'asc-notes' : 'asc-body' }, ...bodyNodes)

      if (nativeDialog) {
        return h(
          NativeModal,
          {
            open: true,
            onClose: close,
            closeLabel: t('dialog.close'),
            title: t('dialog.title'),
            description,
            footer: actions.length === 0 ? undefined : h(React.Fragment, null, ...actions),
          },
          bodyNode === null ? undefined : bodyNode,
        )
      }

      return h(
        'div',
        { className: 'asc-root' },
        h('div', { className: 'asc-mask', 'aria-hidden': true, onPointerDown: () => close() }),
        h(
          'div',
          { ref: dialogRef, className: 'asc-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'asc-dialog-title' },
          h(
            'div',
            { className: 'asc-header' },
            h('h2', { id: 'asc-dialog-title', className: 'asc-title' }, t('dialog.title')),
            h(
              'button',
              { type: 'button', className: 'asc-close', 'aria-label': t('dialog.close'), disabled: closing, onClick: close },
              h(CloseIcon),
            ),
          ),
          h('p', { className: 'asc-description' }, description),
          bodyNode,
          actions.length === 0 ? null : h('div', { className: 'asc-footer' }, ...actions),
        ),
      )
    }

    /**
     * Headless repair: when the archive set shrinks, the Session catalog may
     * still carry a row whose log is already gone (the agent tool can delete
     * without opening this dialog). Re-pull the catalog once.
     */
    function CatalogRepair({ useWorkspaces, refreshSessions }) {
      const archived = useWorkspaces((state) => state.archivedSessionIds)
      const previous = React.useRef(archived)
      React.useEffect(() => {
        const before = previous.current
        previous.current = archived
        if (before.length <= archived.length) return undefined
        const timer = setTimeout(() => {
          try {
            refreshSessions()
          } catch {
            /* a failed pull leaves the next reconnect to repair the catalog */
          }
        }, 0)
        return () => clearTimeout(timer)
      }, [archived])
      return null
    }

    function installStyles() {
      const style = document.createElement('style')
      style.dataset.plugin = '@local/dsh-archived-session-cleaner'
      style.textContent = CSS
      document.head.appendChild(style)
      return () => {
        style.remove()
      }
    }

    return {
      inject: ['slots', 'locale', 'sessions'],
      apply(ctx) {
        ctx.effect(() => installStyles(), 'archived-session-cleaner:styles')
        ctx.effect(() => ctx.locale.register(NS, 'zh', zh), 'archived-session-cleaner:zh')
        ctx.effect(() => ctx.locale.register(NS, 'en', en), 'archived-session-cleaner:en')
        const t = ctx.locale.bind(NS)
        const store = createRequestStore()
        const open = (request) => store.open(request)
        const refreshSessions = () => {
          const sessions = ctx.sessions
          if (sessions !== undefined && typeof sessions.refresh === 'function') sessions.refresh()
        }

        ctx.slots.inject('sidebar.workspaces.session.menu.item', () =>
          ctx.slots.register(
            { name: 'sidebar.workspaces.session.menu.item', id: 'archived-session-cleaner:delete', order: 800 },
            (props) => h(DeleteArchivedMenuItem, { ...props, t, open }),
          ),
        )

        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            { name: 'shell.overlay', id: 'archived-session-cleaner:dialog', order: 800 },
            () => h(PurgeDialog, { store, t, refreshSessions }),
          ),
        )

        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            { name: 'shell.overlay', id: 'archived-session-cleaner:repair', order: 810 },
            (props) => h(CatalogRepair, { ...props, refreshSessions }),
          ),
        )
      },
    }
  },
})
