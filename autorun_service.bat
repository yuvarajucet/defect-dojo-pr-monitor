@echo off
setlocal

:: ==== Detect Python Command ====
where py >nul 2>&1
if %errorlevel%==0 (
    set PYTHON_CMD=py
) else (
    set PYTHON_CMD=python
)

:: ==== Start Django App ====
start "Django Server" cmd /k "cd /d ./ &&  call venv\Scripts\activate.bat &&  %PYTHON_CMD% manage.py runserver"

:: ==== Start .NET App ====
start "PDF Export (.NET)" cmd /k "cd /d .\dependent_project\pdf_export\pdf-export && dotnet restore && dotnet run"

endlocal
