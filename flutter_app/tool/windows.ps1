# Builds and tests the Flutter app on a Windows PC, the counterpart of tool/local_mirror.sh on the Mac.
#
# The project folder is on this PC's own disk, so nothing is mirrored: the commands run here. They always use the
# Flutter both machines share (3.38.9), installed beside any other Flutter, never the one first on the PATH.
#
#   tool\windows.ps1 analyze                    static analysis
#   tool\windows.ps1 unit [args]                unit and widget tests
#   tool\windows.ps1 test [windows|<device>]    integration tests on Windows (default) or an Android device/emulator
#   tool\windows.ps1 build windows|android      release build, copied to ..\release\flutter\<platform>\
#
# Mac and iPhone builds cannot be made on Windows: they are made on the Mac with tool/local_mirror.sh.
param(
  [Parameter(Mandatory = $true, Position = 0)][ValidateSet('analyze', 'unit', 'test', 'build')][string]$Command,
  [Parameter(Position = 1, ValueFromRemainingArguments = $true)][string[]]$Rest
)
$ErrorActionPreference = 'Stop'
$Flutter = if ($env:NOVEL_BUILDER_FLUTTER) { $env:NOVEL_BUILDER_FLUTTER } else { Join-Path $env:USERPROFILE 'flutter-3.38.9\flutter\bin\flutter.bat' }
if (-not (Test-Path $Flutter)) { throw "Flutter 3.38.9 not found at $Flutter (set NOVEL_BUILDER_FLUTTER to its flutter.bat)" }
$App = Split-Path -Parent $PSScriptRoot
$Release = Join-Path (Split-Path -Parent $App) 'release\flutter'
Set-Location $App

# Packages exactly as locked: a different version is refused rather than written into pubspec.lock.
& $Flutter pub get --enforce-lockfile
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

switch ($Command) {
  'analyze' { & $Flutter analyze }
  'unit' { & $Flutter test @Rest }
  'test' {
    $device = if ($Rest -and $Rest[0]) { $Rest[0] } else { 'windows' }
    # @(…) keeps a single name an array: a bare string would be splatted letter by letter.
    $files = @(if ($Rest.Count -gt 1) { $Rest[1..($Rest.Count - 1)] } else { 'integration_test' })
    & $Flutter test @files -d $device
  }
  'build' {
    $platform = if ($Rest) { $Rest[0] } else { throw 'platform: windows or android' }
    $out = Join-Path $Release $platform
    New-Item -ItemType Directory -Force $out | Out-Null
    switch ($platform) {
      'windows' {
        & $Flutter build windows --release
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        # The program and the files it needs beside it, as one folder to unzip and run.
        $zip = Join-Path $out 'NovelBuilder-Windows.zip'
        if (Test-Path $zip) { Remove-Item $zip }
        # Windows' own tar writes a standard zip (Compress-Archive in Windows PowerShell writes backslashes into paths).
        Push-Location (Join-Path $App 'build\windows\x64\runner\Release')
        & "$env:SystemRoot\System32\tar.exe" -a -c -f $zip *
        Pop-Location
        Write-Host "Built $zip"
      }
      'android' {
        # Gradle writes warnings to stderr (an SDK XML version note), which 'Stop' turns into a failure in Windows
        # PowerShell 5.1; the exit code below decides instead.
        $ErrorActionPreference = 'Continue'
        & $Flutter build apk --release
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        Copy-Item (Join-Path $App 'build\app\outputs\flutter-apk\app-release.apk') (Join-Path $out 'NovelBuilder.apk') -Force
        Write-Host "Built $(Join-Path $out 'NovelBuilder.apk')"
      }
      default { throw "Only windows and android are built on Windows; build $platform on the Mac (tool/local_mirror.sh)." }
    }
  }
}
exit $LASTEXITCODE
