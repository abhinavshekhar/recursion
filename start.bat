@echo off
cd /d "%~dp0backend"
echo Installing dependencies...
pip install -r requirements.txt -q
echo Generating synthetic data...
python generate_data.py
echo Running detection engine...
python detect.py
echo.
echo Starting server at http://localhost:5000
echo Login: admin@rcm.local / admin123
start http://localhost:5000/login.html
python app.py
