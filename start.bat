@echo off
setlocal
title GTD Executivo - André Delamata

echo ============================================================
echo   GTD Executivo - André Delamata
echo   Iniciando servidor local em http://localhost:8080
echo   (os dados ficam no Supabase — e necessario internet)
echo ============================================================
echo.

cd /d "%~dp0"

where python >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo Pressione Ctrl+C nesta janela para encerrar o servidor.
    echo Abra o navegador em http://localhost:8080 quando o servidor iniciar.
    echo.
    python -m http.server 8080
    goto :end
)

where python3 >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo Pressione Ctrl+C nesta janela para encerrar o servidor.
    echo Abra o navegador em http://localhost:8080 quando o servidor iniciar.
    echo.
    python3 -m http.server 8080
    goto :end
)

echo [ERRO] Python nao foi encontrado no PATH deste computador.
echo Peca ao time de TI para instalar o Python 3 (necessario apenas para
echo servir os arquivos locais — a aplicacao em si nao depende de internet).
echo.
pause

:end
endlocal
