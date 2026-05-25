$ErrorActionPreference = 'Stop'

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $projectRoot

if (Get-Command docker-compose -ErrorAction SilentlyContinue) {
  docker-compose up -d --build
} else {
  docker compose up -d --build
}
