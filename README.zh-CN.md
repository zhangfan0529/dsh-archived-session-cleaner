# 归档会话清理

[English](README.md) · **中文**

永久删除 DeepSeek Harness 里已归档的会话，连同它名下的子智能体会话日志。

![永久删除确认弹窗](assets/screenshot.png)

## 功能

- 已归档会话的 `...` 菜单里多一项「永久删除会话」
- 删掉会话日志、投影缓存和子智能体日志，侧栏里的行随即消失
- 只接受已归档会话，删前明确告诉你会删掉什么，删了不可恢复
- 也可以交给智能体：工具 `delete_archived_sessions`，一次一个 Session ID

## 安装

设置 → 插件 → 添加，填入：

```
github:zhangfan0529/dsh-archived-session-cleaner
```

装完刷新一次页面。本地目录安装就填绝对路径，例如 `/Users/you/plugins/dsh-archived-session-cleaner`。

需要 DeepSeek Harness 0.2.x + Web 界面。

## 使用

1. 会话还没归档的话，先在 `...` 菜单里点「归档会话」
2. 侧栏筛选切到「全部对话（显示已归档）」
3. 归档行的 `...` →「永久删除会话」→ 确认

想让智能体删，把归档行菜单里「复制 Session ID」拿到的那串 id 发给它。

## 注意

- 只删已归档的会话；正在运行、或还留在当前 App 内存里的会话会被跳过，重启 App 后再删
- 删除不可恢复
- 全程在本机执行，不联网、没有遥测

## 会删掉什么

- `$DSH_HOME/sessions/<project>/<sessionId>/`（JSONL 日志）
- `$DSH_HOME/storages/session_projcache/sessions/<sessionId>.json`
- 它名下的子智能体会话日志
- 工作区里的登记和归档集合里的条目

`$DSH_HOME` 默认是 `~/.dsh`。

## 许可

MIT，见 [LICENSE](LICENSE)。`assets/` 下的文件不在 MIT 许可范围内。

## 赞助

[![飞鱼 Token](assets/feiyutoken-logo.png)](https://www.feiyutoken.com)

**[飞鱼 Token](https://www.feiyutoken.com)**
