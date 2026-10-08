@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title Trenckot Kontu - guncelle
where git >nul 2>nul
if errorlevel 1 (
  echo  Git bulunamadi. https://git-scm.com adresinden kurun.
  pause
  exit /b 1
)
git pull --ff-only
if errorlevel 1 (
  echo.
  echo  Guncelleme basarisiz: yerelde degistirdiginiz dosyalar olabilir. Yardim icin README.md'ye bakin.
  pause
  exit /b 1
)
call npm install --no-audit --no-fund
echo.
echo  Guncellendi. baslat.bat ile oyunu acabilirsiniz ^(istemci otomatik yeniden derlenir^).
pause
