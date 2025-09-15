# AI思维导图工具 - PowerShell一键部署脚本
# 适用于Windows 10/11 - 自动安装所有依赖

param(
    [switch]$SkipDockerCheck,
    [switch]$SkipGitCheck,
    [string]$ProjectDir = "ai-mindmap"
)

# 设置控制台编码
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# 颜色定义
$Red = "`e[91m"
$Green = "`e[92m"
$Yellow = "`e[93m"
$Blue = "`e[94m"
$Reset = "`e[0m"

# 打印横幅
Write-Host ""
Write-Host "${Blue}===============================================${Reset}"
Write-Host "${Blue}   AI思维导图工具 - 完整一键部署${Reset}"
Write-Host "${Blue}===============================================${Reset}"
Write-Host ""

# 检查管理员权限
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "${Red}错误：需要管理员权限运行此脚本${Reset}" -ForegroundColor Red
    Write-Host "请右键点击此脚本，选择'以管理员身份运行'"
    Read-Host "按Enter键退出"
    exit 1
}

# 检查Windows版本
$OSVersion = [System.Environment]::OSVersion.Version
if ($OSVersion.Major -lt 10) {
    Write-Host "${Red}错误：不支持的操作系统版本${Reset}" -ForegroundColor Red
    Write-Host "请使用Windows 10或更高版本"
    Read-Host "按Enter键退出"
    exit 1
}

# 函数：安装Docker Desktop
function Install-Docker {
    Write-Host "${Yellow}正在下载Docker Desktop...${Reset}" -ForegroundColor Yellow
    
    try {
        $DockerInstaller = "$env:TEMP\DockerDesktopInstaller.exe"
        Invoke-WebRequest -Uri "https://desktop.docker.com/win/stable/Docker%20Desktop%20Installer.exe" -OutFile $DockerInstaller
        
        Write-Host "${Yellow}正在安装Docker Desktop...${Reset}" -ForegroundColor Yellow
        Start-Process -FilePath $DockerInstaller -ArgumentList "install", "--quiet" -Wait
        
        Remove-Item $DockerInstaller -Force
        Write-Host "${Green}Docker Desktop安装完成！${Reset}" -ForegroundColor Green
        Write-Host "请重启电脑后重新运行此脚本"
        Read-Host "按Enter键退出"
        exit 0
    }
    catch {
        Write-Host "${Red}安装Docker失败：$($_.Exception.Message)${Reset}" -ForegroundColor Red
        Read-Host "按Enter键退出"
        exit 1
    }
}

# 函数：安装Git
function Install-Git {
    Write-Host "${Yellow}正在下载Git...${Reset}" -ForegroundColor Yellow
    
    try {
        $GitInstaller = "$env:TEMP\GitInstaller.exe"
        $GitUrl = "https://github.com/git-for-windows/git/releases/download/v2.42.0.windows.2/Git-2.42.0.2-64-bit.exe"
        Invoke-WebRequest -Uri $GitUrl -OutFile $GitInstaller
        
        Write-Host "${Yellow}正在安装Git...${Reset}" -ForegroundColor Yellow
        Start-Process -FilePath $GitInstaller -ArgumentList "/VERYSILENT", "/NORESTART" -Wait
        
        Remove-Item $GitInstaller -Force
        Write-Host "${Green}Git安装完成！${Reset}" -ForegroundColor Green
        Write-Host "请重新运行此脚本"
        Read-Host "按Enter键退出"
        exit 0
    }
    catch {
        Write-Host "${Red}安装Git失败：$($_.Exception.Message)${Reset}" -ForegroundColor Red
        Read-Host "按Enter键退出"
        exit 1
    }
}

# 函数：检查命令
function Test-Command {
    param([string]$Command)
    try {
        $null = Get-Command $Command -ErrorAction Stop
        return $true
    }
    catch {
        return $false
    }
}

# 检查Docker
if (-not $SkipDockerCheck) {
    if (-not (Test-Command "docker")) {
        Write-Host "${Red}未检测到Docker${Reset}" -ForegroundColor Red
        $choice = Read-Host "是否自动安装Docker Desktop？(Y/n)"
        if ($choice -eq "" -or $choice -eq "y" -or $choice -eq "Y") {
            Install-Docker
        } else {
            Write-Host "请手动安装Docker Desktop后重试"
            Write-Host "下载地址：https://www.docker.com/products/docker-desktop/"
            Read-Host "按Enter键退出"
            exit 1
        }
    } else {
        Write-Host "${Green}Docker已安装${Reset}" -ForegroundColor Green
    }
}

# 检查Docker Compose
if (-not (Test-Command "docker-compose")) {
    docker compose version >$null 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "${Red}未检测到Docker Compose${Reset}" -ForegroundColor Red
        Write-Host "请确保Docker Desktop安装正确"
        Read-Host "按Enter键退出"
        exit 1
    }
}

# 检查Docker服务
$DockerRunning = $false
try {
    docker info >$null 2>&1
    if ($LASTEXITCODE -eq 0) {
        $DockerRunning = $true
    }
} catch {}

if (-not $DockerRunning) {
    Write-Host "${Red}Docker服务未运行${Reset}" -ForegroundColor Red
    Write-Host "正在尝试启动Docker服务..."
    try {
        Start-Service -Name "com.docker.service" -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 5
        docker info >$null 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Docker服务启动失败"
        }
    } catch {
        Write-Host "${Red}无法启动Docker服务${Reset}" -ForegroundColor Red
        Write-Host "请确保Docker Desktop已启动"
        Read-Host "按Enter键退出"
        exit 1
    }
}

Write-Host "${Green}Docker环境检测完成！${Reset}" -ForegroundColor Green

# 检查Git
if (-not $SkipGitCheck) {
    if (-not (Test-Command "git")) {
        Write-Host "${Red}未检测到Git${Reset}" -ForegroundColor Red
        $choice = Read-Host "是否自动安装Git？(Y/n)"
        if ($choice -eq "" -or $choice -eq "y" -or $choice -eq "Y") {
            Install-Git
        } else {
            Write-Host "请手动安装Git后重试"
            Write-Host "下载地址：https://git-scm.com/download/win"
            Read-Host "按Enter键退出"
            exit 1
        }
    } else {
        Write-Host "${Green}Git已安装${Reset}" -ForegroundColor Green
    }
}

# 检查项目文件
if (-not (Test-Path "docker-compose.yml")) {
    Write-Host "${Yellow}未检测到项目文件${Reset}" -ForegroundColor Yellow
    if ([string]::IsNullOrWhiteSpace($ProjectDir)) {
        $ProjectDir = Read-Host "请输入项目目录名(默认为ai-mindmap)"
        if ([string]::IsNullOrWhiteSpace($ProjectDir)) {
            $ProjectDir = "ai-mindmap"
        }
    }
    
    if (-not (Test-Path $ProjectDir)) {
        Write-Host "${Yellow}正在克隆项目...${Reset}" -ForegroundColor Yellow
        try {
            git clone https://github.com/your-repo/ai-mindmap.git $ProjectDir
            Set-Location $ProjectDir
        } catch {
            Write-Host "${Red}项目克隆失败：$($_.Exception.Message)${Reset}" -ForegroundColor Red
            Read-Host "按Enter键退出"
            exit 1
        }
    } else {
        Set-Location $ProjectDir
        git pull
    }
} else {
    Write-Host "${Green}检测到现有项目，正在更新...${Reset}" -ForegroundColor Green
    if (Test-Path ".git") {
        git pull
    }
}

# 创建必要的目录
if (-not (Test-Path "uploads")) { New-Item -ItemType Directory -Path "uploads" -Force }
if (-not (Test-Path "config")) { New-Item -ItemType Directory -Path "config" -Force }

# 设置权限
icacls uploads /grant Everyone:F /T >$null 2>&1

Write-Host "${Yellow}正在构建Docker镜像...${Reset}" -ForegroundColor Yellow
docker-compose build --no-cache
if ($LASTEXITCODE -ne 0) {
    Write-Host "${Red}错误：Docker镜像构建失败！${Reset}" -ForegroundColor Red
    Read-Host "按Enter键退出"
    exit 1
}

Write-Host "${Yellow}正在启动服务...${Reset}" -ForegroundColor Yellow
docker-compose up -d
if ($LASTEXITCODE -ne 0) {
    Write-Host "${Red}错误：服务启动失败！${Reset}" -ForegroundColor Red
    Read-Host "按Enter键退出"
    exit 1
}

Write-Host "${Yellow}等待服务启动...${Reset}" -ForegroundColor Yellow
Start-Sleep -Seconds 10

# 检查服务状态
$ServiceRunning = $false
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/health" -UseBasicParsing -TimeoutSec 5
    if ($response.StatusCode -eq 200) {
        $ServiceRunning = $true
    }
} catch {}

if ($ServiceRunning) {
    Write-Host "${Green}===============================================${Reset}" -ForegroundColor Green
    Write-Host "${Green}   服务启动成功！${Reset}" -ForegroundColor Green
    Write-Host "${Green}===============================================${Reset}" -ForegroundColor Green
    Write-Host ""
    Write-Host "访问地址：${Green}http://localhost:3000${Reset}" -ForegroundColor Green
    Write-Host ""
    Write-Host "常用命令："
    Write-Host "  查看日志：docker-compose logs -f"
    Write-Host "  停止服务：docker-compose down"
    Write-Host "  重启服务：docker-compose restart"
    Write-Host "  查看状态：docker-compose ps"
    Write-Host ""
} else {
    Write-Host "${Red}警告：服务可能未正常启动${Reset}" -ForegroundColor Red
    Write-Host "请检查日志：docker-compose logs"
}

Write-Host "${Green}部署完成！${Reset}" -ForegroundColor Green
Read-Host "按Enter键退出"