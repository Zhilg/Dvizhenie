let currentJobId = null;
let checkInterval = null;
let availableModels = [];
let baseTrainingTime = null;
let fineTuningStartTime = null;
let timerInterval = null;
let startTime = null;
let trainingTime = null;

function startTimer() {
    startTime = new Date();
    timerInterval = setInterval(updateTimer, 1000);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
        
        // Сохраняем итоговое время
        const endTime = new Date();
        trainingTime = (endTime - startTime) / 1000;
        return trainingTime; // Возвращаем время
    }
    return null;
}

function resetTimer() {
    stopTimer();
    totalTrainingTime = null;
    document.getElementById('timerDisplay').textContent = '00:00:00';
}

function updateTimer() {
    const currentTime = new Date();
    const elapsedTime = new Date(currentTime - startTime);
    
    const hours = elapsedTime.getUTCHours().toString().padStart(2, '0');
    const minutes = elapsedTime.getUTCMinutes().toString().padStart(2, '0');
    const seconds = elapsedTime.getUTCSeconds().toString().padStart(2, '0');
    
    document.getElementById('timerDisplay').textContent = `${hours}:${minutes}:${seconds}`;
}

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
    resetTimer();
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

        const response = await fetch('/api/fine-tuning/start', {
            method: 'POST',
            headers: {
                'X-Base-Model-ID': baseModelId
            },
            body: formData
        });
        startTimer();
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
            const response = await fetch(`/api/jobs/${currentJobId}`);
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
        if (status.details.current_epoch) {
            details += ` | Эпоха: ${status.details.current_epoch || 0}/${status.details.total_epochs || 0}`;
        }
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
        trainingTime = stopTimer();
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
            <div class="stat-value">${results.training_time ? results.training_time.toFixed(1) + ' с' : 'N/A'}</div>
            <div class="stat-label">Время дообучения</div>
        </div>
        <div class="stat-item">
            <div class="stat-value">${results.performance_improvement ? (results.performance_improvement * 100).toFixed(1) + '%' : 'N/A'}</div>
            <div class="stat-label">Улучшение точности</div>
        </div>
        ${results.clustering_result ? `
        <div class="stat-item">
            <div class="stat-value">${results.clustering_result.total_clusters || 0}</div>
            <div class="stat-label">Всего кластеров</div>
        </div>
        <div class="stat-item">
            <div class="stat-value">+${results.clustering_result.new_clusters || 0}</div>
            <div class="stat-label">Новых кластеров</div>
        </div>
        ` : ''}
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
    
    // Отображение результатов кластеризации, если они есть
    if (results.clustering_result) {
        displayClusteringResults(results.clustering_result);
    }
}

// Функция для отображения результатов кластеризации
function displayClusteringResults(clusterData) {
    console.log(clusterData);
    const clusteringSection = document.createElement('div');
    clusteringSection.className = 'section';
    
    let clustersHtml = '';
    
    // Новые кластеры
    if (clusterData.cluster_changes?.new_clusters_details?.length > 0) {
        clustersHtml += `
            <div class="cluster-category">
                <h4 style="color: #28a745;">🆕 Новые кластеры (${clusterData.new_clusters})</h4>
                ${clusterData.cluster_changes.new_clusters_details.map(cluster => `
                    <div class="cluster-card new">
                        <h5>${cluster.cluster_id}</h5>
                        <p><strong>Размер:</strong> ${cluster.size} файлов</p>
                        <p><strong>Темы:</strong> ${cluster.main_topics.join(', ')}</p>
                        <p><strong>Уверенность:</strong> ${(cluster.avg_confidence * 100).toFixed(1)}%</p>
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    // Измененные кластеры
    if (clusterData.cluster_changes?.modified_clusters_details?.length > 0) {
        clustersHtml += `
            <div class="cluster-category">
                <h4 style="color: #ffc107;">🔄 Измененные кластеры (${clusterData.modified_clusters})</h4>
                ${clusterData.cluster_changes.modified_clusters_details.map(cluster => `
                    <div class="cluster-card modified">
                        <h5>${cluster.cluster_id}</h5>
                        <p><strong>Размер:</strong> ${cluster.old_size} → ${cluster.new_size} 
                           <span style="color: ${cluster.size_change.startsWith('+') ? '#28a745' : '#dc3545'}">
                           ${cluster.size_change}
                           </span>
                        </p>
                        <p><strong>Новые темы:</strong> ${cluster.new_topics.join(', ') || 'нет'}</p>
                        <p><strong>Удаленные темы:</strong> ${cluster.removed_topics.join(', ') || 'нет'}</p>
                        <p><strong>Улучшение уверенности:</strong> +${(cluster.confidence_improvement * 100).toFixed(1)}%</p>
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    // Неизмененные кластеры
    if (clusterData.cluster_changes?.unchanged_clusters?.length > 0) {
        clustersHtml += `
            <div class="cluster-category">
                <h4 style="color: #6c757d;">✅ Неизмененные кластеры (${clusterData.unchanged_clusters})</h4>
                ${clusterData.cluster_changes.unchanged_clusters.map(cluster => `
                    <div class="cluster-card unchanged">
                        <h5>${cluster.cluster_id}</h5>
                        <p><strong>Размер:</strong> ${cluster.size} файлов</p>
                        <p><strong>Темы:</strong> ${cluster.main_topics.join(', ')}</p>
                        <p><strong>Уверенность:</strong> ${(cluster.avg_confidence * 100).toFixed(1)}%</p>
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    // Сводная статистика
    if (clusterData.summary) {
        const summary = clusterData.summary;
        clustersHtml += `
            <div class="cluster-summary">
                <h4>📊 Сводная статистика кластеризации</h4>
                <div class="summary-grid">
                    <div class="summary-item">
                        <span class="summary-value">${summary.total_documents}</span>
                        <span class="summary-label">Всего документов</span>
                    </div>
                    <div class="summary-item">
                        <span class="summary-value" style="color: #28a745;">${summary.documents_in_new_clusters}</span>
                        <span class="summary-label">В новых кластерах</span>
                    </div>
                    <div class="summary-item">
                        <span class="summary-value" style="color: #ffc107;">${summary.documents_in_modified_clusters}</span>
                        <span class="summary-label">В измененных кластерах</span>
                    </div>
                    <div class="summary-item">
                        <span class="summary-value" style="color: #6c757d;">${summary.documents_in_unchanged_clusters}</span>
                        <span class="summary-label">В неизмененных кластерах</span>
                    </div>
                    <div class="summary-item">
                        <span class="summary-value" style="color: #17a2b8;">${summary.overall_confidence_change}</span>
                        <span class="summary-label">Изменение уверенности</span>
                    </div>
                    <div class="summary-item">
                        <span class="summary-value" style="color: #6f42c1;">${summary.cluster_quality_improvement}</span>
                        <span class="summary-label">Качество кластеризации</span>
                    </div>
                </div>
            </div>
        `;
    }
    
    clusteringSection.innerHTML = `
        <h3>📊 Результаты кластеризации после дообучения</h3>
        <div class="clustering-results">
            <div class="cluster-overview">
                <p><strong>Всего кластеров:</strong> ${clusterData.total_clusters || 'N/A'}</p>
                <p><strong>Новых:</strong> <span style="color: #28a745;">${clusterData.new_clusters || 'N/A'}</span></p>
                <p><strong>Измененных:</strong> <span style="color: #ffc107;">${clusterData.modified_clusters || 'N/A'}</span></p>
                <p><strong>Неизмененных:</strong> <span style="color: #6c757d;">${clusterData.unchanged_clusters || 'N/A'}</span></p>
            </div>
            ${clustersHtml}
        </div>
    `;
    
    document.getElementById('results').appendChild(clusteringSection);
}

function renderClusterTree(node, level = 0) {
    if (!node.id) return '<p>Нет данных о кластеризации</p>';
    
    let html = `
        <div class="cluster-node" style="margin-left: ${level * 20}px">
            <div class="cluster-header">
                <strong>${node.name || 'Без названия'}</strong> 
                <span class="cluster-stats">${node.fileCount || 0} файлов, ${((node.avgSimilarity || 0) * 100).toFixed(1)}%</span>
            </div>
    `;
    
    if (node.changes && node.changes.status !== 'unchanged') {
        html += `<span class="change-badge ${node.changes.status}">${getChangeBadgeText(node.changes.status)}</span>`;
    }
    
    if (node.children && node.children.length > 0) {
        html += '<div class="cluster-children">';
        node.children.forEach(child => {
            html += renderClusterTree(child, level + 1);
        });
        html += '</div>';
    }
    
    html += '</div>';
    return html;
}

function getChangeBadgeText(status) {
    const statusText = {
        'new': 'НОВЫЙ',
        'modified': 'ИЗМЕНЕН',
        'removed': 'УДАЛЕН',
        'moved': 'ПЕРЕМЕЩЕН'
    };
    return statusText[status] || status;
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
                <p><strong>Время:</strong> ${trainingTime}с</p>
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