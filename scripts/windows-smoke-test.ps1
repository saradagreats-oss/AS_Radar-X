$ErrorActionPreference = 'Stop'
$exe = Join-Path $PWD 'release\win-unpacked\AS-Radar-X.exe'
if (!(Test-Path $exe)) { throw "Packaged application not found: $exe" }

$stdout = Join-Path $env:TEMP 'as-radar-x-desktop-smoke.stdout.log'
$stderr = Join-Path $env:TEMP 'as-radar-x-desktop-smoke.stderr.log'
Remove-Item $stdout, $stderr -Force -ErrorAction SilentlyContinue
$appProcess = Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe) -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
$portFile = $null
$ready = $false

try {
  $knownFiles = @(
    (Join-Path $env:APPDATA 'as-radar-x\desktop-server-port.json'),
    (Join-Path $env:APPDATA 'AS-Radar-X\desktop-server-port.json'),
    (Join-Path $env:APPDATA 'asradar-x\desktop-server-port.json')
  )
  $deadline = [DateTime]::UtcNow.AddSeconds(50)

  while ([DateTime]::UtcNow -lt $deadline) {
    if ($appProcess.HasExited) {
      $outText = if (Test-Path $stdout) { Get-Content $stdout -Raw } else { '' }
      $errText = if (Test-Path $stderr) { Get-Content $stderr -Raw } else { '' }
      throw ("Desktop process exited before API startup. STDOUT: " + $outText + [Environment]::NewLine + "STDERR: " + $errText)
    }

    foreach ($candidate in $knownFiles) {
      if (Test-Path $candidate) { $portFile = $candidate; break }
    }

    if (!$portFile) {
      $portFile = Get-ChildItem -Path $env:APPDATA -Filter 'desktop-server-port.json' -File -Recurse -ErrorAction SilentlyContinue |
        Select-Object -First 1 -ExpandProperty FullName
    }

    if ($portFile -and (Test-Path $portFile)) {
      try {
        $saved = Get-Content $portFile -Raw | ConvertFrom-Json
        $port = [int]$saved.port
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/health" -TimeoutSec 2
        if ($health.success -eq $true -and $health.app -eq 'AS-Radar-X') {
          $proxy = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/proxy/config" -TimeoutSec 3
          if ($null -eq $proxy.protocol -or $null -eq $proxy.port) { throw 'Proxy configuration endpoint returned an incomplete response.' }
          Write-Host "Desktop runtime smoke test passed on local port $port."
          Write-Host "Proxy config endpoint reports protocol=$($proxy.protocol), enabled=$($proxy.enabled)."
          $ready = $true
          break
        }
      } catch {
        # The HTTP listener may need another short moment after the port file is created.
      }
    }
    Start-Sleep -Milliseconds 500
  }

  if (!$ready) {
    $outText = if (Test-Path $stdout) { Get-Content $stdout -Raw } else { '' }
    $errText = if (Test-Path $stderr) { Get-Content $stderr -Raw } else { '' }
    throw ("Desktop runtime smoke test timed out waiting for the local API. STDOUT: " + $outText + [Environment]::NewLine + "STDERR: " + $errText)
  }
}
finally {
  if ($appProcess -and !$appProcess.HasExited) {
    & taskkill.exe /PID $appProcess.Id /T /F | Out-Null
  }
}
