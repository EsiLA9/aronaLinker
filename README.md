# Arona Linker

一个静态前端站点，当前包含一个小游戏：

- `starter/`：Chara-Halo 图片连连看

项目可以部署到 GitHub Pages，也可以部署到 Cloudflare Workers。

## 本地运行

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

构建产物输出到 `dist/`。Vite 配置使用相对 `base`，适合静态托管和 Worker 资源目录分发。

## 部署到 Cloudflare Workers

当前仓库已经包含：

- `wrangler.jsonc`：Worker 配置
- `src/worker.ts`：静态资源转发入口

部署步骤：

```bash
npm run build
npx wrangler login
npm run cf:deploy
```

本地预览 Worker：

```bash
npm run build
npm run cf:dev
```

说明：

- `dist/` 会作为 Worker 的静态资源目录上传。
- `/starter/`、`/starter` 这类目录路由会自动回退到对应的 `index.html`。
- 仓库根目录的 `resource.zip` 会在构建时自动复制到 `dist/resource.zip`，并作为 `starter/` 页面的默认素材包自动加载。

## 环境要求

- 当前项目锁定 `wrangler` 3.x，兼容 Node 18。
- 如果你后续想升级到 `wrangler` 4.x，需要先升级到 Node 22 或更高版本。
