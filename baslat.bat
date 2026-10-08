@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title Trenckot Kontu

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js bulunamadi. Su adresten "LTS" surumunu kurun, sonra bu dosyayi tekrar calistirin:
  echo  https://nodejs.org
  echo.
  pause
  exit /b 1
)
node -e "process.exit(Number(process.versions.node.split('.')[0])>=20?0:1)"
if errorlevel 1 (
  echo.
  echo  Node.js surumu eski ^(20 veya ustu gerekli^). https://nodejs.org adresinden guncelleyin.
  echo.
  pause
  exit /b 1
)

if not exist node_modules\vite (
  echo.
  echo  Ilk kurulum: bagimliliklar yukleniyor ^(birkac dakika surebilir^)...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo  Kurulum basarisiz oldu. Internet baglantinizi kontrol edip tekrar deneyin.
    pause
    exit /b 1
  )
)

call node_modules\.bin\tsx.cmd tools\start.ts %*
echo.
pause
