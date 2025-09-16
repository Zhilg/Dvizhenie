let currentJobId = null;
let checkInterval = null;
let availableModels = [];
let baseTrainingTime = null;
let fineTuningStartTime = null;

// Загрузка доступных моделей
async function loadModels() {
    try {
        showStatus('🔄 Загрузка моделей...', 'processing');
        const response = await fetch('/api/models');
        
        if (!response.ok) {
            throw new Error('Ошибка загрузки моделей');
        }
        
        availableModels = await response.json();
        updateModelSelect();
        showStatus('✅ Модели загружены', 'success');
        
    } catch (error) {
        console.error('Error loading models:', error);
        showStatus('❌ Ошибка загрузки моделей: ' + error.message, 'error');
    }
}

function updateModelSelect() {
    const select = document.getElementById('baseModelSelect');
    select.innerHTML = '<option value="">Выберите модель...</option>';
    
    availableModels.forEach(model => {
        const option = document.createElement('option');
        option.value = model.model_id;
        option.textContent = model.model_name || model.model_id;
        option.dataset.dimension = model.dimension;
        select.appendChild(option);
    });
    
    // Показываем информацию о выбранной модели
    select.addEventListener('change', function() {
        const selectedOption = this.options[this.selectedIndex];
        if (selectedOption.value) {
            document.getElementById('modelInfo').style.display = 'block';
            document.getElementById('modelDetails').innerHTML = `
                <p><strong>ID модели:</strong> ${selectedOption.value}</p>
                <p><strong>Размерность:</strong> ${selectedOption.dataset.dimension}</p>
            `;
        } else {
            document.getElementById('modelInfo').style.display = 'none';
        }
    });
}

// Выбор папки с данными для дообучения
function selectTrainingFolder() {
    document.getElementById('trainingDataInput').click();
}

document.getElementById('trainingDataInput').addEventListener('change', function(e) {
    const files = e.target.files;
    if (files.length === 0) return;
    
    document.getElementById('selectedTrainingFolder').textContent = 
        `📁 Выбрано файлов: ${files.length}`;
    
    // Анализируем выбранные файлы
    analyzeSelectedFiles(files);
    
    // Активируем кнопку запуска, если выбрана модель и файлы
    const modelSelected = document.getElementById('baseModelSelect').value !== '';
    document.getElementById('startBtn').disabled = !modelSelected || files.length === 0;
});

// Анализ выбранных файлов
function analyzeSelectedFiles(files) {
    let totalSize = 0;
    let extensions = {};
    let sizeStats = {
        count: files.length,
        totalSize: 0,
        avgSize: 0,
        minSize: Infinity,
        maxSize: 0
    };
    
    Array.from(files).forEach(file => {
        totalSize += file.size;
        
        // Статистика по размерам
        sizeStats.totalSize += file.size;
        if (file.size < sizeStats.minSize) sizeStats.minSize = file.size;
        if (file.size > sizeStats.maxSize) sizeStats.maxSize = file.size;
        
        // Статистика по расширениям
        const ext = file.name.split('.').pop().toLowerCase();
        extensions[ext] = (extensions[ext] || 0) + 1;
    });
    
    sizeStats.avgSize = sizeStats.totalSize / sizeStats.count;
    
    // Форматируем размеры для отображения
    const formatBytes = (bytes) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };
    
    // Показываем статистику
    document.getElementById('fileStats').style.display = 'block';
    document.getElementById('fileStatsContent').innerHTML = `
        <p>Общий размер: <strong>${formatBytes(sizeStats.totalSize)}</strong></p>
        <p>Размер файлов: от <strong>${formatBytes(sizeStats.minSize)}</strong> до <strong>${formatBytes(sizeStats.maxSize)}</strong></p>
        <p>Средний размер: <strong>${formatBytes(sizeStats.avgSize)}</strong></p>
        <p>Расширения файлов: ${Object.entries(extensions).map(([ext, count]) => 
            `<span class="file-ext">${ext} (${count})</span>`).join(', ')}
        </p>
    `;
}

// Запуск процесса дообучения
async function startFineTuning() {
    const baseModelId = document.getElementById('baseModelSelect').value;
    const newModelName = document.getElementById('newModelName').value || `fine_tuned_${Date.now()}`;
    const files = document.getElementById('trainingDataInput').files;
    
    if (!baseModelId || files.length === 0) {
        showStatus('❌ Выберите модель и данные для дообучения', 'error');
        return;
    }
    
    try {
        document.getElementById('loading').style.display = 'block';
        document.getElementById('startBtn').disabled = true;
        showStatus('🚀 Запуск дообучения модели...', 'processing');
        
        // Запоминаем время начала дообучения
        fineTuningStartTime = Date.now();
        
        // Получаем информацию о времени обучения базовой модели
        const baseModelInfo = availableModels.find(m => m.model_id === baseModelId);
        if (baseModelInfo && baseModelInfo.training_time) {
            baseTrainingTime = baseModelInfo.training_time;
        }
        
        const formData = new FormData();
        Array.from(files).forEach(file => formData.append('files', file));
        formData.append('new_model_name', newModelName);
        
        // Добавляем параметры фильтрации
        const minFileSize = parseFloat(document.getElementById('minFileSize').value) * 1024 * 1024;
        const maxFileSize = parseFloat(document.getElementById('maxFileSize').value) * 1024 * 1024;
        const fileExtensions = document.getElementById('fileExtensions').value
            .split(',')
            .map(ext => ext.trim().toLowerCase())
            .filter(ext => ext);
        
        formData.append('min_file_size', minFileSize);
        formData.append('max_file_size', maxFileSize);
        formData.append('file_extensions', JSON.stringify(fileExtensions));
        
        const response = await fetch('/api/fine-tuning/start', {
            method: 'POST',
            headers: {
                'X-Base-Model-ID': baseModelId
            },
            body: formData
        });
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error(error || 'Ошибка сервера');
        }
        
        const result = await response.json();
        currentJobId = result.job_id;
        
        showStatus(`✅ Дообучение запущено. Job ID: ${currentJobId}`, 'success');
        startStatusChecking();
        
    } catch (error) {
        console.error('Fine-tuning error:', error);
        showStatus('❌ Ошибка: ' + error.message, 'error');
        document.getElementById('loading').style.display = 'none';
        document.getElementById('startBtn').disabled = false;
    }
}

// Проверка статуса дообучения
function startStatusChecking() {
    if (checkInterval) clearInterval(checkInterval);
    
    checkInterval = setInterval(async () => {
        try {
            const response = await fetch(`/api/fine-tuning/status/${currentJobId}`);
            if (!response.ok) throw new Error('Status check failed');
            
            const status = await response.json();
            
            if (status.status === 'processing') {
                updateProgress(status);
            } else if (status.status === 'completed') {
                clearInterval(checkInterval);
                await fetchResults(status.result_url);
            } else if (status.status === 'error') {
                clearInterval(checkInterval);
                showStatus('❌ Ошибка дообучения', 'error');
                document.getElementById('loading').style.display = 'none';
            }
        } catch (error) {
            console.error('Status check error:', error);
        }
    }, 3000);
}

function updateProgress(status) {
    const progress = status.progress || 0;
    document.getElementById('progressFill').style.width = progress + '%';
    
    let details = `Прогресс: ${progress}%`;
    if (status.details) {
        details += ` | Файлов обработано: ${status.details.files_processed || 0}/${status.details.total_files || 0}`;
        details += ` | Эпоха: ${status.details.current_epoch || 0}/${status.details.total_epochs || 0}`;
    }
    document.getElementById('progressDetails').textContent = details;
    
    // Сравнение времени выполнения
    if (fineTuningStartTime && baseTrainingTime) {
        const elapsedTime = (Date.now() - fineTuningStartTime) / 1000; // в секундах
        const timeComparison = baseTrainingTime / elapsedTime;
        
        let comparisonText = `Время дообучения: ${elapsedTime.toFixed(1)}с, `;
        comparisonText += `Базовое обучение: ${baseTrainingTime.toFixed(1)}с, `;
        comparisonText += `Ускорение: ${timeComparison.toFixed(1)}x`;
        
        if (timeComparison > 10) {
            comparisonText += ' ✅ (Дообучение признано успешным)';
        } else {
            comparisonText += ' ⚠️ (Дообучение не признано успешным)';
        }
        
        document.getElementById('timeComparison').textContent = comparisonText;
    }
}

// Получение результатов дообучения
async function fetchResults(resultUrl) {
    try {
        const response = await fetch("/api/result", {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "x-result-url": resultUrl
            },
        });
        
        if (!response.ok) throw new Error('Failed to fetch results');
        
        const results = await response.json();
        displayResults(results);
        showStatus('Дообучение завершено успешно!', 'success');
        
    } catch (error) {
        console.error('Error fetching results:', error);
        showStatus('Ошибка получения результатов: ' + error.message, 'error');
    } finally {
        document.getElementById('loading').style.display = 'none';
        loadFineTuningHistory();
    }
}

// Отображение результатов дообучения
function displayResults(results) {
    document.getElementById('results').style.display = 'block';
    
    // Общая статистика
    document.getElementById('summaryStats').innerHTML = `
        <div class="stat-item">
            <div class="stat-value">${results.new_model_id ? '✅' : '❌'}</div>
            <div class="stat-label">Модель создана</div>
        </div>
        <div class="stat-item">
            <div class="stat-value">${results.files_processed || 0}</div>
            <div class="stat-label">Файлов обработано</div>
        </div>
        <div class="stat-item">
            <div class="stat-value">${results.training_time ? results.training_time.toFixed(1) + 'с' : 'N/A'}</div>
            <div class="stat-label">Время дообучения</div>
        </div>
        <div class="stat-item">
            <div class="stat-value">${results.performance_improvement ? (results.performance_improvement * 100).toFixed(1) + '%' : 'N/A'}</div>
            <div class="stat-label">Улучшение точности</div>
        </div>
    `;
    
    // Сравнение производительности
    if (results.performance_comparison) {
        const comp = results.performance_comparison;
        document.getElementById('performanceComparison').innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                <div style="padding: 15px; background: #f0f7ff; border-radius: 8px;">
                    <h4>Базовая модель</h4>
                    <p>Точность: ${(comp.base_accuracy * 100).toFixed(1)}%</p>
                    <p>Время обучения: ${comp.base_training_time.toFixed(1)}с</p>
                </div>
                <div style="padding: 15px; background: #e6ffe6; border-radius: 8px;">
                    <h4>Дообученная модель</h4>
                    <p>Точность: ${(comp.fine_tuned_accuracy * 100).toFixed(1)}%</p>
                    <p>Время дообучения: ${comp.fine_tuning_time.toFixed(1)}с</p>
                    <p>Ускорение: ${(comp.base_training_time / comp.fine_tuning_time).toFixed(1)}x</p>
                </div>
            </div>
        `;
    }
}

// Загрузка истории дообучения
async function loadFineTuningHistory() {
    try {
        const response = await fetch('/api/fine-tuning/history');
        
        if (response.ok) {
            const history = await response.json();
            displayFineTuningHistory(history);
        }
    } catch (error) {
        console.error('Error loading fine-tuning history:', error);
    }
}

function displayFineTuningHistory(history) {
    const container = document.getElementById('fineTuningHistory');
    if (!history || history.length === 0) {
        container.innerHTML = '<p>📝 Нет истории дообучения</p>';
        return;
    }
    
    container.innerHTML = history.map(job => `
        <div class="job-item">
            <div class="job-header">
                <strong>🔧 ${job.job_id?.substring(0, 8)}...</strong>
                <span class="job-status status-${job.status}">${getStatusIcon(job.status)} ${job.status}</span>
            </div>
            <div class="job-details">
                <p><strong>Базовая модель:</strong> ${job.base_model_id || 'N/A'}</p>
                <p><strong>Новая модель:</strong> ${job.new_model_id || 'N/A'}</p>
                <p><strong>Создано:</strong> ${new Date(job.created_at).toLocaleString()}</p>
                ${job.training_time ? `<p><strong>Время:</strong> ${job.training_time.toFixed(1)}с</p>` : ''}
            </div>
        </div>
    `).join('');
}

// Вспомогательные функции
function showStatus(message, type) {
    const container = document.getElementById('status');
    container.innerHTML = `<div class="status-${type}">${message}</div>`;
    container.className = `status-container status-${type}`;
}

function getStatusIcon(status) {
    const icons = {
        'processing': '🔄',
        'completed': '✅',
        'error': '❌'
    };
    return icons[status] || '📋';
}

function downloadResults() {
    alert('Функция скачивания отчета будет реализована в будущем');
}

function testNewModel() {
    alert('Функция тестирования новой модели будет реализована в будущем');
}

function deployNewModel() {
    alert('Функция развертывания новой модели будет реализована в будущем');
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    loadModels();
    loadFineTuningHistory();
});