# ACGagent

一个面向 ACG（日漫/漫画/游戏）资讯与资源管理的 Web Agent 项目。

## 核心功能

- `Dashboard`：展示每日 ACG 新闻摘要、分类资讯与推荐内容。
- `Ask Agent`：按作品名进行问答查询，返回基础信息与资源链接。
- `Recommend`：获取游戏推荐与折扣信息（含 Steam 商店跳转）。
- `Library`：扫描本地媒体目录，管理已收录文件。
- `Settings`：配置时区、偏好标签、代理与 LLM API 参数。
- `News Brief`：点击新闻卡片弹出“新闻浓缩”浮层，支持重新生成。
- `Prisma Persistence`：使用 SQLite 本地持久化日报、文章与浓缩摘要。

## 技术栈

- `Next.js App Router + React + TypeScript`
- `Prisma + SQLite`
- `undici`（HTTP 请求）
- `rss-parser`（新闻源解析）
- `Vitest`（测试）

## 快速启动（Windows）

```powershell
$env:Path = "$(Join-Path $PWD '.tools\node');$env:Path"
& .\.tools\node\npm.cmd install
& .\.tools\node\npx.cmd prisma generate
& .\.tools\node\npx.cmd prisma db push
& .\.tools\node\npm.cmd run dev
```

默认地址：`http://127.0.0.1:3000`

## 每日新闻任务（Windows 计划任务）

- 任务脚本：`scripts/run-news-job.ps1`
- 手动执行：

```powershell
& .\.tools\node\npm.cmd run job:news
```

## 环境变量示例

可参考 `.env.example`，常用项如下：

- `DATABASE_URL`（默认 SQLite 文件）
- `ACGAGENT_LLM_ENABLED`
- `ACGAGENT_LLM_BASE_URL`
- `ACGAGENT_LLM_MODEL`
- `ACGAGENT_LLM_API_KEY`
- `ACGAGENT_PROXY_ENABLED`
- `ACGAGENT_PROXY_URL`

## 说明

- 新闻抓取、翻译与浓缩会写入数据库，前端优先读取本地缓存，减少等待时间。
- 若外网接口不可达，部分功能会回退到本地或镜像数据源。
