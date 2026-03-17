# ACGagent

一个面向 ACG（日漫 / 漫画 / 游戏）资讯与资源管理的 Web Agent 项目。

## 核心功能

- `Dashboard`：展示每日 ACG 新闻摘要、分类资讯和推荐内容
- `Ask Agent`：按作品名称查询，返回基础信息和可用资源入口
- `Recommend`：生成游戏推荐并接入 Steam 商店跳转
- `Library`：扫描并管理本地媒体文件
- `Settings`：配置时区、偏好、代理与 LLM 参数
- `News Brief`：点击新闻卡片弹出“新闻浓缩”悬浮层
- `Prisma Persistence`：使用 SQLite 持久化新闻、浓缩和查询历史

## 技术栈

- `Next.js App Router + React + TypeScript`
- `Prisma + SQLite`
- `undici`（HTTP 请求）
- `rss-parser`（新闻源解析）
- `Vitest`（测试）

## 快速启动（Windows）

```powershell
$env:Path = "$(Join-Path $PWD '.tools\\node');$env:Path"
& .\\.tools\\node\\npm.cmd install
& .\\.tools\\node\\npx.cmd prisma generate
& .\\.tools\\node\\npx.cmd prisma db push
& .\\.tools\\node\\npm.cmd run dev
```

默认地址：`http://127.0.0.1:3000`

## 每日新闻任务（可用于 Windows 计划任务）

- 任务脚本：`scripts/run-news-job.ps1`
- 手动执行：

```powershell
& .\\.tools\\node\\npm.cmd run job:news
```

## 环境变量

请复制 `.env.example` 为 `.env` 后再填写。仓库中默认不包含任何真实密钥。

## 说明

- 新闻抓取、翻译与浓缩会写入数据库，前端优先读取缓存以减少等待时间
- 外网接口不可达时，部分功能会降级为本地/回退策略
