[CmdletBinding()]
param(
    [switch]$SkipFrontendBuild,
    [switch]$FrameworkDependent,
    [switch]$SkipDesktopCopy
)

$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$project = Join-Path $PSScriptRoot 'SpriteLightLab.Launcher\SpriteLightLab.Launcher.csproj'
$resource = Join-Path $PSScriptRoot 'SpriteLightLab.Launcher\Resources\wwwroot.zip'
$publishDirectory = Join-Path $PSScriptRoot 'publish'
$desktopTarget = Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) 'SpriteLightLab.exe'

function Assert-LastExitCode([string]$Step) {
    if ($LASTEXITCODE -ne 0) {
        throw "$Step 失败，退出代码：$LASTEXITCODE"
    }
}

Push-Location $repo
try {
    if (-not $SkipFrontendBuild) {
        if (-not (Test-Path -LiteralPath (Join-Path $repo 'node_modules'))) {
            & npm ci
            Assert-LastExitCode 'npm ci'
        }

        & npm run build
        Assert-LastExitCode 'npm run build'
    }

    $distIndex = Join-Path $repo 'dist\index.html'
    if (-not (Test-Path -LiteralPath $distIndex)) {
        throw "找不到前端构建产物：$distIndex"
    }

    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $resource) | Out-Null
    [IO.File]::Delete($resource)
    Compress-Archive -Path (Join-Path $repo 'dist\*') -DestinationPath $resource -CompressionLevel Optimal

    New-Item -ItemType Directory -Force -Path $publishDirectory | Out-Null
    $publishArguments = @(
        $project,
        '-c', 'Release',
        '-r', 'win-x64',
        '--nologo',
        '-o', $publishDirectory,
        '-p:DebugType=none',
        '-p:DebugSymbols=false',
        '-p:PublishTrimmed=false'
    )

    if ($FrameworkDependent) {
        $publishArguments += @('-p:SelfContained=false', '-p:PublishSingleFile=false')
    }
    else {
        $publishArguments += @(
            '-p:SelfContained=true',
            '-p:PublishSingleFile=true',
            '-p:IncludeNativeLibrariesForSelfExtract=true',
            '-p:EnableCompressionInSingleFile=true'
        )
    }

    & dotnet publish @publishArguments
    Assert-LastExitCode 'dotnet publish'

    $exe = Join-Path $publishDirectory 'SpriteLightLab.exe'
    if (-not (Test-Path -LiteralPath $exe)) {
        throw "发布失败，未生成 EXE：$exe"
    }

    if (-not $SkipDesktopCopy -and -not $FrameworkDependent) {
        Copy-Item -LiteralPath $exe -Destination $desktopTarget -Force
    }

    $file = Get-Item -LiteralPath $exe
    Write-Host ''
    Write-Host "构建完成：$($file.FullName)"
    Write-Host "文件大小：$([Math]::Round($file.Length / 1MB, 2)) MB"
    if (-not $SkipDesktopCopy -and -not $FrameworkDependent) {
        Write-Host "桌面副本：$desktopTarget"
    }
}
finally {
    Pop-Location
}