# 砚台 InkStone · 博客自动写作台

围绕 Jekyll 博客仓库构建的自动化写作工具：由本机 CLI Agent（Codex / Claude Code）拟定写作计划、撰写文章，自动写入博客仓库 `_docs/<分类>/`、校验 front-matter、git 提交推送，经 GitHub Pages 自动发布上线。

这个工具最初就是按照博客项目 [lmz0506/blog](https://github.com/lmz0506/blog) 的内容组织与发布流程做的，默认假设目标仓库采用 `_docs/<分类>/` 文档结构，并通过 GitHub Pages 发布。

## 工具定位

- **对应博客项目**：[`lmz0506/blog`](https://github.com/lmz0506/blog)
- **默认适配场景**：Jekyll 博客仓库、文章位于 `_docs/<分类>/*.md`、front-matter 字段规范化、git push 后由 GitHub Pages 发布
- **是否只能用于这个博客**：不是。只要目标仓库结构接近，也可以在配置中心调整仓库路径、分支、文档目录与执行器后复用；但当前产品设计、默认配置与验证案例都以 `lmz0506/blog` 为基准

## 功能特性

- **智能任务生成**：选定分类与执行器，Agent 后台拟定一批文章写作计划（标题 + 摘要 + 排期），可编辑后批量/单条确认为正式任务
- **任务队列执行**：手动执行与定时调度统一入队（状态"已入队"，天然去重防重复执行），单一消费者串行执行；队列持久化在数据库中，程序中断重启后自动恢复
- **定时调度**：每 60 秒将到期任务（排期 ≤ 当前时间，支持精确到秒）入队执行
- **默认任务兜底**：永久存在的兜底任务——当天没有任何排期任务且当天未执行过时，自动随机选类写一篇
- **发布保障**：文章路径防穿越校验、front-matter 自动补齐（layout/title/category/date/tags，分类用展示名）、配图连带提交、推送失败可页面手动重推
- **配置中心**：仓库路径（目录浏览器选择）、分类管理（扫描仓库同步、默认池）、执行器（命令自动扫描/文件浏览/手动输入、行内测试）、自动化开关

## 环境要求

- Node.js ≥ 22.5（使用内置 `node:sqlite`）
- 本机已安装并登录至少一个 CLI Agent（codex / claude 等）
- 目标博客为 git 仓库，文章目录形如 `_docs/<分类>/*.md`

## 快速开始

```bash
npm run install:all     # 安装依赖

# 开发模式：server(4321) + Vite(4173)，访问 http://localhost:4173
npm run dev

# 生产模式：构建前端后由 server 托管，访问 http://localhost:4321
npm run build
npm run start
```

> `npm run dev` 拉起的 server 不带热重载（任务执行动辄数分钟，watch 重启会杀死执行中的 Agent）；单独调试 server 代码用 `npm run dev:server`。

## 两套运行环境

### 1. 开发 / 调试环境（npm）

- 启动方式：`npm run dev` / `npm run start`
- 用途：日常开发、接口调试、前端联调
- 数据目录：项目根 `storage/`
- 数据库文件：`storage/blog-tool.db`

这套环境继续使用项目工作区内的数据库，不和桌面安装版共享数据。

### 2. 桌面安装环境（exe）

- 本地预览：`npm run start:desktop`
- 生成安装包：`npm run dist:win`
- 本地打包并直接发布 GitHub Release：`npm run dist:win:publish`
- 产物位置：`release/`（示例：`BlogTool-Setup-<version>.exe`）
- 安装版数据目录：`<安装目录>/storage/`
- 安装版数据库文件：`<安装目录>/storage/blog-tool.db`

桌面安装版首次启动时会自动创建 `storage/` 目录、初始化 SQLite 数据库并建表；后续升级安装时，程序文件会更新，但现有 `storage/` 目录和库文件会保留，因此原有数据不会丢失。

> 两套环境的数据完全隔离：`npm` 开发态只使用项目根 `storage/`，安装版只使用安装目录旁的 `storage/`。
>
> 由于数据库目录跟随安装目录，Windows 下建议保持默认的**当前用户可写**安装路径；如果手动装到 `Program Files` 这类受保护目录，数据库写入可能受限。

## 桌面安装包说明

桌面版采用 Electron 壳，内部仍然运行现有 `server + web` 架构，只是改成由桌面进程拉起本地服务。为避免把开发机硬编码路径带进安装包：

- 开发态保留你当前的默认仓库/执行器种子逻辑
- 桌面安装态首次建库时，博客仓库路径默认为空，种子执行器默认禁用
- 安装后第一次使用应先进入「配置中心」，填写博客仓库路径并配置可用的 CLI Agent 执行器

## GitHub 发布与自动更新

### GitHub Actions 自动发布

项目已包含工作流 [release-desktop.yml](./.github/workflows/release-desktop.yml)：

- 推送标签 `vX.Y.Z` 时：
  - 校验 `package.json` 里的 `version` 必须等于标签版本
  - 在 GitHub Actions 中自动构建 Windows 安装包
  - 自动发布到当前仓库的 GitHub Releases
- 手动触发 `workflow_dispatch` 时：
  - 构建安装包
  - 不发布 Release，只上传 Actions artifact 供下载

### 自动更新行为

- 安装版应用启动后会自动检查 GitHub Releases 上是否有新版本
- 发现新版本后自动后台下载
- 下载完成后弹窗提示立即安装，或等下次退出程序时自动安装
- 托盘右键菜单包含「检查更新」，可手动触发一次更新检查

### 使用前提

- GitHub Releases 构建产物必须由 GitHub Actions 发布，工作流会自动注入 `GITHUB_REPOSITORY`
- 自动更新只在**打包版**中启用，`npm` 开发模式不会检查更新
- 若要手动在本地直接发布 Release，需要提供：
  - `GH_TOKEN`
  - `GITHUB_REPOSITORY=owner/repo`

## 使用流程

1. **配置中心**（进入系统默认页）
   - 仓库与发布：确认博客仓库路径、分支、文档目录、自动推送
   - 分类管理：点「扫描仓库分类」同步分类与文章索引（自动识别目录名与 front-matter 分类名的差异）
   - 执行器：确认命令可用（自动扫描/浏览/手输），点「测试」验证
   - 自动化：默认执行器、内置默认任务、「到期任务自动执行」开关
2. **智能任务生成**：选分类、填目标，提交后 Agent 后台生成计划（1-3 分钟），结果可编辑排期（精确到秒）
3. **确认任务**：勾选批量加入或全部确认，同一排期值的任务项合并为一个任务
4. **执行**：手动「立即执行」或开启定时调度到点自动执行；执行为后台队列模式，界面每 5 秒自动刷新状态
5. **发布**：执行成功自动提交推送；任务详情页可查看文章路径、提交/推送状态，推送失败可手动重推

## 定时调度策略

- 开关：配置中心「自动化」→「到期任务自动执行」
- 每 60 秒检查：到期的待执行任务全部入队，按排期先后串行执行（同一时刻只跑一个 Agent）
- 纯日期排期视为当天 00:00 起可执行；带时分秒的排期到点才执行
- 失败的任务不自动重试（防止无限烧 token），页面点「重新执行」即可重新入队
- 默认任务兜底：当天没有任何排期任务（不论状态）且当天未执行过 → 自动执行一次，执行后自动复位待用

## 执行器说明

- 执行器 = 本机 CLI Agent 命令，Prompt 经 stdin/参数传入，最终结果为 stdout 中带 `BLOG_TOOL_TASK_DONE` 标记的 JSON
- 工作目录默认为博客仓库（Agent 在仓库内写文章）；参数模板中的 `{toolRoot}` 运行时解析为本工具目录（codex `--add-dir` 用）
- 默认超时 30 分钟；成功判定以完成标记为准（打印结果后被超时终止不误判）
- Prompt 内置约束：UTF-8 读写、只允许查看目标分类目录、禁读无关目录、禁自行 git 操作

## 目录结构

```
server/          Express API + 任务队列 + 定时调度（端口 4321）
  src/routes/      repository / categories / drafts / tasks / executors / system
  src/services/    执行器、任务队列、调度器、git 发布、front-matter 校验等
web/             React + Vite 前端（开发端口 4173，构建后由 server 托管）
storage/         SQLite 数据库（blog-tool.db）
docs/            需求文档与全部编号变更文档
desktop/         Electron 桌面入口与安装包运行时 package
electron-builder.config.cjs  Electron Builder 配置（含 GitHub 发布配置）
scripts/dev.mjs  一键拉起 server + web
scripts/electron-after-pack.cjs  安装包 afterPack 钩子（补写运行时 package.json）
```

## 文档

- 需求总览：[docs/需求文档.md](./docs/需求文档.md)
- 桌面发布手册：[docs/桌面应用发布操作手册.md](./docs/桌面应用发布操作手册.md)
- 变更历史：docs/ 下按 `年月日-序号-名称` 编号的变更文档
