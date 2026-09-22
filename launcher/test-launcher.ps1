[CmdletBinding()]
param(
    [string]$ExePath = (Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) 'SpriteLightLab.exe')
)

$ErrorActionPreference = 'Stop'
$statePath = Join-Path $env:LOCALAPPDATA 'SpriteLightLab\launcher-state.json'
$originalState = $null
$hadOriginalState = Test-Path -LiteralPath $statePath
if ($hadOriginalState) {
    $originalState = [Convert]::ToBase64String([IO.File]::ReadAllBytes($statePath))
}

$blocker = $null
$launcher = $null
$testCount = 0

function Assert-True([bool]$Condition, [string]$Message) {
    $script:testCount++
    if (-not $Condition) {
        throw "断言失败：$Message"
    }
}

function Write-TestState([int]$Port) {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $statePath) | Out-Null
    $state = [ordered]@{ lastPort = $Port; lastStartedAt = [DateTimeOffset]::Now.ToString('o') }
    [IO.File]::WriteAllText($statePath, ($state | ConvertTo-Json), [Text.Encoding]::UTF8)
}

function Get-TestState {
    if (-not (Test-Path -LiteralPath $statePath)) {
        return $null
    }
    return ([IO.File]::ReadAllText($statePath, [Text.Encoding]::UTF8) | ConvertFrom-Json)
}

function Get-RawResponse([int]$Port, [string]$Target, [string]$Method = 'GET') {
    $client = New-Object Net.Sockets.TcpClient
try {
        $client.Connect('127.0.0.1', $Port)
        $client.ReceiveTimeout = 5000
        $client.SendTimeout = 5000
        $stream = $client.GetStream()
        $request = "$Method $Target HTTP/1.1`r`nHost: 127.0.0.1:$Port`r`nConnection: close`r`n`r`n"
        $requestBytes = [Text.Encoding]::ASCII.GetBytes($request)
        $stream.Write($requestBytes, 0, $requestBytes.Length)
        $stream.Flush()

        $memory = New-Object IO.MemoryStream
        $buffer = New-Object byte[] 4096
        while (($read = $stream.Read($buffer, 0, $buffer.Length)) -gt 0) {
            $memory.Write($buffer, 0, $read)
        }

        $bytes = $memory.ToArray()
        $text = [Text.Encoding]::UTF8.GetString($bytes)
        $headerEnd = $text.IndexOf("`r`n`r`n", [StringComparison]::Ordinal)
        if ($headerEnd -lt 0) {
            throw "HTTP 响应缺少完整响应头：$Target"
        }

        return [pscustomobject]@{
            Status = [int]$text.Substring(9, 3)
            Headers = $text.Substring(0, $headerEnd)
            Body = $text.Substring($headerEnd + 4)
        }
    }
    finally {
        $client.Dispose()
    }
}

function Wait-ForHttp([int]$Port, [int]$TimeoutSeconds = 20) {
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        try {
            $response = Get-RawResponse $Port '/'
            if ($response.Status -eq 200) {
                return
            }
        }
        catch {
        }
        Start-Sleep -Milliseconds 250
    }
    throw "等待 http://127.0.0.1:$Port 启动超时。"
}

function Start-TestLauncher {
    if (-not (Test-Path -LiteralPath $ExePath)) {
        throw "找不到待测试 EXE：$ExePath"
    }
    return Start-Process -FilePath $ExePath -ArgumentList '--no-browser' -PassThru
}

function Stop-LauncherGracefully($Process) {
    if ($null -eq $Process -or $Process.HasExited) {
        return
    }

    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        $Process.Refresh()
        if ($Process.MainWindowHandle -ne 0) {
            break
        }
        Start-Sleep -Milliseconds 200
    }

    if ($Process.MainWindowHandle -eq 0) {
        throw "无法取得启动器主窗口，PID：$($Process.Id)"
    }

    if (-not $Process.CloseMainWindow()) {
        throw "无法请求启动器关闭，PID：$($Process.Id)"
    }

    if (-not $Process.WaitForExit(7000)) {
        throw "启动器关闭超时，PID：$($Process.Id)"
    }
}

function Assert-PortReleased([int]$Port) {
    Start-Sleep -Milliseconds 500
    $listener = Get-NetTCPConnection -State Listen -LocalAddress 127.0.0.1 -LocalPort $Port -ErrorAction SilentlyContinue
    Assert-True (-not $listener) "端口 $Port 未释放。"
}

    Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class LauncherWindowTest
{
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool EnumChildWindows(IntPtr hWnd, EnumWindowsProc callback, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

    [DllImport("user32.dll")]
    public static extern IntPtr SendMessage(IntPtr hWnd, uint message, IntPtr wParam, IntPtr lParam);

    public static string[] ReadTexts(IntPtr root)
    {
        var values = new List<string>();
        EnumChildWindows(root, (handle, state) =>
        {
            var text = new StringBuilder(512);
            GetWindowText(handle, text, text.Capacity);
            if (text.Length > 0)
            {
                values.Add(text.ToString());
            }
            return true;
        }, IntPtr.Zero);
        return values.ToArray();
    }

    public static bool ClickByText(IntPtr root, string expected)
    {
        var clicked = false;
        EnumChildWindows(root, (handle, state) =>
        {
            var text = new StringBuilder(512);
            GetWindowText(handle, text, text.Capacity);
            if (text.ToString() == expected)
            {
                SendMessage(handle, 0x00F5, IntPtr.Zero, IntPtr.Zero);
                clicked = true;
                return false;
            }
            return true;
        }, IntPtr.Zero);
        return clicked;
    }
}
"@

function Get-LauncherWindowTexts($Process) {
    $Process.Refresh()
    return [LauncherWindowTest]::ReadTexts($Process.MainWindowHandle)
}

function Invoke-LauncherButton($Process, [string]$Text) {
    $Process.Refresh()
    return [LauncherWindowTest]::ClickByText($Process.MainWindowHandle, $Text)
}
try {
    Write-TestState 5173
    $blocker = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 5173)
    $blocker.Start()

    $launcher = Start-TestLauncher
    Wait-ForHttp 5174

    $beforeLanguageTexts = Get-LauncherWindowTexts $launcher
    if ($beforeLanguageTexts -contains 'English') {
        Assert-True (Invoke-LauncherButton $launcher 'English') '无法点击 English 语言按钮。'
        Start-Sleep -Milliseconds 300
    }

    $englishTexts = Get-LauncherWindowTexts $launcher
    Assert-True ($englishTexts -contains '● Running') '切换英文后运行状态未翻译。'
    Assert-True ($englishTexts -contains 'Open App') '切换英文后主按钮未翻译。'
    $englishState = Get-TestState
    Assert-True ($englishState.Language -eq 'en') '英文语言选择未写入状态文件。'

    Assert-True (Invoke-LauncherButton $launcher '中文') '无法点击中文语言按钮。'
    Start-Sleep -Milliseconds 300
    $chineseTexts = Get-LauncherWindowTexts $launcher
    Assert-True ($chineseTexts -contains '● 运行中') '切回中文后运行状态未翻译。'
    Assert-True ($chineseTexts -contains '打开界面') '切回中文后主按钮未翻译。'
    $chineseState = Get-TestState
    Assert-True ($chineseState.Language -eq 'zh-CN') '中文语言选择未写入状态文件。'
    $state = Get-TestState
    Assert-True ($state.lastPort -eq 5174) '端口冲突后没有把 lastPort 更新为 5174。'

    $index = Get-RawResponse 5174 '/'
    Assert-True ($index.Status -eq 200 -and $index.Body.Contains('Sprite Light Lab')) '首页未正常返回。'
    Assert-True ($index.Headers -match '(?im)^Content-Type:\s*text/html; charset=utf-8') '首页 MIME 不正确。'
    Assert-True ($index.Headers -match '(?im)^Cache-Control:\s*no-store') '首页未使用 no-store。'

    $manifest = Get-RawResponse 5174 '/manifest.webmanifest'
    Assert-True ($manifest.Status -eq 200) 'manifest.webmanifest 未正常返回。'
    Assert-True ($manifest.Headers -match '(?im)^Content-Type:\s*application/manifest\+json; charset=utf-8') 'manifest MIME 不正确。'
    Assert-True ($manifest.Headers -match '(?im)^Cache-Control:\s*no-cache') 'manifest 缓存策略不正确。'

    $serviceWorker = Get-RawResponse 5174 '/sw.js'
    Assert-True ($serviceWorker.Status -eq 200) 'sw.js 未正常返回。'
    Assert-True ($serviceWorker.Headers -match '(?im)^Cache-Control:\s*no-store') 'sw.js 未使用 no-store。'

    $assetMatch = [regex]::Match($index.Body, '/assets/[^"'']+\.js')
    Assert-True $assetMatch.Success '首页中未找到构建后的 JS 资源。'
    $asset = Get-RawResponse 5174 $assetMatch.Value
    Assert-True ($asset.Status -eq 200) '构建后的 JS 资源未正常返回。'
    Assert-True ($asset.Headers -match '(?im)^Content-Type:\s*text/javascript; charset=utf-8') 'JS MIME 不正确。'
    Assert-True ($asset.Headers -match '(?im)^Cache-Control:\s*public, max-age=31536000, immutable') '构建资源缓存策略不正确。'

    $fallback = Get-RawResponse 5174 '/missing-route'
    Assert-True ($fallback.Status -eq 200) '无扩展名路由未回退到 index.html。'
    $missingAsset = Get-RawResponse 5174 '/missing.js'
    Assert-True ($missingAsset.Status -eq 404) '不存在的资源没有返回 404。'
    $post = Get-RawResponse 5174 '/' 'POST'
    Assert-True ($post.Status -eq 405) 'POST 没有返回 405。'
    Assert-True ($post.Headers -match '(?im)^Allow:\s*GET, HEAD') '405 响应缺少 Allow 头。'
    $traversal = Get-RawResponse 5174 '/%2e%2e/secret.js'
    Assert-True ($traversal.Status -eq 400) 'URL 编码路径穿越未被拒绝。'
    $sample = Get-RawResponse 5174 '/samples/sample-normal-maps-2d.spritelab.zip'
    Assert-True ($sample.Status -eq 200) '示例项目 ZIP 未正常返回。'

    $second = Start-Process -FilePath $ExePath -ArgumentList '--no-browser' -PassThru
    Assert-True ($second.WaitForExit(5000)) '第二个启动器实例未及时退出。'
    $launcher.Refresh()
    Assert-True (-not $launcher.HasExited) '第二个实例退出时，第一个启动器也被关闭。'
    Assert-True (@(Get-Process -Name 'SpriteLightLab' -ErrorAction SilentlyContinue).Count -eq 1) '同时存在多个 SpriteLightLab 进程。'

    Stop-LauncherGracefully $launcher
    Assert-PortReleased 5174

    $launcher = Start-TestLauncher
    Wait-ForHttp 5174
    $restartState = Get-TestState
    Assert-True ($restartState.lastPort -eq 5174) '重启后没有优先复用上次端口。'
    Stop-LauncherGracefully $launcher
    $launcher = $null
    Assert-PortReleased 5174

    Write-Host "集成测试通过：$testCount 项断言。"
}
finally {
    if ($null -ne $launcher -and -not $launcher.HasExited) {
        Stop-Process -Id $launcher.Id -Force -ErrorAction SilentlyContinue
    }
    if ($null -ne $blocker) {
        $blocker.Stop()
    }

    Write-TestState 5173
    if (-not $hadOriginalState) {
        [IO.File]::Delete($statePath)
    }
    else {
        [IO.File]::WriteAllBytes($statePath, [Convert]::FromBase64String($originalState))
    }
}