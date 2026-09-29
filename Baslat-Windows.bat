@echo off
rem Derin Kazi: sunucuyu acar ve oyunu tarayicida baslatir (Windows).
rem Sunucu kucultulmus pencerede calisir; o pencereyi kapatinca sunucu durur.
cd /d "%~dp0"
set PY=
where py >nul 2>nul && set PY=py
if not defined PY where python >nul 2>nul && set PY=python
if not defined PY (
  echo Python bulunamadi. python.org adresinden Python 3 kur, kurulumda "Add python.exe to PATH" kutusunu isaretle.
  pause
  exit /b 1
)
netstat -ano | findstr /r /c:":8765 .*LISTENING" >nul || start "Derin Kazi sunucu" /min %PY% server.py
timeout /t 2 /nobreak >nul
start "" "http://localhost:8765"
