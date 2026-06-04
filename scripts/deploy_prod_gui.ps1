Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'
$appRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$configPath = Join-Path $PSScriptRoot '.deploy-prod.local.json'

function Read-LocalConfig {
    if (-not (Test-Path -LiteralPath $configPath)) {
        return @{}
    }

    try {
        return Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    }
    catch {
        return @{}
    }
}

function Get-ConfigValue($Value, $Fallback) {
    if ($null -ne $Value -and "$Value" -ne '') {
        return $Value
    }
    return $Fallback
}

function Read-EnvFile([string]$Path) {
    $values = @{}
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

function Get-GitOutput([string]$ProjectPath, [string[]]$Arguments) {
    $output = & git -C $ProjectPath @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw (($output | Out-String).Trim())
    }
    return (($output | Out-String).Trim())
}

$saved = Read-LocalConfig
$form = New-Object System.Windows.Forms.Form
$form.Text = 'IT Helpdesk - Deploy Production'
$form.Size = New-Object System.Drawing.Size(860, 680)
$form.MinimumSize = New-Object System.Drawing.Size(760, 580)
$form.StartPosition = 'CenterScreen'

$title = New-Object System.Windows.Forms.Label
$title.Text = 'One-click Production Deploy'
$title.Font = New-Object System.Drawing.Font('Segoe UI', 14, [System.Drawing.FontStyle]::Bold)
$title.Location = New-Object System.Drawing.Point(18, 16)
$title.AutoSize = $true
$form.Controls.Add($title)

$subtitle = New-Object System.Windows.Forms.Label
$subtitle.Text = 'Push tested code, pull it into production, install packages, and restart the app.'
$subtitle.Location = New-Object System.Drawing.Point(20, 52)
$subtitle.AutoSize = $true
$form.Controls.Add($subtitle)

function Add-PathRow([string]$Label, [int]$Top, [string]$DefaultValue) {
    $caption = New-Object System.Windows.Forms.Label
    $caption.Text = $Label
    $caption.Location = New-Object System.Drawing.Point(20, ($Top + 4))
    $caption.Size = New-Object System.Drawing.Size(135, 22)
    $form.Controls.Add($caption)

    $textbox = New-Object System.Windows.Forms.TextBox
    $textbox.Text = $DefaultValue
    $textbox.Location = New-Object System.Drawing.Point(160, $Top)
    $textbox.Size = New-Object System.Drawing.Size(555, 26)
    $textbox.Anchor = 'Top, Left, Right'
    $form.Controls.Add($textbox)

    $browse = New-Object System.Windows.Forms.Button
    $browse.Text = 'Browse...'
    $browse.Location = New-Object System.Drawing.Point(725, ($Top - 1))
    $browse.Size = New-Object System.Drawing.Size(95, 28)
    $browse.Anchor = 'Top, Right'
    $browse.Add_Click({
        $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
        $dialog.SelectedPath = $textbox.Text
        if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
            $textbox.Text = $dialog.SelectedPath
        }
    })
    $form.Controls.Add($browse)
    return $textbox
}

$testPath = Add-PathRow 'Test project' 88 (Get-ConfigValue $saved.source_dir $appRoot)
$prodPath = Add-PathRow 'Production project' 126 (Get-ConfigValue $saved.production_dir '')

$branchLabel = New-Object System.Windows.Forms.Label
$branchLabel.Text = 'Git branch'
$branchLabel.Location = New-Object System.Drawing.Point(20, 168)
$branchLabel.AutoSize = $true
$form.Controls.Add($branchLabel)

$branch = New-Object System.Windows.Forms.TextBox
$branch.Text = Get-ConfigValue $saved.branch 'main'
$branch.Location = New-Object System.Drawing.Point(160, 164)
$branch.Size = New-Object System.Drawing.Size(660, 26)
$branch.Anchor = 'Top, Left, Right'
$form.Controls.Add($branch)

$messageLabel = New-Object System.Windows.Forms.Label
$messageLabel.Text = 'Commit message'
$messageLabel.Location = New-Object System.Drawing.Point(20, 206)
$messageLabel.AutoSize = $true
$form.Controls.Add($messageLabel)

$commitMessage = New-Object System.Windows.Forms.TextBox
$commitMessage.Text = Get-ConfigValue $saved.commit_message 'deploy: update helpdesk'
$commitMessage.Location = New-Object System.Drawing.Point(160, 202)
$commitMessage.Size = New-Object System.Drawing.Size(660, 26)
$commitMessage.Anchor = 'Top, Left, Right'
$form.Controls.Add($commitMessage)

$stopPorts = New-Object System.Windows.Forms.CheckBox
$stopPorts.Text = 'Stop processes using the production web/API ports before restart'
$stopPorts.Location = New-Object System.Drawing.Point(20, 240)
$stopPorts.AutoSize = $true
$stopPorts.Checked = if ($null -eq $saved.stop_ports) { $true } else { [bool]$saved.stop_ports }
$form.Controls.Add($stopPorts)

$log = New-Object System.Windows.Forms.TextBox
$log.Location = New-Object System.Drawing.Point(20, 274)
$log.Size = New-Object System.Drawing.Size(800, 300)
$log.Anchor = 'Top, Bottom, Left, Right'
$log.Multiline = $true
$log.ReadOnly = $true
$log.ScrollBars = 'Vertical'
$log.Font = New-Object System.Drawing.Font('Consolas', 9)
$form.Controls.Add($log)

$deploy = New-Object System.Windows.Forms.Button
$deploy.Text = 'Deploy and Restart Production'
$deploy.Location = New-Object System.Drawing.Point(20, 590)
$deploy.Size = New-Object System.Drawing.Size(800, 34)
$deploy.Anchor = 'Bottom, Left, Right'
$form.Controls.Add($deploy)

function Add-Log([string]$Message) {
    $log.AppendText("$Message`r`n")
    $log.SelectionStart = $log.Text.Length
    $log.ScrollToCaret()
    [System.Windows.Forms.Application]::DoEvents()
}

function Invoke-LoggedCommand([string]$FilePath, [string[]]$Arguments, [string]$WorkingDirectory) {
    Add-Log "> $FilePath $($Arguments -join ' ')"
    Push-Location $WorkingDirectory
    try {
        & $FilePath @Arguments 2>&1 | ForEach-Object { Add-Log "$_" }
        if ($LASTEXITCODE -ne 0) {
            throw "Command failed: $FilePath $($Arguments -join ' ')"
        }
    }
    finally {
        Pop-Location
    }
}

$deploy.Add_Click({
    try {
        $source = (Resolve-Path -LiteralPath $testPath.Text).Path
        $production = (Resolve-Path -LiteralPath $prodPath.Text).Path
        $selectedBranch = $branch.Text.Trim()
        $selectedMessage = $commitMessage.Text.Trim()

        if (-not (Test-Path -LiteralPath (Join-Path $source 'package.json'))) {
            throw 'Choose a valid test project folder.'
        }
        if (-not (Test-Path -LiteralPath (Join-Path $production 'package.json'))) {
            throw 'Choose a valid production project folder.'
        }
        if ($source -eq $production) {
            throw 'Test and production folders must be different.'
        }
        if (-not (Test-Path -LiteralPath (Join-Path $production '.env'))) {
            throw 'Production .env is missing. Create it before deploying.'
        }
        if (-not $selectedBranch -or -not $selectedMessage) {
            throw 'Git branch and commit message are required.'
        }

        $sourceBranch = Get-GitOutput $source @('branch', '--show-current')
        if ($sourceBranch -ne $selectedBranch) {
            throw "Test project is on branch '$sourceBranch', not '$selectedBranch'."
        }

        $productionStatus = Get-GitOutput $production @('status', '--short')
        if ($productionStatus) {
            throw "Production has uncommitted files. Review them before deploying:`r`n`r`n$productionStatus"
        }

        $sourceStatus = Get-GitOutput $source @('status', '--short')
        $env = Read-EnvFile (Join-Path $production '.env')
        $webPort = if ($env.VITE_WEB_PORT) { [int]$env.VITE_WEB_PORT } else { 5173 }
        $apiPort = if ($env.API_PORT) { [int]$env.API_PORT } else { 4000 }
        $changes = if ($sourceStatus) { $sourceStatus } else { '(No local changes; deploy the latest pushed commit.)' }

        $confirmation = @"
Production folder:
$production

Branch: $selectedBranch
Ports to restart: $webPort, $apiPort

Test project changes:
$changes

Deploy production now?
"@
        $answer = [System.Windows.Forms.MessageBox]::Show(
            $confirmation,
            'Confirm production deploy',
            [System.Windows.Forms.MessageBoxButtons]::YesNo,
            [System.Windows.Forms.MessageBoxIcon]::Warning
        )
        if ($answer -ne [System.Windows.Forms.DialogResult]::Yes) {
            return
        }

        @{
            source_dir     = $source
            production_dir = $production
            branch         = $selectedBranch
            commit_message = $selectedMessage
            stop_ports     = $stopPorts.Checked
        } | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8

        $deploy.Enabled = $false
        Add-Log ('=' * 64)
        Add-Log 'Starting production deploy...'

        if ($sourceStatus) {
            Invoke-LoggedCommand 'git' @('add', '-A') $source
            Invoke-LoggedCommand 'git' @('commit', '-m', $selectedMessage) $source
        }
        else {
            Add-Log 'No local test-project changes to commit.'
        }

        Invoke-LoggedCommand 'git' @('push', 'origin', $selectedBranch) $source
        Invoke-LoggedCommand 'git' @('checkout', $selectedBranch) $production
        Invoke-LoggedCommand 'git' @('pull', '--ff-only', 'origin', $selectedBranch) $production
        Invoke-LoggedCommand 'npm.cmd' @('install') $production

        if ($stopPorts.Checked) {
            $listeners = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
                Where-Object { $_.LocalPort -in @($webPort, $apiPort) } |
                Select-Object -ExpandProperty OwningProcess -Unique
            foreach ($processId in $listeners) {
                Add-Log "> taskkill /PID $processId /T /F"
                & taskkill /PID $processId /T /F 2>&1 | ForEach-Object { Add-Log "$_" }
            }
        }

        Add-Log '> npm run lan'
        Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', 'npm run lan' -WorkingDirectory $production
        Add-Log 'Production started in a new terminal window.'
        Add-Log 'Deploy completed successfully.'
        [System.Windows.Forms.MessageBox]::Show(
            'Production has been restarted.',
            'Deploy completed',
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Information
        ) | Out-Null
    }
    catch {
        Add-Log "ERROR: $($_.Exception.Message)"
        [System.Windows.Forms.MessageBox]::Show(
            $_.Exception.Message,
            'Deploy failed',
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error
        ) | Out-Null
    }
    finally {
        $deploy.Enabled = $true
    }
})

[void]$form.ShowDialog()
