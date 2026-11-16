# 四季小猫 · 星空里的时间

使用 HTML、JavaScript 和 Canvas 2D 绘制的四季音乐动画。黑白两只小猫在星空与草地之间活动，金色指针带动春、夏、秋、冬的变化。

画面尺寸为 1020 × 576，时长约 24.03 秒，播放器按 30 fps 调度绘制。小猫、草地、星空和天气均由代码生成。

本仓库保存可编辑源码。可直接打开的独立 HTML 成品仅作为 [Releases 附件](https://github.com/Wenquxing884/seasons-cats/releases) 分发，不提交到 Git 历史。

## 下载播放

1. 打开最新 Release。
2. 在 Assets 中下载 `四季小猫-独立播放.html`。
3. 使用现代浏览器打开下载的文件，点击播放。

独立文件已内置场景代码、指针数据和音乐，可离线播放，无需服务器或安装依赖。播放器支持暂停、跳转、循环、音量调节与全屏；快捷键为 `空格`、`←` / `→`、`M` 和 `F`。

## 从源码构建

安装 Node.js 22 或更高版本后，在仓库根目录运行：

```sh
node tools/build-standalone.mjs
```

构建仅使用 Node.js 内置模块，无需 `npm install`。输出文件位于仓库根目录：

```text
四季小猫-独立播放.html
```

构建器将 8 个 JavaScript 模块、指针采样数据和音轨嵌入播放器模板。产物的 `build-manifest` 记录输入文件 SHA-256 和构建时间。重新构建会更新构建时间，因此同一份源码产生的 HTML 不一定逐字节相同。

## 源码说明

| 路径 | 用途 |
| --- | --- |
| `seasons.html` | Canvas 场景入口，提供 `window.film.ready` 和 `window.film.frame(t)` |
| `season-scene.js` | 场景编排、四季草地、天气和时钟绘制 |
| `cat-actors.js` | 小猫运动和姿态编排 |
| `cat-model.js`、`cat-shapes.js` | 小猫造型、几何和材质 |
| `starfield.js` | 星空背景 |
| `autumn-wind.js` | 秋季风场和飘动效果 |
| `snow-contacts.js` | 雪地接触效果 |
| `pointer-motion.js` | 指针运动 |
| `references/pointer-every-frame.json` | 指针逐帧采样数据 |
| `assets/bed.m4a` | 构建时嵌入的音乐 |
| `tools/build-standalone.mjs` | 单文件播放器构建脚本 |
| `tools/standalone-player.template.html` | 播放器界面与控制逻辑 |
| `film.html` | 原制作环境的合成入口 |
| `cat-design.html` | 角色造型预览入口 |

`seasons.html` 是供宿主调用的场景，不会自行播放。日常观看或检查完整效果，请先构建并打开独立 HTML。修改动画时编辑相应 JavaScript 模块；修改播放器时编辑模板，再重新构建。

仓库保留了构建所需的音乐与指针数据；参考图片、旧视频、检查截图、制作缓存和本机历史记录均不属于当前运行依赖。Canvas 是浏览器提供的绘图 API，无需额外安装。

## 发布方式

- Git 仓库：源码、必要数据、构建工具与说明。
- GitHub Releases：独立 HTML 成品。
- `.gitignore`：排除独立成品、`.film/` 缓存和导出视频。

源码保留原始换行字节，避免跨平台检出时改变发布成品 manifest 中记录的输入哈希。
