# AI Mindmap Docker Build Script
Write-Host ""
Write-Host "=== AI Mindmap Docker Build ===" -ForegroundColor Green
Write-Host ""

# Check Docker
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "Docker not found. Please install Docker Desktop." -ForegroundColor Red
    exit 1
}

# Clean old containers
docker rm -f ai-mindmap-app 2>$null
docker rmi ai-mindmap:latest 2>$null

# Build image
Write-Host "Building Docker image..." -ForegroundColor Yellow
$buildResult = docker build -f Dockerfile.国内镜像 -t ai-mindmap:latest . 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "China mirror build failed, trying original..." -ForegroundColor Yellow
    docker build -t ai-mindmap:latest .
}

# Run container
Write-Host "Starting container..." -ForegroundColor Yellow
docker run -d -p 9301:9301 --name ai-mindmap-app ai-mindmap:latest

# Show status
Write-Host ""
Write-Host "=== Container Status ===" -ForegroundColor Green
docker ps --filter name=ai-mindmap-app --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

Write-Host ""
Write-Host "Access URL: http://localhost:9301" -ForegroundColor Green
Write-Host "Health Check: http://localhost:9301/health" -ForegroundColor Green

# Wait for user input
Read-Host "Press Enter to continue"