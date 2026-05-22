# Run as Administrator once to allow LAN access
$rules = @(
  @{ Name = 'IT Helpdesk Web 5173'; Port = 5173 },
  @{ Name = 'IT Helpdesk API 4000'; Port = 4000 }
)

foreach ($r in $rules) {
  $existing = Get-NetFirewallRule -DisplayName $r.Name -ErrorAction SilentlyContinue
  if ($existing) {
    Write-Host "Rule exists: $($r.Name)"
    continue
  }
  New-NetFirewallRule -DisplayName $r.Name -Direction Inbound -Action Allow -Protocol TCP -LocalPort $r.Port | Out-Null
  Write-Host "Created firewall rule: $($r.Name) (TCP $($r.Port))"
}

Write-Host "Done. LAN URLs:"
$ips = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' } | Select-Object -ExpandProperty IPAddress
foreach ($ip in $ips) {
  Write-Host "  Web: http://${ip}:5173"
  Write-Host "  API: http://${ip}:4000/api/health"
}
