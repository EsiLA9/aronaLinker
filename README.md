# Arona Linker

一个适配 GitHub Pages 的静态前端站点，当前包含一个小游戏：

- `starter/`：Chara-Halo 图片连连看

## 本地运行

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

构建产物输出到 `dist/`。配置里使用了相对 `base`，适合部署到 GitHub Pages 的仓库子路径。

## 资源包

仓库根目录的 `resource.zip` 会在构建时自动复制到 `dist/resource.zip`，并作为 `starter/` 页面的默认素材包自动加载。
