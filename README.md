# Sprite Light Lab

纯本地运行的 2D 精灵整合、Palette Swap 与法线光照预览工具。

## 功能

- 选择本地目录、拖放或选择逐帧 PNG 与法线图。
- 自动识别 `_n`、`_normal` 法线后缀，支持手工校正。
- 支持 Aseprite、TexturePacker JSON 图集，并校验颜色与法线同布局。
- 动作自动分组、重命名、拖拽排序、播放、暂停、循环、逐帧和帧率控制。
- 索引色 Palette Swap：最多 256 色精确 LUT 替换，保留 Alpha。
- 全彩 Palette Swap：颜色规则、容差、色相、饱和度、亮度、对比度和整体染色。
- 多色板管理、撤销/重做、GPL 与 HEX 色板导入导出。
- 环境光、方向光、点光、聚光，最多 32 盏活动光源。
- 法线强度、绿色通道翻转、风格化漫反射和可选高光。
- WebGL2 与 WebGPU 双后端组合 Shader。
- 当前预览 PNG、透明当前帧 PNG、轻量项目 JSON、自包含 JSON 和 ZIP 项目包导出。
- IndexedDB 自动保存、目录句柄持久化、PWA 离线安装。
- 素材只在浏览器本地处理，不上传服务器。

## 开发

```powershell
npm install
npm run dev
```

浏览器访问 Vite 输出的本地地址。点击“载入演示”验证索引色模式，点击“全彩演示”验证渐变与全彩颜色规则。

## 验证

```powershell
npm run lint
npm run test:coverage
npm test -- --run
npm run build
npm run test:e2e
```

Playwright 默认使用本机 Microsoft Edge，并验证 WebGL2、WebGPU、项目 ZIP 往返和 PWA 离线启动。

## 浏览器

完整能力面向最新版 Chrome / Edge。其他浏览器可使用文件选择和下载降级，但不保证目录句柄与 PWA 行为一致。