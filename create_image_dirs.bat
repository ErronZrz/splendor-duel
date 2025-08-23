@echo off
echo 创建 Splendor Duel 图片目录结构...
echo.

cd frontend\public\images

echo 创建主要目录...
mkdir cards 2>nul
mkdir gems 2>nul
mkdir nobles 2>nul
mkdir game 2>nul

echo 创建发展卡子目录...
mkdir cards\level1 2>nul
mkdir cards\level2 2>nul
mkdir cards\level3 2>nul
mkdir cards\backs 2>nul

echo.
echo 目录结构创建完成！
echo.
echo 请将图片文件放入以下目录：
echo.
echo 发展卡:
echo   cards\level1\     - 30张一级发展卡 (a1.jpg 到 g10.jpg)
echo   cards\level2\     - 24张二级发展卡 (h1.jpg 到 l10.jpg)
echo   cards\level3\     - 13张三级发展卡 (m1.jpg 到 o10.jpg)
echo   cards\backs\      - 3张卡背 (back1.jpg, back2.jpg, back3.jpg)
echo.
echo 宝石:
echo   gems\             - 7种宝石 (white.jpg, blue.jpg, green.jpg, red.jpg, black.jpg, pearl.jpg, gold.jpg)
echo.
echo 贵族卡:
echo   nobles\            - 4张贵族卡 (noble1.jpg, noble2.jpg, noble3.jpg, noble4.jpg)
echo.
echo 游戏图片:
echo   game\              - 游戏目标提示卡 (goal.jpg) 和宝石版图 (board.jpg)
echo.
echo 详细命名规则请查看: frontend\public\images\NAMING_GUIDE.md
echo.
pause
