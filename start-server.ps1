# 方块世界启动器（PowerShell）
# 自动寻找可用端口、优先 Python、其次 Node.js，并自动打开浏览器。
# 用法：双击 start.bat（或在 PowerShell 中执行本脚本）
$ErrorActionPreference = 'Continue'
Set-Location -Path $PSScriptRoot

$port = 8080

# ---- 寻找可用端口（8080 起）----
function Test-PortFree($p) {
    try {
        $l = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $p)
        $l.Start()
        $l.Stop()
        return $true
    } catch {
        return $false
    }
}
while (-not (Test-PortFree $port)) {
    $port++
    if ($port -gt 8099) {
        Write-Host "没有可用端口（8080-8099 均被占用），请关闭占用程序后重试。" -ForegroundColor Red
        Read-Host "按回车退出"
        exit 1
    }
}
$url = "http://127.0.0.1:$port"

# ---- 检测可用的 Python（跳过微软商店占位程序）----
$pythonCmd = $null
foreach ($c in @('python', 'python3')) {
    $found = Get-Command $c -ErrorAction SilentlyContinue
    if ($found) {
        & $c --version 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
            $pythonCmd = $c
            break
        }
    }
}

# ---- 启动服务器 ----
if ($pythonCmd) {
    Write-Host "[1/2] 使用 $pythonCmd 启动服务器..." -ForegroundColor Green
    $server = Start-Process -FilePath $pythonCmd -ArgumentList @('-m', 'http.server', "$port", '--bind', '127.0.0.1') -WorkingDirectory $PSScriptRoot -WindowStyle Minimized -PassThru
} elseif (Get-Command node -ErrorAction SilentlyContinue) {
    Write-Host "[1/2] 使用 Node.js 启动服务器..." -ForegroundColor Green
    $server = Start-Process -FilePath 'node' -ArgumentList @('server.js') -WorkingDirectory $PSScriptRoot -WindowStyle Minimized -PassThru
} else {
    Write-Host "未找到 Python 或 Node.js，请先安装其中一个（推荐 https://nodejs.org 或 https://www.python.org）。" -ForegroundColor Red
    Read-Host "按回车退出"
    exit 1
}

Start-Sleep -Seconds 1

# ---- 打开浏览器 ----
try {
    Start-Process $url
    Write-Host "[2/2] 已自动打开浏览器：$url" -ForegroundColor Green
} catch {
    Write-Host "[2/2] 请手动在浏览器打开：$url" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "服务器正在后台运行（最小化窗口）。"
Write-Host "按回车停止服务器并退出本窗口。"
Read-Host ""

# ---- 停止服务器 ----
try {
    Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
} catch { }
Write-Host "服务器已停止。"
