# Sprite Light Lab Launcher

这是 Sprite Light Lab 的 Windows 单文件启动器。它使用 .NET 9 WinForms 和 `TcpListener`，将前端 `dist` 内嵌到 EXE 中，不需要目标电脑安装 Node.js 或 .NET。

## 开发构建

```powershell
.\launcher\build-launcher.ps1
```

脚本默认：

1. 使用现有 `node_modules` 执行 `npm run build`；目录不存在时才执行 `npm ci`。
2. 将 `dist` 压缩为 `Resources\wwwroot.zip`。
3. 发布 `win-x64` 自包含单文件 EXE。
4. 复制最终文件到桌面 `SpriteLightLab.exe`。

仅验证 C# 编译：

```powershell
dotnet build .\launcher\SpriteLightLab.Launcher\SpriteLightLab.Launcher.csproj
```

## 运行参数

- `--no-browser`：用于自动测试，启动器窗口会显示，但不自动打开默认浏览器。

## 固定行为

- 只监听 `127.0.0.1`。
- 端口顺序为上次成功端口、5173、5174–5199。
- 仅在 5173 空闲时允许“优先切回 5173”。
- 关闭主窗口会停止服务并退出；最小化不会停止服务。
- 状态文件位于 `%LOCALAPPDATA%\SpriteLightLab\launcher-state.json`。
- 日志位于 `%LOCALAPPDATA%\SpriteLightLab\logs\launcher.log`。