from flask import Flask, request, jsonify, send_file
import uuid
import time
import os

app = Flask(__name__)

# База данных для хранения заданий
jobs_db = {}
# Время создания заданий
job_creation_time = {}

# Фиксированные mock-данные
MOCK_EMBEDDINGS = [0.123, 0.456, 0.789, 0.321, 0.654, 0.987, 0.111, 0.222]
MOCK_MODELS = [
    {
        "model_id": "bert-multilingual-512",
        "model_name": "BERT Multilingual Base",
        "dimension": 512
    },
    {
        "model_id": "fasttext-300",
        "model_name": "FastText",
        "dimension": 300
    }
]
MOCK_SEARCH_RESULTS = [
    {
        "file_id": "documents/technology/ai_research.txt",
        "score": 0.87,
        "preview": "Искусственный интеллект продолжает развиваться быстрыми темпами. Новые модели машинного обучения демонстрируют...",
        "fragment": "Исследование в области искусственного интеллекта и машинного обучения. Современные тенденции и перспективы развития."
    }
]

# Статические HTML страницы для визуализации
VISUALIZATION_HTML = {
    "graphic": """
    <!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Визуализация кластеров</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            margin: 0;
            padding: 20px;
            min-height: 100vh;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 15px;
            padding: 30px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        }

        .header {
            text-align: center;
            margin-bottom: 40px;
        }

        .header h1 {
            color: #333;
            margin: 0;
            font-size: 2.5em;
        }

        .header p {
            color: #666;
            font-size: 1.2em;
        }

        .cluster-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 25px;
            margin-top: 30px;
        }

        .cluster-card {
            background: linear-gradient(145deg, #f8f9fa, #e9ecef);
            border-radius: 12px;
            padding: 25px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
            border-left: 5px solid #667eea;
            transition: transform 0.3s ease;
        }

        .cluster-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 8px 25px rgba(0,0,0,0.15);
        }

        .cluster-card h3 {
            color: #495057;
            margin: 0 0 15px 0;
            font-size: 1.4em;
        }

        .stats {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
            margin: 20px 0;
        }

        .stat-item {
            text-align: center;
            padding: 12px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }

        .stat-value {
            font-size: 1.8em;
            font-weight: bold;
            color: #667eea;
            margin: 5px 0;
        }

        .stat-label {
            font-size: 0.9em;
            color: #6c757d;
        }

        .distribution {
            background: white;
            padding: 15px;
            border-radius: 8px;
            margin: 15px 0;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }

        .distribution h4 {
            margin: 0 0 10px 0;
            color: #495057;
            text-align: center;
        }

        .bars {
            display: flex;
            height: 40px;
            align-items: flex-end;
            gap: 8px;
        }

        .bar {
            flex: 1;
            background: linear-gradient(to top, #667eea, #764ba2);
            border-radius: 3px 3px 0 0;
            min-height: 5px;
        }

        .files {
            background: white;
            padding: 15px;
            border-radius: 8px;
            margin-top: 15px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }

        .files h4 {
            margin: 0 0 10px 0;
            color: #495057;
            text-align: center;
        }

        .file-item {
            padding: 8px;
            background: #f8f9fa;
            margin: 5px 0;
            border-radius: 5px;
            border-left: 3px solid #28a745;
        }

        .main-stats {
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            padding: 30px;
            border-radius: 12px;
            text-align: center;
            margin-bottom: 30px;
        }

        .main-stats h2 {
            margin: 0 0 20px 0;
            font-size: 2em;
        }

        .main-numbers {
            display: flex;
            justify-content: center;
            gap: 40px;
            flex-wrap: wrap;
        }

        .main-number {
            background: rgba(255,255,255,0.1);
            padding: 20px;
            border-radius: 10px;
            backdrop-filter: blur(10px);
        }

        .main-value {
            font-size: 2.5em;
            font-weight: bold;
            margin: 5px 0;
        }

        .main-label {
            font-size: 1.1em;
            opacity: 0.9;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 Анализ кластеров документов</h1>
            <p>Визуализация структуры данных и статистики</p>
        </div>

        <div class="main-stats">
            <h2>📁 Корневой кластер</h2>
            <div class="main-numbers">
                <div class="main-number">
                    <div class="main-label">Всего файлов</div>
                    <div class="main-value">32,456</div>
                </div>
                <div class="main-number">
                    <div class="main-label">Средняя схожесть</div>
                    <div class="main-value">0.82</div>
                </div>
                <div class="main-number">
                    <div class="main-label">Дочерних кластеров</div>
                    <div class="main-value">3</div>
                </div>
            </div>
        </div>

        <h2 style="text-align: center; color: #495057; margin-bottom: 30px;">🎯 Дочерние кластеры</h2>
        
        <div class="cluster-grid">
            <div class="cluster-card">
                <h3>🚀 Технологии</h3>
                
                <div class="stats">
                    <div class="stat-item">
                        <div class="stat-value">12,480</div>
                        <div class="stat-label">Файлов</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">0.87</div>
                        <div class="stat-label">Схожесть</div>
                    </div>
                </div>

                <div class="distribution">
                    <h4>📈 Распределение схожести</h4>
                    <div class="bars">
                        <div class="bar" style="height: 20%;"></div>
                        <div class="bar" style="height: 40%;"></div>
                        <div class="bar" style="height: 60%;"></div>
                        <div class="bar" style="height: 80%;"></div>
                        <div class="bar" style="height: 100%;"></div>
                    </div>
                </div>

                <div class="files">
                    <h4>📄 Примеры файлов</h4>
                    <div class="file-item">ai_research.txt</div>
                    <div class="file-item">tech_report.pdf</div>
                    <div class="file-item">innovation.docx</div>
                </div>
            </div>

            <!-- Дополнительные примеры кластеров -->
            <div class="cluster-card">
                <h3>📚 Наука</h3>
                <div class="stats">
                    <div class="stat-item">
                        <div class="stat-value">8,742</div>
                        <div class="stat-label">Файлов</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">0.79</div>
                        <div class="stat-label">Схожесть</div>
                    </div>
                </div>
                <div class="distribution">
                    <h4>📈 Распределение схожести</h4>
                    <div class="bars">
                        <div class="bar" style="height: 30%;"></div>
                        <div class="bar" style="height: 50%;"></div>
                        <div class="bar" style="height: 70%;"></div>
                        <div class="bar" style="height: 90%;"></div>
                        <div class="bar" style="height: 60%;"></div>
                    </div>
                </div>
                <div class="files">
                    <h4>📄 Примеры файлов</h4>
                    <div class="file-item">physics_paper.txt</div>
                    <div class="file-item">biology_study.pdf</div>
                </div>
            </div>

            <div class="cluster-card">
                <h3>💼 Бизнес</h3>
                <div class="stats">
                    <div class="stat-item">
                        <div class="stat-value">5,321</div>
                        <div class="stat-label">Файлов</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">0.85</div>
                        <div class="stat-label">Схожесть</div>
                    </div>
                </div>
                <div class="distribution">
                    <h4>📈 Распределение схожести</h4>
                    <div class="bars">
                        <div class="bar" style="height: 25%;"></div>
                        <div class="bar" style="height: 45%;"></div>
                        <div class="bar" style="height: 65%;"></div>
                        <div class="bar" style="height: 85%;"></div>
                        <div class="bar" style="height: 75%;"></div>
                    </div>
                </div>
                <div class="files">
                    <h4>📄 Примеры файлов</h4>
                    <div class="file-item">market_analysis.docx</div>
                    <div class="file-item">financial_report.pdf</div>
                </div>
            </div>
        </div>
    </div>
</body>
</html>
    """,




    "planetar": """
    <!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Планетарная визуализация кластеров</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%);
            margin: 0;
            padding: 20px;
            min-height: 100vh;
            color: white;
            overflow-x: hidden;
        }

        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 30px;
        }

        .header {
            text-align: center;
            margin-bottom: 50px;
        }

        .header h1 {
            font-size: 3em;
            margin: 0;
            background: linear-gradient(45deg, #ff6b6b, #4ecdc4);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            text-shadow: 0 5px 15px rgba(0,0,0,0.3);
        }

        .header p {
            font-size: 1.3em;
            opacity: 0.9;
            margin-top: 10px;
        }

        .solar-system {
            position: relative;
            height: 600px;
            margin: 0 auto;
            perspective: 1000px;
        }

        .sun {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 120px;
            height: 120px;
            background: radial-gradient(circle, #ffd700 0%, #ff8c00 50%, #ff4500 100%);
            border-radius: 50%;
            box-shadow: 0 0 80px #ffd700, 0 0 120px #ff8c00;
            animation: pulse 3s ease-in-out infinite;
        }

        @keyframes pulse {
            0%, 100% { transform: translate(-50%, -50%) scale(1); }
            50% { transform: translate(-50%, -50%) scale(1.1); }
        }

        .orbit {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            border: 2px solid rgba(255,255,255,0.1);
            border-radius: 50%;
        }

        .planet {
            position: absolute;
            border-radius: 50%;
            background: linear-gradient(135deg, var(--color1), var(--color2));
            box-shadow: 0 0 20px var(--glow);
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            font-size: 0.9em;
            text-align: center;
            padding: 5px;
        }

        .planet:hover {
            transform: scale(1.2);
            box-shadow: 0 0 30px var(--glow);
            z-index: 10;
        }

        .planet-info {
            position: absolute;
            background: rgba(0,0,0,0.9);
            border: 2px solid var(--info-color);
            border-radius: 15px;
            padding: 20px;
            color: white;
            backdrop-filter: blur(10px);
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            opacity: 0;
            transition: opacity 0.3s ease;
            pointer-events: none;
            z-index: 100;
        }

        .planet:hover .planet-info {
            opacity: 1;
        }

        .stats-panel {
            background: rgba(255,255,255,0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 30px;
            margin-top: 40px;
            border: 1px solid rgba(255,255,255,0.2);
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
        }

        .stat-card {
            background: rgba(0,0,0,0.3);
            padding: 20px;
            border-radius: 15px;
            border-left: 4px solid var(--accent-color);
        }

        .stat-value {
            font-size: 2em;
            font-weight: bold;
            margin: 10px 0;
            color: var(--accent-color);
        }

        .moons {
            display: flex;
            gap: 10px;
            margin-top: 10px;
            flex-wrap: wrap;
        }

        .moon {
            background: rgba(255,255,255,0.2);
            padding: 8px 12px;
            border-radius: 20px;
            font-size: 0.9em;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🌌 Планетарная система кластеров</h1>
            <p>Визуализация данных в виде солнечной системы</p>
        </div>

        <div class="solar-system">
            <!-- Солнце (корневой кластер) -->
            <div class="sun"></div>

            <!-- Орбиты и планеты -->
            <div class="orbit" style="width: 400px; height: 400px;">
                <div class="planet" style="--color1: #4ecdc4; --color2: #44a08d; --glow: #4ecdc4; 
                    width: 60px; height: 60px; --info-color: #4ecdc4;"
                    onmouseover="showInfo(this)" onmouseout="hideInfo(this)">
                    🚀 Технологии
                    <div class="planet-info">
                        <h3>🚀 Технологии</h3>
                        <p>Файлов: <strong>12,480</strong></p>
                        <p>Схожесть: <strong>0.87</strong></p>
                        <div class="moons">
                            <span class="moon">ai_research.txt</span>
                            <span class="moon">tech_report.pdf</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="orbit" style="width: 550px; height: 550px;">
                <div class="planet" style="--color1: #ff6b6b; --color2: #c44d58; --glow: #ff6b6b; 
                    width: 50px; height: 50px; --info-color: #ff6b6b;"
                    onmouseover="showInfo(this)" onmouseout="hideInfo(this)">
                    📚 Наука
                    <div class="planet-info">
                        <h3>📚 Наука</h3>
                        <p>Файлов: <strong>8,742</strong></p>
                        <p>Схожесть: <strong>0.79</strong></p>
                        <div class="moons">
                            <span class="moon">physics_paper.txt</span>
                            <span class="moon">biology_study.pdf</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="orbit" style="width: 700px; height: 700px;">
                <div class="planet" style="--color1: #ffa726; --color2: #ff9800; --glow: #ffa726; 
                    width: 70px; height: 70px; --info-color: #ffa726;"
                    onmouseover="showInfo(this)" onmouseout="hideInfo(this)">
                    💼 Бизнес
                    <div class="planet-info">
                        <h3>💼 Бизнес</h3>
                        <p>Файлов: <strong>5,321</strong></p>
                        <p>Схожесть: <strong>0.85</strong></p>
                        <div class="moons">
                            <span class="moon">market_analysis.docx</span>
                            <span class="moon">financial_report.pdf</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="stats-panel">
            <h2 style="text-align: center; margin-bottom: 30px;">📊 Общая статистика системы</h2>
            <div class="stats-grid">
                <div class="stat-card" style="--accent-color: #ffd700">
                    <h3>☀️ Центральное ядро</h3>
                    <div class="stat-value">32,456</div>
                    <div class="stat-label">Всего файлов в системе</div>
                </div>
                <div class="stat-card" style="--accent-color: #4ecdc4">
                    <h3>📈 Средняя схожесть</h3>
                    <div class="stat-value">0.82</div>
                    <div class="stat-label">По всем кластерам</div>
                </div>
                <div class="stat-card" style="--accent-color: #ff6b6b">
                    <h3>🪐 Планетарные кластеры</h3>
                    <div class="stat-value">3</div>
                    <div class="stat-label">Активных орбит</div>
                </div>
            </div>
        </div>
    </div>

    <script>
        // Простая функция для позиционирования планет на орбитах
        function positionPlanets() {
            const orbits = document.querySelectorAll('.orbit');
            orbits.forEach((orbit, index) => {
                const planet = orbit.querySelector('.planet');
                if (planet) {
                    const angle = (index * 120) % 360;
                    const rad = angle * Math.PI / 180;
                    const orbitWidth = orbit.offsetWidth / 2;
                    const orbitHeight = orbit.offsetHeight / 2;
                    
                    const x = Math.cos(rad) * orbitWidth;
                    const y = Math.sin(rad) * orbitHeight;
                    
                    planet.style.transform = `translate(${x}px, ${y}px)`;
                }
            });
        }

        // Позиционируем планеты при загрузке
        window.addEventListener('load', positionPlanets);
    </script>
</body>
</html>
    """,





    "drilldown": """
   <!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Drill-Down визуализация</title>
    <style>
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            margin: 0;
            padding: 20px;
            min-height: 100vh;
        }

        .container {
            max-width: 1400px;
            margin: 0 auto;
            background: white;
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.1);
        }

        .header {
            text-align: center;
            margin-bottom: 50px;
        }

        .header h1 {
            font-size: 2.8em;
            color: #2d3748;
            margin: 0;
            background: linear-gradient(45deg, #667eea, #764ba2);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .breadcrumb {
            display: flex;
            align-items: center;
            gap: 10px;
            margin: 30px 0;
            padding: 20px;
            background: #f7fafc;
            border-radius: 12px;
            border-left: 4px solid #667eea;
        }

        .breadcrumb-item {
            padding: 8px 16px;
            background: white;
            border-radius: 8px;
            border: 2px solid #e2e8f0;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .breadcrumb-item:hover {
            border-color: #667eea;
            background: #667eea;
            color: white;
        }

        .breadcrumb-item.active {
            background: #667eea;
            color: white;
            border-color: #667eea;
        }

        .drilldown-grid {
            display: grid;
            grid-template-columns: 300px 1fr;
            gap: 30px;
            min-height: 500px;
        }

        .sidebar {
            background: #f7fafc;
            border-radius: 15px;
            padding: 25px;
            border: 2px solid #e2e8f0;
        }

        .sidebar h3 {
            color: #2d3748;
            margin: 0 0 20px 0;
            padding-bottom: 10px;
            border-bottom: 2px solid #667eea;
        }

        .cluster-list {
            list-style: none;
            padding: 0;
            margin: 0;
        }

        .cluster-item {
            padding: 15px;
            margin: 10px 0;
            background: white;
            border-radius: 10px;
            border: 2px solid #e2e8f0;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .cluster-item:hover {
            border-color: #667eea;
            transform: translateX(5px);
        }

        .cluster-item.active {
            border-color: #667eea;
            background: #667eea;
            color: white;
        }

        .content-area {
            background: white;
            border-radius: 15px;
            padding: 30px;
            border: 2px solid #e2e8f0;
        }

        .content-header {
            display: flex;
            justify-content: between;
            align-items: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid #e2e8f0;
        }

        .content-header h2 {
            color: #2d3748;
            margin: 0;
            font-size: 1.8em;
        }

        .stats-cards {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }

        .stat-card {
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            padding: 20px;
            border-radius: 12px;
            text-align: center;
        }

        .stat-number {
            font-size: 2.5em;
            font-weight: bold;
            margin: 10px 0;
        }

        .files-section {
            background: #f7fafc;
            padding: 25px;
            border-radius: 12px;
            margin-top: 30px;
        }

        .files-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 15px;
            margin-top: 20px;
        }

        .file-card {
            background: white;
            padding: 15px;
            border-radius: 8px;
            border: 2px solid #e2e8f0;
            text-align: center;
            transition: all 0.3s ease;
        }

        .file-card:hover {
            border-color: #667eea;
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
        }

        .distribution-chart {
            display: flex;
            align-items: end;
            height: 100px;
            gap: 10px;
            margin: 20px 0;
            padding: 20px;
            background: #f7fafc;
            border-radius: 8px;
        }

        .chart-bar {
            flex: 1;
            background: linear-gradient(to top, #667eea, #764ba2);
            border-radius: 4px 4px 0 0;
            min-height: 10px;
        }

        .level-0 { height: 20%; }
        .level-1 { height: 40%; }
        .level-2 { height: 60%; }
        .level-3 { height: 80%; }
        .level-4 { height: 100%; }

        .back-button {
            background: #667eea;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 1em;
            transition: all 0.3s ease;
        }

        .back-button:hover {
            background: #5a67d8;
            transform: translateY(-2px);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔍 Drill-Down Анализ</h1>
            <p>Детальное исследование структуры кластеров</p>
        </div>

        <div class="breadcrumb">
            <div class="breadcrumb-item active">Все кластеры</div>
            <div class="breadcrumb-item">Технологии</div>
            <div class="breadcrumb-item">AI Research</div>
        </div>

        <div class="drilldown-grid">
            <div class="sidebar">
                <h3>📁 Кластеры</h3>
                <ul class="cluster-list">
                    <li class="cluster-item active">🚀 Технологии</li>
                    <li class="cluster-item">📚 Наука</li>
                    <li class="cluster-item">💼 Бизнес</li>
                    <li class="cluster-item">🎨 Искусство</li>
                    <li class="cluster-item">🏥 Медицина</li>
                </ul>
            </div>

            <div class="content-area">
                <div class="content-header">
                    <h2>🚀 Кластер "Технологии"</h2>
                    <button class="back-button">← Назад</button>
                </div>

                <div class="stats-cards">
                    <div class="stat-card">
                        <div class="stat-label">Файлов</div>
                        <div class="stat-number">12,480</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">Схожесть</div>
                        <div class="stat-number">0.87</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">Подкластеров</div>
                        <div class="stat-number">5</div>
                    </div>
                </div>

                <div>
                    <h3>📊 Распределение схожести</h3>
                    <div class="distribution-chart">
                        <div class="chart-bar level-0"></div>
                        <div class="chart-bar level-1"></div>
                        <div class="chart-bar level-2"></div>
                        <div class="chart-bar level-3"></div>
                        <div class="chart-bar level-4"></div>
                    </div>
                </div>

                <div class="files-section">
                    <h3>📄 Файлы кластера</h3>
                    <div class="files-grid">
                        <div class="file-card">ai_research.txt</div>
                        <div class="file-card">tech_report.pdf</div>
                        <div class="file-card">innovation.docx</div>
                        <div class="file-card">code_review.md</div>
                        <div class="file-card">algorithm.py</div>
                        <div class="file-card">data_analysis.ipynb</div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</body>
</html>
    """
}

MOCK_UPLOAD_RESULT = {
    "corpus_id": str(uuid.uuid4()),
    "file_count": 30000,
    "index_stats": {
        "total_size_gb": 95.4
    }
}

MOCK_CLUSTER_RESULT = {
    "folder": "/shared_data/documents",
    "data": {
        "id": "root",
        "name": "Все кластеры",
        "fileCount": 32456,
        "avgSimilarity": 0.82,
        "children": [
            {
                "id": "cluster1",
                "name": "Технологии",
                "fileCount": 12480,
                "avgSimilarity": 0.87,
                "similarityDistribution": [0, 0.1, 0.2, 0.3, 0.4],
                "files": [{"name": "ai_research.txt"}],
                "children": [
                    {
                        "id": "cluster1_1",
                        "name": "Искусственный интеллект",
                        "fileCount": 4580,
                        "avgSimilarity": 0.91,
                        "files": [{"name": "neural_networks.pdf"}],
                        "children": [
                            {
                                "id": "cluster1_1_1",
                                "name": "Машинное обучение",
                                "fileCount": 2345,
                                "avgSimilarity": 0.94,
                                "files": [{"name": "ml_algorithms.docx"}],
                                "children": [
                                    {
                                        "id": "cluster1_1_1_1",
                                        "name": "Глубокое обучение",
                                        "fileCount": 1234,
                                        "avgSimilarity": 0.96,
                                        "files": [{"name": "deep_learning_frameworks.pdf"}],
                                        "children": [
                                            {
                                        "id": "cluster1_1_1_1_1",
                                        "name": "Глубокое обучение 2",
                                        "fileCount": 1234,
                                        "avgSimilarity": 0.96,
                                        "files": [{"name": "deep_learning_frameworks.pdf"}],
                                        "children": [
                                            {
                                        "id": "cluster1_1_1_1_1_1",
                                        "name": "Глубокое обучение 3",
                                        "fileCount": 1234,
                                        "avgSimilarity": 0.96,
                                        "files": [{"name": "deep_learning_frameworks.pdf"}],
                                        "children": [
                                            
                                        ]
                                    },
                                        ]
                                    },
                                        ]
                                    },
                                    {
                                        "id": "cluster1_1_1_2",
                                        "name": "Обучение с подкреплением",
                                        "fileCount": 876,
                                        "avgSimilarity": 0.93,
                                        "files": [{"name": "reinforcement_learning.md"}],
                                        "children": []
                                    },
                                    {
                                        "id": "cluster1_1_1_3",
                                        "name": "Обработка естественного языка",
                                        "fileCount": 235,
                                        "avgSimilarity": 0.95,
                                        "files": [{"name": "nlp_models.txt"}],
                                        "children": []
                                    }
                                ]
                            },
                            {
                                "id": "cluster1_1_2",
                                "name": "Компьютерное зрение",
                                "fileCount": 1567,
                                "avgSimilarity": 0.89,
                                "files": [{"name": "image_recognition.pdf"}],
                                "children": [
                                    {
                                        "id": "cluster1_1_2_1",
                                        "name": "Распознавание объектов",
                                        "fileCount": 789,
                                        "avgSimilarity": 0.91,
                                        "files": [{"name": "object_detection.docx"}],
                                        "children": []
                                    },
                                    {
                                        "id": "cluster1_1_2_2",
                                        "name": "Сегментация изображений",
                                        "fileCount": 543,
                                        "avgSimilarity": 0.88,
                                        "files": [{"name": "image_segmentation.pdf"}],
                                        "children": []
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        "id": "cluster1_2",
                        "name": "Кибербезопасность",
                        "fileCount": 3120,
                        "avgSimilarity": 0.85,
                        "files": [{"name": "security_protocols.docx"}],
                        "children": [
                            {
                                "id": "cluster1_2_1",
                                "name": "Сетевая безопасность",
                                "fileCount": 1456,
                                "avgSimilarity": 0.87,
                                "files": [{"name": "network_security.pdf"}],
                                "children": [
                                    {
                                        "id": "cluster1_2_1_1",
                                        "name": "Firewall",
                                        "fileCount": 678,
                                        "avgSimilarity": 0.89,
                                        "files": [{"name": "firewall_config.docx"}],
                                        "children": []
                                    },
                                    {
                                        "id": "cluster1_2_1_2",
                                        "name": "VPN",
                                        "fileCount": 432,
                                        "avgSimilarity": 0.86,
                                        "files": [{"name": "vpn_protocols.pdf"}],
                                        "children": []
                                    }
                                ]
                            },
                            {
                                "id": "cluster1_2_2",
                                "name": "Криптография",
                                "fileCount": 987,
                                "avgSimilarity": 0.83,
                                "files": [{"name": "encryption_methods.docx"}],
                                "children": [
                                    {
                                        "id": "cluster1_2_2_1",
                                        "name": "Асимметричное шифрование",
                                        "fileCount": 456,
                                        "avgSimilarity": 0.85,
                                        "files": [{"name": "rsa_algorithm.pdf"}],
                                        "children": []
                                    },
                                    {
                                        "id": "cluster1_2_2_2",
                                        "name": "Хеширование",
                                        "fileCount": 321,
                                        "avgSimilarity": 0.82,
                                        "files": [{"name": "hash_functions.docx"}],
                                        "children": []
                                    }
                                ]
                            }
                        ]
                    }
                ]
            },
            {
                "id": "cluster2",
                "name": "Финансы",
                "fileCount": 8765,
                "avgSimilarity": 0.79,
                "similarityDistribution": [0.1, 0.2, 0.3, 0.4, 0.5],
                "files": [{"name": "market_analysis.pdf"}],
                "children": [
                    {
                        "id": "cluster2_1",
                        "name": "Инвестиции",
                        "fileCount": 4321,
                        "avgSimilarity": 0.83,
                        "files": [{"name": "stock_portfolio.xlsx"}],
                        "children": [
                            {
                                "id": "cluster2_1_1",
                                "name": "Акции",
                                "fileCount": 1987,
                                "avgSimilarity": 0.85,
                                "files": [{"name": "stock_analysis.pdf"}],
                                "children": [
                                    {
                                        "id": "cluster2_1_1_1",
                                        "name": "Голубые фишки",
                                        "fileCount": 876,
                                        "avgSimilarity": 0.87,
                                        "files": [{"name": "blue_chips.docx"}],
                                        "children": []
                                    },
                                    {
                                        "id": "cluster2_1_1_2",
                                        "name": "Ростковые акции",
                                        "fileCount": 543,
                                        "avgSimilarity": 0.84,
                                        "files": [{"name": "growth_stocks.pdf"}],
                                        "children": []
                                    }
                                ]
                            },
                            {
                                "id": "cluster2_1_2",
                                "name": "Облигации",
                                "fileCount": 1234,
                                "avgSimilarity": 0.81,
                                "files": [{"name": "bonds_analysis.docx"}],
                                "children": [
                                    {
                                        "id": "cluster2_1_2_1",
                                        "name": "Государственные",
                                        "fileCount": 678,
                                        "avgSimilarity": 0.83,
                                        "files": [{"name": "government_bonds.pdf"}],
                                        "children": []
                                    },
                                    {
                                        "id": "cluster2_1_2_2",
                                        "name": "Корпоративные",
                                        "fileCount": 456,
                                        "avgSimilarity": 0.79,
                                        "files": [{"name": "corporate_bonds.docx"}],
                                        "children": []
                                    }
                                ]
                            }
                        ]
                    },
                    {
                        "id": "cluster2_2",
                        "name": "Бухгалтерия",
                        "fileCount": 2444,
                        "avgSimilarity": 0.76,
                        "files": [{"name": "annual_report.pdf"}],
                        "children": [
                            {
                                "id": "cluster2_2_1",
                                "name": "Налоги",
                                "fileCount": 1123,
                                "avgSimilarity": 0.78,
                                "files": [{"name": "tax_calculation.xlsx"}],
                                "children": [
                                    {
                                        "id": "cluster2_2_1_1",
                                        "name": "НДС",
                                        "fileCount": 567,
                                        "avgSimilarity": 0.80,
                                        "files": [{"name": "vat_report.pdf"}],
                                        "children": []
                                    },
                                    {
                                        "id": "cluster2_2_1_2",
                                        "name": "Налог на прибыль",
                                        "fileCount": 456,
                                        "avgSimilarity": 0.77,
                                        "files": [{"name": "profit_tax.docx"}],
                                        "children": []
                                    }
                                ]
                            },
                            {
                                "id": "cluster2_2_2",
                                "name": "Отчетность",
                                "fileCount": 876,
                                "avgSimilarity": 0.74,
                                "files": [{"name": "financial_statements.pdf"}],
                                "children": [
                                    {
                                        "id": "cluster2_2_2_1",
                                        "name": "Баланс",
                                        "fileCount": 432,
                                        "avgSimilarity": 0.76,
                                        "files": [{"name": "balance_sheet.xlsx"}],
                                        "children": []
                                    },
                                    {
                                        "id": "cluster2_2_2_2",
                                        "name": "ОПУ",
                                        "fileCount": 321,
                                        "avgSimilarity": 0.73,
                                        "files": [{"name": "income_statement.pdf"}],
                                        "children": []
                                    }
                                ]
                            }
                        ]
                    }
                ]
            }
        ]
    },
    "graphic_representation": "http://localhost:3000/api/visualization/graphic",
    "planetar_representation": "http://localhost:3000/api/visualization/planetar",
    "drill-down_representation": "http://localhost:3000/api/visualization/drilldown"
}
# Статические эндпоинты для визуализации
@app.route('/api/visualization/graphic', methods=['GET'])
def graphic_visualization():
    return VISUALIZATION_HTML["graphic"], 200, {'Content-Type': 'text/html'}

@app.route('/api/visualization/planetar', methods=['GET'])
def planetar_visualization():
    return VISUALIZATION_HTML["planetar"], 200, {'Content-Type': 'text/html'}

@app.route('/api/visualization/drilldown', methods=['GET'])
def drilldown_visualization():
    return VISUALIZATION_HTML["drilldown"], 200, {'Content-Type': 'text/html'}

# Основные API эндпоинты
@app.route('/api/normalize', methods=['POST'])
def normalize_text():
    if not request.content_type or 'text/plain' not in request.content_type:
        return jsonify(error="INVALID_ENCODING"), 400
    
    if request.content_length and request.content_length > 10 * 1024 * 1024:
        return jsonify(error="PAYLOAD_TOO_LARGE"), 413
    
    response_text = "Нормализованный текст пример"
    response = app.response_class(
        response=response_text,
        status=200,
        mimetype='text/plain'
    )
    response.headers['language'] = 'ru'
    return response

@app.route('/api/embedding', methods=['POST'])
def get_embedding():
    if not request.content_type or 'text/plain' not in request.content_type:
        return jsonify(error="INVALID_ENCODING"), 400
    
    if request.content_length and request.content_length > 10 * 1024 * 1024:
        return jsonify(error="PAYLOAD_TOO_LARGE"), 413
    
    model_id = request.headers.get('x-model-id')
    if not model_id:
        return jsonify(error="Model ID required"), 400
    
    model_exists = any(m['model_id'] == model_id for m in MOCK_MODELS)
    if not model_exists:
        return jsonify(error="Model not found"), 404
    
    dimension = next((m['dimension'] for m in MOCK_MODELS if m['model_id'] == model_id), 512)
    embeddings = MOCK_EMBEDDINGS[:dimension] if dimension <= len(MOCK_EMBEDDINGS) else MOCK_EMBEDDINGS * (dimension // len(MOCK_EMBEDDINGS) + 1)
    embeddings = embeddings[:dimension]
    
    return jsonify({
        "embeddings": embeddings,
        "dimension": dimension
    })

@app.route('/api/models', methods=['GET'])
def get_models():
    return jsonify(MOCK_MODELS)

@app.route('/api/semantic/upload', methods=['POST'])
def upload_corpus():
    if not request.content_type or 'application/json' not in request.content_type:
        return jsonify(error="Invalid content type"), 400
    
    corpus_path = request.headers.get('x-corpus-path')
    model_id = request.headers.get('x-model-id')
    
    if not corpus_path or not model_id:
        return jsonify(error="Missing required headers"), 400
    
    model_exists = any(m['model_id'] == model_id for m in MOCK_MODELS)
    if not model_exists:
        return jsonify(error="Model not found"), 404
    
    job_id = str(uuid.uuid4())
    jobs_db[job_id] = {
        'status': 'processing',
        'type': 'upload',
        'progress': 0,
        'corpus_path': corpus_path,
        'model_id': model_id,
        'result': MOCK_UPLOAD_RESULT
    }
    job_creation_time[job_id] = time.time()
    
    return jsonify({
        "job_id": job_id,
        "estimated_time_min": 120
    }), 202

@app.route('/api/jobs/<job_id>', methods=['GET'])
def get_job_status(job_id):
    job = jobs_db.get(job_id)
    if not job:
        return jsonify(error="Job not found"), 404
    
    current_time = time.time()
    job_start_time = job_creation_time.get(job_id, current_time)
    elapsed_time = current_time - job_start_time
    
    if elapsed_time < 3:
        progress = min(int((elapsed_time / 3) * 100), 100)
        return jsonify({
            "status": "processing",
            "progress": progress,
            "details": {
                "bytes_processed": progress * 1000000,
                "files_processed": progress * 50
            }
        })
    else:
        jobs_db[job_id]['status'] = 'completed'
        
        # Возвращаем результат в зависимости от типа задачи
        if job['type'] == 'upload':
            return jsonify({
                "status": "completed",
                "result_url": f"http://back-service:3000/api/jobs/{job_id}/result"
            })
        elif job['type'] == 'clusterisation':
            return jsonify({
                "status": "completed",
                "result_url": f"http://back-service:3000/api/jobs/{job_id}/result"
            })
        elif job['type'] == 'classification':
            return jsonify({
                "status": "completed",
                "result_url": f"http://back-service:3000/api/jobs/{job_id}/result"
            })
        else:
            return jsonify(error="Unknown job type"), 500

@app.route('/api/jobs/<job_id>/result', methods=['GET'])
def get_job_result(job_id):
    job = jobs_db.get(job_id)
    if not job or job['status'] != 'completed':
        return jsonify(error="Result not ready"), 404
    
    # Возвращаем результат в зависимости от типа задачи

    return jsonify(job['result'])



@app.route('/api/semantic/search', methods=['POST'])
def semantic_search():
    return perform_search()

@app.route('/api/semantic/search/unstructured', methods=['POST'])
def semantic_search_unstructured():
    return perform_search()

def perform_search():
    if not request.content_type or 'text/plain' not in request.content_type:
        return jsonify(error="Invalid content type"), 400
    
    corpus_id = request.headers.get('x-corpus-id')
    model_id = request.headers.get('x-model-id')
    
    if not corpus_id or not model_id:
        return jsonify(error="Missing required headers"), 400
    
    model_exists = any(m['model_id'] == model_id for m in MOCK_MODELS)
    if not model_exists:
        return jsonify(error="Model not found"), 404
    
    return jsonify({"results": MOCK_SEARCH_RESULTS})

@app.route('/api/clusterization', methods=['POST'])
def clusterisation():
    if not request.content_type or 'application/json' not in request.content_type:
        return jsonify(error="Invalid content type"), 400
    
    corpus_path = request.headers.get('x-corpus-path')
    model_id = request.headers.get('x-model-id')
    
    if not corpus_path or not model_id:
        return jsonify(error="Missing required headers"), 400
    
    model_exists = any(m['model_id'] == model_id for m in MOCK_MODELS)
    if not model_exists:
        return jsonify(error="Model not found"), 404
    
    job_id = str(uuid.uuid4())
    jobs_db[job_id] = {
        'status': 'processing',
        'type': 'clusterisation',
        'progress': 0,
        'corpus_path': corpus_path,
        'model_id': model_id,
        'result': MOCK_CLUSTER_RESULT
    }
    job_creation_time[job_id] = time.time()
    
    return jsonify({
        "job_id": job_id,
        "estimated_time_min": 120
    }), 202

@app.route('/api/classification', methods=['POST'])
def classification():
    """Эндпоинт для классификации документов по существующим кластерам"""
    if not request.content_type or 'application/json' not in request.content_type:
        return jsonify(error="Invalid content type"), 400
    
    # Получаем параметры из запроса
    corpus_path = request.headers.get('x-corpus-path')
    model_id = request.headers.get('x-model-id')
    
    if not corpus_path or not model_id:
        return jsonify(error="Missing required headers"), 400
    
    # Проверяем существование модели
    model_exists = any(m['model_id'] == model_id for m in MOCK_MODELS)
    if not model_exists:
        return jsonify(error="Model not found"), 404
    
    # Создаем задание на классификацию
    job_id = str(uuid.uuid4())
    jobs_db[job_id] = {
        'status': 'processing',
        'type': 'classification',
        'progress': 0,
        'corpus_path': corpus_path,
        'model_id': model_id,
        'result': {
            "folder": "C:/documents/new_documents",
            "data": {
                "id": "root",
                "name": "Все кластеры",
                "fileCount": 150,
                "avgSimilarity": 0.78,
                "children": [
                    {
                        "id": "cluster1",
                        "name": "Технологии",
                        "fileCount": 65,
                        "avgSimilarity": 0.85,
                        "similarityDistribution": [0.1, 0.15, 0.25, 0.3, 0.2],
                        "files": [
                            {"name": "new_ai_research.txt"},
                            {"name": "tech_report.pdf"}
                        ],
                        "children": []
                    },
                    {
                        "id": "cluster2", 
                        "name": "Наука",
                        "fileCount": 45,
                        "avgSimilarity": 0.72,
                        "similarityDistribution": [0.2, 0.25, 0.3, 0.15, 0.1],
                        "files": [
                            {"name": "physics_paper.txt"},
                            {"name": "biology_study.pdf"}
                        ],
                        "children": []
                    },
                    {
                        "id": "cluster3",
                        "name": "Бизнес",
                        "fileCount": 40,
                        "avgSimilarity": 0.81,
                        "similarityDistribution": [0.05, 0.1, 0.2, 0.3, 0.35],
                        "files": [
                            {"name": "market_analysis.docx"},
                            {"name": "financial_report.pdf"}
                        ],
                        "children": []
                    }
                ]
            },
            "correspondence_table": {
                "files": [
                    {
                        "f": "new_ai_research.txt",
                        "d": [
                            ["cluster1", 0.92],
                            ["cluster2", 0.68],
                            ["cluster3", 0.45],
                            ["cluster4", 0.32],
                            ["cluster5", 0.21]
                        ]
                    },
                    {
                        "f": "tech_report.pdf", 
                        "d": [
                            ["cluster1", 0.88],
                            ["cluster3", 0.72],
                            ["cluster2", 0.61],
                            ["cluster6", 0.38],
                            ["cluster7", 0.29]
                        ]
                    },
                    {
                        "f": "physics_paper.txt",
                        "d": [
                            ["cluster2", 0.95],
                            ["cluster1", 0.63],
                            ["cluster8", 0.42],
                            ["cluster9", 0.31],
                            ["cluster10", 0.24]
                        ]
                    }
                ],
                "cluster_names": {
                    "cluster1": "Технологии",
                    "cluster2": "Наука", 
                    "cluster3": "Бизнес",
                    "cluster4": "Искусство",
                    "cluster5": "Спорт",
                    "cluster6": "Медицина",
                    "cluster7": "Образование",
                    "cluster8": "Политика",
                    "cluster9": "Экономика",
                    "cluster10": "Путешествия"
                }
            },
            "graphic_representation": "http://localhost:3000/api/visualization/graphic"
        }
    }
    job_creation_time[job_id] = time.time()
    
    return jsonify({
        "job_id": job_id,
        "estimated_time_min": 45
    }), 202

# Обработчики ошибок
@app.errorhandler(404)
def not_found(error):
    return jsonify(error="Not found"), 404

@app.errorhandler(413)
def payload_too_large(error):
    return jsonify(error="PAYLOAD_TOO_LARGE"), 413

@app.errorhandler(429)
def too_many_requests(error):
    return jsonify(error="Too many requests"), 429

@app.errorhandler(500)
def internal_error(error):
    return jsonify(error="Internal server error"), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3000, debug=True)