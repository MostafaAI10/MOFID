@echo off
setlocal EnableExtensions

rem Mofid all-in-one launcher. Does not install packages or download files.
set "ROOT=%~dp0"
cd /d "%ROOT%"
set "PYTHON=%ROOT%.venv\Scripts\python.exe"
if not exist "%PYTHON%" set "PYTHON=python"
set "CHROMA_PORT=%MOFID_CHROMA_PORT%"
if "%CHROMA_PORT%"=="" set "CHROMA_PORT=8001"
set "LLAMA_PORT=%MOFID_LLAMA_PORT%"
if "%LLAMA_PORT%"=="" set "LLAMA_PORT=8081"
set "API_PORT=%MOFID_API_PORT%"
if "%API_PORT%"=="" set "API_PORT=8082"
set "LLM_MODE=%MOFID_LLM_MODE%"
if "%LLM_MODE%"=="" set "LLM_MODE=auto"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is required to build the dashboard.
  exit /b 1
)
"%PYTHON%" --version >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Python was not found. Create or activate .venv first.
  exit /b 1
)

if not exist "%ROOT%dashboard\node_modules" (
  echo [ERROR] dashboard\node_modules is missing. Run npm install only when you have access to the packages.
  exit /b 1
)

set "HAS_LLM=1"
if not "%MOFID_MODEL_PATH%"=="" (
  if not exist "%MOFID_MODEL_PATH%" (
    set "HAS_LLM=0"
  )
) else if not exist "%ROOT%models\Karnak.Q3_K_M.gguf" (
  set "HAS_LLM=0"
)

if not exist "%ROOT%backend\llama.cpp" set "HAS_LLM=0"
if /i "%LLM_MODE%"=="live" if "%HAS_LLM%"=="0" (
  echo [ERROR] Live mode requested, but the Karnak model or llama.cpp files are missing.
  exit /b 1
)
if /i "%LLM_MODE%"=="auto" if "%HAS_LLM%"=="0" set "LLM_MODE=retrieval"

if not exist "%ROOT%work\logs" mkdir "%ROOT%work\logs"

echo === Building teacher dashboard ===
pushd dashboard
call npm run build
if errorlevel 1 (
  popd
  echo [ERROR] Dashboard build failed.
  exit /b 1
)
popd

echo === Starting Chroma on port %CHROMA_PORT% ===
start "Mofid Chroma" powershell -NoExit -ExecutionPolicy Bypass -File "%ROOT%backend\scripts\start_chroma.ps1"
call :wait_for_port %CHROMA_PORT% "Chroma"
if errorlevel 1 exit /b 1

echo === Indexing curriculum ===
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%backend\scripts\index_content.ps1"
if errorlevel 1 (
  echo [ERROR] Curriculum indexing failed.
  exit /b 1
)

if /i "%LLM_MODE%"=="retrieval" (
  echo === Karnak unavailable: using retrieval-only mode ===
) else (
  echo === Starting llama.cpp on port %LLAMA_PORT% ===
  start "Mofid Karnak" powershell -NoExit -ExecutionPolicy Bypass -File "%ROOT%backend\scripts\start_llama_server.ps1"
  call :wait_for_port %LLAMA_PORT% "llama.cpp"
  if errorlevel 1 exit /b 1
)

echo === Starting FastAPI on port %API_PORT% ===
set "MOFID_LLM_MODE=%LLM_MODE%"
start "Mofid API" powershell -NoExit -ExecutionPolicy Bypass -File "%ROOT%backend\scripts\start_api.ps1"
call :wait_for_port %API_PORT% "FastAPI"
if errorlevel 1 exit /b 1

echo.
echo Mofid is running:
echo   Student app:      http://localhost:%API_PORT%/
echo   Teacher dashboard: http://localhost:%API_PORT%/dashboard
exit /b 0

:wait_for_port
set "WAIT_PORT=%~1"
set "WAIT_NAME=%~2"
set /a ATTEMPTS=0
:wait_loop
set /a ATTEMPTS+=1
powershell -NoProfile -Command "$ok = Test-NetConnection -ComputerName 127.0.0.1 -Port %WAIT_PORT% -InformationLevel Quiet; if ($ok) { exit 0 } else { exit 1 }" >nul 2>nul
if not errorlevel 1 exit /b 0
if %ATTEMPTS% GEQ 60 (
  echo [ERROR] %WAIT_NAME% did not open port %WAIT_PORT% within 60 seconds.
  exit /b 1
)
timeout /t 1 /nobreak >nul
goto wait_loop
