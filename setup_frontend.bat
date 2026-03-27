@echo off
cd /d "D:\workbuddy\Auyologic geo project"

echo Creating frontend directory...
if not exist frontend mkdir frontend

echo Copying src folder...
xcopy /E /I /Y src frontend\src

echo Copying dist folder...
if exist dist xcopy /E /I /Y dist frontend\dist

echo Copying config files...
copy /Y package.json frontend\
copy /Y package-lock.json frontend\
copy /Y vite.config.js frontend\
copy /Y index.html frontend\
copy /Y tailwind.config.js frontend\
copy /Y postcss.config.js frontend\

echo Done!