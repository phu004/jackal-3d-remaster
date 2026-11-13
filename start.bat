@echo off
rem Starts the dev server and opens the game in Chrome. Close this window to stop it.
cd /d "%~dp0"
if not exist node_modules call npm install

set "URL=http://localhost:5173/"
set "CHROME="
for %%P in ("%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "%LocalAppData%\Google\Chrome\Application\chrome.exe") do if exist %%P set "CHROME=%%~P"

rem Open Chrome once the server answers (runs in the background while the server starts below).
if defined CHROME (
  start "" /b powershell -NoProfile -Command "for ($i = 0; $i -lt 100; $i++) { try { Invoke-WebRequest -UseBasicParsing '%URL%' -TimeoutSec 1 | Out-Null; break } catch { Start-Sleep -Milliseconds 300 } }; Start-Process '%CHROME%' '%URL%'"
) else (
  echo Chrome not found - open %URL% in any browser.
)

call npm run dev -- --port 5173 --strictPort
