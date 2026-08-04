$ErrorActionPreference = 'Stop'

$appRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$configPath = Join-Path $PSScriptRoot '.deploy-prod-web.local.json'
$logPath = Join-Path $PSScriptRoot 'startup.log'

$deployHost = if ($env:DEPLOY_WEB_HOST) { $env:DEPLOY_WEB_HOST } else { '127.0.0.1' }
$deployPort = if ($env:DEPLOY_WEB_PORT) { [int]$env:DEPLOY_WEB_PORT } else { 4783 }
$deployToken = if ($env:DEPLOY_WEB_TOKEN) { $env:DEPLOY_WEB_TOKEN } else { 'codex-deploy-20260729' }

function Add-StartupLog([string]$Message) {
    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Add-Content -LiteralPath $logPath -Value "[$timestamp] $Message" -Encoding UTF8
}

function Read-JsonFile([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) {
        return $null
    }

    try {
        return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
    }
    catch {
        Add-StartupLog "Cannot read JSON config: $($_.Exception.Message)"
        return $null
    }
}

function Read-EnvFile([string]$Path) {
    $values = @{}
    if (-not (Test-Path -LiteralPath $Path)) {
        return $values
    }

    foreach ($rawLine in Get-Content -LiteralPath $Path) {
        $line = $rawLine.Trim()
        if (-not $line -or $line.StartsWith('#') -or -not $line.Contains('=')) {
            continue
        }

        $key, $value = $line.Split('=', 2)
        $values[$key.Trim()] = $value.Trim().Trim('"').Trim("'")
    }
    return $values
}

function Test-PortListening([int]$Port) {
    $netstat = & netstat -ano -p tcp 2>$null
    foreach ($line in $netstat) {
        $columns = $line.Trim() -split '\s+'
        if ($columns.Count -lt 5 -or $columns[-2].ToUpperInvariant() -ne 'LISTENING') {
            continue
        }

        $localAddress = $columns[1]
        $localPort = [int]($localAddress.Split(':')[-1])
        if ($localPort -eq $Port) {
            return $true
        }
    }
    return $false
}

function Start-NpmHidden([string]$WorkingDirectory, [string[]]$Arguments) {
    Add-StartupLog "Starting: npm $($Arguments -join ' ') in $WorkingDirectory"
    Start-Process -FilePath 'npm.cmd' -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory -WindowStyle Hidden | Out-Null
}

try {
    Add-StartupLog 'Startup check started.'

    $saved = Read-JsonFile $configPath
    $productionPath = if ($saved -and $saved.productionPath) {
        [string]$saved.productionPath
    }
    elseif ($saved -and $saved.production_dir) {
        [string]$saved.production_dir
    }
    else {
        'C:\Next.js Project\it-helpdesk'
    }

    $productionPath = (Resolve-Path -LiteralPath $productionPath).Path
    if (-not (Test-Path -LiteralPath (Join-Path $productionPath 'package.json'))) {
        throw "Production project folder is invalid: $productionPath"
    }

    $envFile = Join-Path $productionPath '.env'
    $prodEnv = Read-EnvFile $envFile
    $webPort = if ($prodEnv.VITE_WEB_PORT) { [int]$prodEnv.VITE_WEB_PORT } else { 5173 }
    $apiPort = if ($prodEnv.API_PORT) { [int]$prodEnv.API_PORT } else { 4000 }

    $deployRunning = Test-PortListening $deployPort
    if ($deployRunning) {
        Add-StartupLog "Deploy web already listening on $deployHost`:$deployPort."
    }
    else {
        $env:DEPLOY_WEB_OPEN = 'false'
        $env:DEPLOY_WEB_HOST = $deployHost
        $env:DEPLOY_WEB_PORT = [string]$deployPort
        $env:DEPLOY_WEB_TOKEN = $deployToken
        Start-NpmHidden $appRoot @('run', 'deploy:prod:web')
    }

    $apiRunning = Test-PortListening $apiPort
    $webRunning = Test-PortListening $webPort

    if ($apiRunning -and $webRunning) {
        Add-StartupLog "Production already running. Web: $webPort, API: $apiPort."
    }
    elseif (-not $apiRunning -and -not $webRunning) {
        Start-NpmHidden $productionPath @('run', 'lan')
    }
    else {
        if (-not $apiRunning) {
            Start-NpmHidden $productionPath @('run', 'start:api')
        }
        if (-not $webRunning) {
            Start-NpmHidden $productionPath @('run', 'dev:lan')
        }
    }

    $testEnvFile = Join-Path $appRoot '.env'
    $testEnv = Read-EnvFile $testEnvFile
    $testWebPort = if ($testEnv.VITE_WEB_PORT) { [int]$testEnv.VITE_WEB_PORT } else { 5174 }
    $testApiPort = if ($testEnv.API_PORT) { [int]$testEnv.API_PORT } else { 4001 }

    if ($testWebPort -eq $webPort -or $testApiPort -eq $apiPort) {
        Add-StartupLog "Test project ports match production ports. Skipping test auto-start. Test Web: $testWebPort, Test API: $testApiPort."
    }
    else {
        $testApiRunning = Test-PortListening $testApiPort
        $testWebRunning = Test-PortListening $testWebPort

        if ($testApiRunning -and $testWebRunning) {
            Add-StartupLog "Test already running. Web: $testWebPort, API: $testApiPort."
        }
        elseif (-not $testApiRunning -and -not $testWebRunning) {
            Start-NpmHidden $appRoot @('run', 'lan')
        }
        else {
            if (-not $testApiRunning) {
                Start-NpmHidden $appRoot @('run', 'start:api')
            }
            if (-not $testWebRunning) {
                Start-NpmHidden $appRoot @('run', 'dev:lan')
            }
        }
    }

    Add-StartupLog "Startup check completed. Deploy URL: http://$deployHost`:$deployPort/?token=$deployToken"
}
catch {
    Add-StartupLog "ERROR: $($_.Exception.Message)"
    throw
}
