param(
    [ValidateSet('baseline', 'after')][string]$Variant = 'after',
    [ValidateSet('memory', 'file-wal')][string]$Storage = 'file-wal',
    [int]$Files = 100,
    [int]$Rows = 100
)
$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../../../..')).Path
$executables = Get-ChildItem -LiteralPath (Join-Path $workspace 'src-tauri/target/release/deps') -Filter 'skillport_lib-*.exe'
$executable = $executables | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (!$executable) { throw 'Compile the offline harness using the documented locked release cargo command first.' }
$name = "$Variant-$Storage-$Files-$Rows"
$stdout = Join-Path $PSScriptRoot "$name.stdout.log"
$stderr = Join-Path $PSScriptRoot "$name.stderr.log"
$env:USAGE_SYNTHETIC_FILES = [string]$Files
$env:USAGE_SYNTHETIC_ROWS = [string]$Rows
$env:USAGE_SYNTHETIC_STORAGE = $Storage
if ($Variant -eq 'baseline') { $env:USAGE_SYNTHETIC_BASELINE = '1' }
else { Remove-Item Env:USAGE_SYNTHETIC_BASELINE -ErrorAction SilentlyContinue }
$process = Start-Process -FilePath $executable.FullName -ArgumentList 'services::usage::synthetic_bench::usage_bench_synthetic_pipeline --ignored --nocapture --test-threads=1' -WorkingDirectory $workspace -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru -WindowStyle Hidden
$peak = 0L
while (!$process.HasExited) {
    $process.Refresh()
    $peak = [Math]::Max($peak, $process.PeakWorkingSet64)
    Start-Sleep -Milliseconds 5
}
$process.WaitForExit()
$metadata = [ordered]@{ variant=$Variant; storage=$Storage; files=$Files; rowsPerFile=$Rows; binary=$executable.Name; peakWorkingSetBytes=$peak; exitCode=$process.ExitCode; sampleIntervalMs=5; osPageCacheFlushed=$false; evidence='direct compiled Rust test binary after canonical locked release compilation' }
$metadata | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $PSScriptRoot "$name.metadata.json") -Encoding utf8
Get-Content -LiteralPath $stderr
Get-Content -LiteralPath $stdout
if ($process.ExitCode -ne 0) { throw "Synthetic benchmark failed: $($process.ExitCode)" }
