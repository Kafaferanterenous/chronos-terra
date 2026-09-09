@echo off
setlocal
cd /d "%~dp0.."

echo.
echo ============================================================
echo   Chronos-Terra  -  GitHub upload helper
echo.
echo   IMPORTANT: GitHub no longer accepts password logins. This
echo   script signs you in through your BROWSER instead.
echo   This window stays open - it will never just vanish.
echo ============================================================
echo.

REM ---------- 0/4 git identity (only asked if not already set) ----------
for /f "delims=" %%G in ('git config user.name 2^>nul') do set "GIT_NAME=%%G"
for /f "delims=" %%E in ('git config user.email 2^>nul') do set "GIT_EMAIL=%%E"
if not defined GIT_NAME goto :askname
if not defined GIT_EMAIL goto :askemail
goto :initrepo

:askname
set "GIT_NAME="
set /p "GIT_NAME=Git display name for commits [local]: "
if not defined GIT_NAME set "GIT_NAME=local"
if not defined GIT_EMAIL goto :askemail
goto :initrepo

:askemail
set "GIT_EMAIL="
set /p "GIT_EMAIL=Git email for commits [local@local]: "
if not defined GIT_EMAIL set "GIT_EMAIL=local@local"
if not defined GIT_NAME goto :askname
goto :initrepo

:initrepo
echo.
echo [1/4] Preparing the local git repository...
if not exist ".git" (
  git init -q || goto :fail
  git symbolic-ref HEAD refs/heads/main >nul 2>nul
)
git config user.name "%GIT_NAME%"
git config user.email "%GIT_EMAIL%"
git rev-parse -q --verify HEAD >nul 2>nul
if errorlevel 1 (
  git add -A
  git commit -q -m "Initial commit - Chronos-Terra" || goto :fail
) else (
  git add -A
  git commit -q -m "Sync changes" >nul 2>nul
)
echo   Local git ready: branch = main

echo [2/4] Checking for the GitHub CLI...
where gh >nul 2>nul
if errorlevel 1 goto :gitflow
goto :ghflow

REM ---------- PATH A: GitHub CLI installed (fully automatic) ----------
:ghflow
echo   GitHub CLI found - using it.
call gh auth status >nul 2>nul
if errorlevel 1 (
  echo   Not signed in yet - a sign-in prompt will open now.
  call gh auth login
  if errorlevel 1 goto :fail
)
call gh auth setup-git >nul 2>nul
for /f "delims=" %%L in ('gh api user -q .login 2^>nul') do set "GH_OWNER=%%L"
if not defined GH_OWNER goto :fail
set "REPO_NAME="
set /p "REPO_NAME=Repository name [chronos-terra]: "
if not defined REPO_NAME set "REPO_NAME=chronos-terra"
echo.
echo   Visibility:  1 = private (default)   2 = public
set "VIS_PICK="
set /p "VIS_PICK=Pick [1]: "
if "%VIS_PICK%"=="2" ( set "VIS=public" ) else ( set "VIS=private" )

call gh repo view "%GH_OWNER%/%REPO_NAME%" >nul 2>nul
if errorlevel 1 goto :ghcreate
echo [3/4] Repository exists - pushing...
git remote remove origin >nul 2>nul
git remote add origin "https://github.com/%GH_OWNER%/%REPO_NAME%.git" || goto :fail
git push -u origin main || goto :fail
goto :done

:ghcreate
echo [3/4] Creating new %VIS% repository %GH_OWNER%/%REPO_NAME% and pushing...
call gh repo create "%GH_OWNER%/%REPO_NAME%" --%VIS% --source . --remote origin --push
if errorlevel 1 goto :fail
goto :done

REM ---------- PATH B: no GitHub CLI -> browser login via Git Credential Manager ----------
:gitflow
echo   GitHub CLI not found - using built-in browser login instead.
echo.
set "GH_OWNER="
set /p "GH_OWNER=Your GitHub username: "
if not defined GH_OWNER goto :fail
set "REPO_NAME="
set /p "REPO_NAME=Repository name [chronos-terra]: "
if not defined REPO_NAME set "REPO_NAME=chronos-terra"
git remote remove origin >nul 2>nul
git remote add origin "https://github.com/%GH_OWNER%/%REPO_NAME%.git" || goto :fail
echo.
echo [3/4] Pushing - if a browser window opens, just log in there.
:pushretry
git push -u origin main
if errorlevel 1 (
  echo.
  echo   [!] Push failed - usually because the repository does not
  echo       exist on GitHub yet.
  echo.
  start "" "https://github.com/new"
  echo   In the browser that just opened, create an EMPTY repository
  echo   named exactly:  %REPO_NAME%
  echo   (pick any owner; do NOT tick README/license/.gitignore),
  echo   then press Enter here to retry the push.
  pause
  goto :pushretry
)
goto :done

REM ---------- end ----------
:done
echo.
echo ============================================================
echo   All done!
echo     https://github.com/%GH_OWNER%/%REPO_NAME%
echo.
echo   Later updates:
echo     git add -A
echo     git commit -m "what you changed"
echo     git push
echo ============================================================
pause
goto :eof

:fail
echo.
echo ############################################################
echo   [!] Something went wrong - see the message above.
echo ############################################################
pause