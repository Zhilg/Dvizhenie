let availableModels = [];
let availableCorpuses = [];
let baseTrainingTime = null;
let fineTuningStartTime = null;
let timerInterval = null;
let startTime = null;
let trainingTime = null;
let currentJobId = null;
let statusCheckInterval = null;

function startTimer() {
    startTime = new Date();
    timerInterval = setInterval(updateTimer, 1000);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
        
        const endTime = new Date();
        trainingTime = (endTime - startTime) / 1000;
        return trainingTime;
    }
    return null;
}

function resetTimer() {
    stopTimer();
    trainingTime = null;
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
        const response = await apiFetch('/api/models');
        
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

// Загрузка истории корпусов из БД
async function loadCorpusHistory() {
    try {
        const response = await apiFetch('/corpus-history');
        
        if (!response.ok) {
            throw new Error('Ошибка загрузки истории корпусов');
        }
        
        availableCorpuses = await response.json();
        updateCorpusSelect();
        
    } catch (error) {
        console.error('Error loading corpus history:', error);
        showStatus('❌ Ошибка загрузки истории корпусов: ' + error.message, 'error');
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
        option.dataset.trainingTime = model.training_time;
        select.appendChild(option);
    });
    
    select.addEventListener('change', function() {
        const selectedOption = this.options[this.selectedIndex];
        if (selectedOption.value) {
            document.getElementById('modelInfo').style.display = 'block';
            document.getElementById('modelDetails').innerHTML = `
                <p><strong>ID модели:</strong> ${selectedOption.value}</p>
                <p><strong>Размерность:</strong> ${selectedOption.dataset.dimension || 'N/A'}</p>
                <p><strong>Время обучения:</strong> ${selectedOption.dataset.trainingTime ? 
                    parseFloat(selectedOption.dataset.trainingTime).toFixed(1) + ' с' : 'N/A'}</p>
            `;
            
            if (selectedOption.dataset.trainingTime) {
                baseTrainingTime = parseFloat(selectedOption.dataset.trainingTime);
            }
        } else {
            document.getElementById('modelInfo').style.display = 'none';
            baseTrainingTime = null;
        }
        
        checkStartButton();
    });
}

function updateCorpusSelect() {
    const select = document.getElementById('corpusSelect');
    select.innerHTML = '<option value="">Выберите существующий корпус...</option>';
    
    availableCorpuses.forEach(corpus => {
        const option = document.createElement('option');
        option.value = corpus.id;
        option.textContent = `${corpus.name} (${corpus.files || 0} файлов) - ${new Date(corpus.created_at).toLocaleDateString()}`;
        option.dataset.files = corpus.files || 0;
        option.dataset.path = corpus.corpus_path;
        select.appendChild(option);
    });
    
    select.addEventListener('change', function() {
        const selectedOption = this.options[this.selectedIndex];
        if (selectedOption.value) {
            document.getElementById('corpusInfo').style.display = 'block';
            document.getElementById('corpusDetails').innerHTML = `
                <p><strong>ID корпуса:</strong> ${selectedOption.value}</p>
                <p><strong>Путь:</strong> ${selectedOption.dataset.path || 'N/A'}</p>
                <p><strong>Файлов:</strong> ${selectedOption.dataset.files || 0}</p>
            `;
        } else {
            document.getElementById('corpusInfo').style.display = 'none';
        }
        
        checkStartButton();
    });
}

// Выбор папки с данными для нового корпуса
function selectTrainingFolder() {
    document.getElementById('trainingDataInput').click();
}

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
        
        sizeStats.totalSize += file.size;
        if (file.size < sizeStats.minSize) sizeStats.minSize = file.size;
        if (file.size > sizeStats.maxSize) sizeStats.maxSize = file.size;
        
        const ext = file.name.split('.').pop().toLowerCase();
        extensions[ext] = (extensions[ext] || 0) + 1;
    });
    
    sizeStats.avgSize = sizeStats.totalSize / sizeStats.count;
    
    const formatBytes = (bytes) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };
    
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

document.getElementById('trainingDataInput').addEventListener('change', function(e) {
    const files = e.target.files;
    if (files.length === 0) return;
    
    document.getElementById('corpusSelect').value = '';
    document.getElementById('corpusInfo').style.display = 'none';
    
    document.getElementById('selectedTrainingFolder').textContent = 
        `📁 Новый корпус: ${files.length} файлов`;
    
    analyzeSelectedFiles(files);
    document.getElementById('trainingDataInput').dataset.isNewCorpus = 'true';
    
    checkStartButton();
});

function checkStartButton() {
    const modelSelected = document.getElementById('baseModelSelect').value !== '';
    const corpusSelected = document.getElementById('corpusSelect').value !== '';
    const newFilesSelected = document.getElementById('trainingDataInput').files.length > 0;
    
    document.getElementById('startBtn').disabled = !(modelSelected && (corpusSelected || newFilesSelected));
}

// Функция для проверки статуса задачи
async function checkJobStatus() {
    if (!currentJobId) return;

    try {
        const response = await apiFetch(`/api/jobs/${currentJobId}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const status = await response.json();
        
        if (status.status === 'processing') {
            const progress = status.progress || 0;
            updateProgress(progress, `Дообучение: ${progress.toFixed(1)}%`);
            
            if (status.details) {
                const details = `Файлов обработано: ${status.details.files_processed || 0}, Данных: ${formatFileSize(status.details.bytes_processed || 0)}`;
                showStatus(details, 'info');
            }
            
            // Сравнение времени выполнения
            if (fineTuningStartTime && baseTrainingTime) {
                const elapsedTime = (Date.now() - fineTuningStartTime) / 1000;
                const timeComparison = baseTrainingTime / elapsedTime;
                
                let comparisonText = `Время дообучения: ${elapsedTime.toFixed(1)}с, `;
                comparisonText += `Базовое обучение: ${baseTrainingTime.toFixed(1)}с, `;
                comparisonText += `Ускорение: ${timeComparison.toFixed(1)}x`;
                
                document.getElementById('timeComparison').textContent = comparisonText;
            }
        } else if (status.status === 'completed') {
            updateProgress(100, 'Дообучение завершено!');
            await getFineTuningResults(status.result_url);
        } else if (status.status === 'error') {
            throw new Error(status.error || 'Ошибка выполнения задачи');
        } else {
            throw new Error(`Неизвестный статус: ${status.status}`);
        }
    } catch (error) {
        console.error('Status check error:', error);
        showStatus('❌ Ошибка проверки статуса: ' + error.message, 'error');
        resetUI();
    }
}

// Функция для получения результатов дообучения
async function getFineTuningResults(resultUrl) {
    try {
        showStatus('📥 Получение результатов...', 'info');

        const response = await apiFetch("/api/result", {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "x-result-url": resultUrl
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const results = await response.json();
        
        trainingTime = stopTimer();
        
        // Сброс UI
        document.getElementById('loading').style.display = 'none';
        document.getElementById('startBtn').disabled = false;
        
        displayResults(results);
        showStatus('✅ Дообучение завершено успешно!', 'success');
        
        // Обновляем историю корпусов, если был создан новый
        if (results.corpus_id) {
            await loadCorpusHistory();
        }
        
        // Обновляем историю дообучения
        loadFineTuningHistory();
        
    } catch (error) {
        console.error('Error getting results:', error);
        showStatus('❌ Ошибка получения результатов: ' + error.message, 'error');
        resetUI();
    }
}

// Запуск процесса дообучения
async function startFineTuning() {
    resetTimer();
    const baseModelId = document.getElementById('baseModelSelect').value;
    const newModelName = document.getElementById('newModelName').value || `fine_tuned_${Date.now()}`;
    
    const existingCorpusId = document.getElementById('corpusSelect').value;
    const files = document.getElementById('trainingDataInput').files;
    
    if (!baseModelId) {
        showStatus('❌ Выберите базовую модель', 'error');
        return;
    }
    
    if (!existingCorpusId && files.length === 0) {
        showStatus('❌ Выберите существующий корпус или загрузите новые файлы', 'error');
        return;
    }
    
    try {
        document.getElementById('loading').style.display = 'block';
        document.getElementById('startBtn').disabled = true;
        showStatus('🚀 Запуск дообучения модели...', 'processing');
        
        fineTuningStartTime = Date.now();
        
        let response;
        
        if (existingCorpusId) {
            // Используем существующий корпус
            const encodedModelName = btoa(unescape(encodeURIComponent(newModelName)));
            
            response = await apiFetch('/api/fine-tuning/start', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Base-Model-ID': baseModelId,
                    'X-New-Model-Name': encodedModelName,
                    'X-Corpus-ID': existingCorpusId
                }
            });
        } else {
            // Загружаем новые файлы
            const formData = new FormData();
            Array.from(files).forEach(file => formData.append('files', file));
            formData.append('new_model_name', newModelName);
            
            response = await apiFetch('/api/fine-tuning/start', {
                method: 'POST',
                headers: {
                    'X-Base-Model-ID': baseModelId
                },
                body: formData
            });
        }
        
        startTimer();
        
        if (!response.ok) {
            if (response.status === 404) {
                const error = await response.text();
                throw new Error(error.includes('Base model') ? 'Базовая модель не найдена' : 
                               error.includes('Corpus') ? 'Корпус не найден' : 'Ресурс не найден');
            } else {
                throw new Error(`Ошибка сервера: ${response.status}`);
            }
        }
        
        const result = await response.json();
        currentJobId = result.job_id;
        
        showStatus(`✅ Дообучение запущено. Job ID: ${currentJobId}`, 'success');
        
        // Начинаем проверку статуса
        startStatusChecking();
        
    } catch (error) {
        console.error('Fine-tuning error:', error);
        showStatus('❌ Ошибка: ' + error.message, 'error');
        resetUI();
    }
}

function startStatusChecking() {
    if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
    }
    
    // Первая проверка через 2 секунды
    setTimeout(() => {
        checkJobStatus();
        statusCheckInterval = setInterval(checkJobStatus, 3000);
    }, 2000);
}

function resetUI() {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('startBtn').disabled = false;
    if (statusCheckInterval) {
        clearInterval(statusCheckInterval);
        statusCheckInterval = null;
    }
}

function updateProgress(progress, message) {
    document.getElementById('progressFill').style.width = progress + '%';
    document.getElementById('progressDetails').textContent = message || `Прогресс: ${progress}%`;
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function displayResults(results) {
    document.getElementById('results').style.display = 'block';
    
    // Общая статистика
    const summaryStats = document.getElementById('summaryStats');
    summaryStats.innerHTML = `
        <div class="stat-item">
            <div class="stat-value">${results.new_model_id || '✅'}</div>
            <div class="stat-label">Новая модель</div>
        </div>
        <div class="stat-item">
            <div class="stat-value">${results.files_processed || 0}</div>
            <div class="stat-label">Документов обработано</div>
        </div>
        <div class="stat-item">
            <div class="stat-value">${results.training_time ? results.training_time.toFixed(1) + ' с' : 'N/A'}</div>
            <div class="stat-label">Время дообучения</div>
        </div>
        <div class="stat-item">
            <div class="stat-value">${((results.performance_comparison?.fine_tuned_silhouette_score || 0) * 100).toFixed(1)}%</div>
            <div class="stat-label">Silhouette Score</div>
        </div>
        <div class="stat-item">
            <div class="stat-value">${results.clustering_result?.total_clusters || 0}</div>
            <div class="stat-label">Всего кластеров</div>
        </div>
        <div class="stat-item">
            <div class="stat-value ${results.clustering_result?.new_clusters > 0 ? 'positive' : ''}">
                +${results.clustering_result?.new_clusters || 0}
            </div>
            <div class="stat-label">Новых кластеров</div>
        </div>
    `;
    
    // Сравнение производительности
    if (results.performance_comparison) {
        const comp = results.performance_comparison;
        
        const silhouetteImproved = comp.fine_tuned_silhouette_score > comp.base_silhouette_score;
        const calinskiImproved = comp.fine_tuned_calinski_harabasz_score > comp.base_calinski_harabasz_score;
        const daviesImproved = comp.fine_tuned_davies_bouldin_score < comp.base_davies_bouldin_score;
        
        document.getElementById('performanceComparison').innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                <div style="padding: 15px; background: #f0f7ff; border-radius: 8px;">
                    <h4>Базовая модель</h4>
                    <p><strong>Silhouette:</strong> ${comp.base_silhouette_score.toFixed(3)}</p>
                    <p><strong>Calinski-Harabasz:</strong> ${comp.base_calinski_harabasz_score.toFixed(1)}</p>
                    <p><strong>Davies-Bouldin:</strong> ${comp.base_davies_bouldin_score.toFixed(3)}</p>
                    <p><strong>Время:</strong> ${comp.base_training_time.toFixed(1)}с</p>
                </div>
                <div style="padding: 15px; background: #e6ffe6; border-radius: 8px;">
                    <h4>Дообученная модель</h4>
                    <p><strong>Silhouette:</strong> ${comp.fine_tuned_silhouette_score.toFixed(3)} 
                       ${silhouetteImproved ? '↑' : '↓'} 
                       (${((comp.fine_tuned_silhouette_score - comp.base_silhouette_score) * 100).toFixed(1)}%)</p>
                    <p><strong>Calinski-Harabasz:</strong> ${comp.fine_tuned_calinski_harabasz_score.toFixed(1)} 
                       ${calinskiImproved ? '↑' : '↓'}
                       (${((comp.fine_tuned_calinski_harabasz_score - comp.base_calinski_harabasz_score) / comp.base_calinski_harabasz_score * 100).toFixed(1)}%)</p>
                    <p><strong>Davies-Bouldin:</strong> ${comp.fine_tuned_davies_bouldin_score.toFixed(3)} 
                       ${daviesImproved ? '↓' : '↑'}
                       (${((comp.fine_tuned_davies_bouldin_score - comp.base_davies_bouldin_score) / comp.base_davies_bouldin_score * 100).toFixed(1)}%)</p>
                    <p><strong>Время:</strong> ${comp.fine_tuning_time.toFixed(1)}с</p>
                    <p><strong>Ускорение:</strong> ${(comp.base_training_time / comp.fine_tuning_time).toFixed(1)}x</p>
                </div>
            </div>
        `;
    }
    
    // Отображение глобальных метрик
    if (results.clustering_result?.global_metrics) {
        const global = results.clustering_result.global_metrics;
        const globalMetricsHtml = `
            <div style="margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                <h4>Глобальные метрики кластеризации</h4>
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;">
                    <div>
                        <strong>Silhouette:</strong> ${global.avg_silhouette_score.toFixed(3)}
                    </div>
                    <div>
                        <strong>Intra-distance:</strong> ${global.avg_intra_cluster_distance.toFixed(3)}
                    </div>
                    <div>
                        <strong>Inter-distance:</strong> ${global.avg_inter_cluster_distance.toFixed(3)}
                    </div>
                    <div>
                        <strong>Плотность:</strong> ${(global.cluster_density * 100).toFixed(1)}%
                    </div>
                </div>
                <p style="margin-top: 10px; font-size: 0.9rem; color: #666;">
                    Intra-distance (чем меньше, тем лучше): компактность кластеров<br>
                    Inter-distance (чем больше, тем лучше): разделимость кластеров
                </p>
            </div>
        `;
        
        const performanceDiv = document.getElementById('performanceComparison');
        performanceDiv.insertAdjacentHTML('afterend', globalMetricsHtml);
    }
    
    if (results.clustering_result) {
        displayClusteringResults(results.clustering_result);
    }
}

function displayClusteringResults(clusterData) {
    const oldSection = document.getElementById('clustering-results-section');
    if (oldSection) oldSection.remove();
    
    const clusteringSection = document.createElement('div');
    clusteringSection.id = 'clustering-results-section';
    clusteringSection.className = 'section';
    
    let clustersHtml = '';
    
    if (clusterData.cluster_changes?.new_clusters_details?.length > 0) {
        clustersHtml += `
            <div class="cluster-category">
                <h4 style="color: #28a745;">🆕 Новые кластеры (${clusterData.new_clusters})</h4>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 15px;">
                ${clusterData.cluster_changes.new_clusters_details.map(cluster => `
                    <div class="cluster-card new" style="border-left: 4px solid #28a745; padding: 10px; margin-bottom: 10px; background: #f9fff9;">
                        <h5 style="margin: 0 0 10px 0;">${cluster.cluster_id}</h5>
                        <p><strong>Размер:</strong> ${cluster.size} документов</p>
                        <p><strong>Темы:</strong> ${cluster.main_topics.join(', ')}</p>
                        <p><strong>Когезия:</strong> ${(cluster.cohesion_score * 100).toFixed(1)}%</p>
                        <p><strong>Silhouette:</strong> ${cluster.silhouette_score.toFixed(3)}</p>
                        <p><strong>Расст. до центра:</strong> ${cluster.avg_distance_to_centroid.toFixed(3)}</p>
                    </div>
                `).join('')}
                </div>
            </div>
        `;
    }
    
    if (clusterData.cluster_changes?.modified_clusters_details?.length > 0) {
        clustersHtml += `
            <div class="cluster-category">
                <h4 style="color: #ffc107;">🔄 Измененные кластеры (${clusterData.modified_clusters})</h4>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 15px;">
                ${clusterData.cluster_changes.modified_clusters_details.map(cluster => {
                    const sizeChangeClass = cluster.size_change.startsWith('+') ? 'positive' : 'negative';
                    return `
                    <div class="cluster-card modified" style="border-left: 4px solid #ffc107; padding: 10px; margin-bottom: 10px; background: #fff9e6;">
                        <h5 style="margin: 0 0 10px 0;">${cluster.cluster_id}</h5>
                        <p><strong>Размер:</strong> ${cluster.old_size} → ${cluster.new_size} 
                           <span class="${sizeChangeClass}">${cluster.size_change}</span>
                        </p>
                        <p><strong>Новые темы:</strong> ${cluster.new_topics.join(', ') || 'нет'}</p>
                        <p><strong>Удаленные темы:</strong> ${cluster.removed_topics.join(', ') || 'нет'}</p>
                        <p><strong>Silhouette:</strong> ${cluster.old_silhouette_score.toFixed(3)} → ${cluster.new_silhouette_score.toFixed(3)} 
                           <span class="positive">+${(cluster.silhouette_improvement * 100).toFixed(1)}%</span>
                        </p>
                    </div>
                `}).join('')}
                </div>
            </div>
        `;
    }
    
    if (clusterData.cluster_changes?.unchanged_clusters?.length > 0) {
        const unchangedToShow = clusterData.cluster_changes.unchanged_clusters.slice(0, 4);
        const hiddenCount = clusterData.cluster_changes.unchanged_clusters.length - 4;
        
        clustersHtml += `
            <div class="cluster-category">
                <h4 style="color: #6c757d;">✅ Неизмененные кластеры (${clusterData.unchanged_clusters})</h4>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 15px;">
                ${unchangedToShow.map(cluster => `
                    <div class="cluster-card unchanged" style="border-left: 4px solid #6c757d; padding: 10px; margin-bottom: 10px; background: #f8f9fa;">
                        <h5 style="margin: 0 0 10px 0;">${cluster.cluster_id}</h5>
                        <p><strong>Размер:</strong> ${cluster.size} документов</p>
                        <p><strong>Темы:</strong> ${cluster.main_topics.join(', ')}</p>
                        <p><strong>Когезия:</strong> ${(cluster.cohesion_score * 100).toFixed(1)}%</p>
                        <p><strong>Silhouette:</strong> ${cluster.silhouette_score.toFixed(3)}</p>
                    </div>
                `).join('')}
                </div>
                ${hiddenCount > 0 ? `
                    <details style="margin-top: 10px;">
                        <summary>Показать еще ${hiddenCount} кластеров</summary>
                        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 15px; margin-top: 10px;">
                        ${clusterData.cluster_changes.unchanged_clusters.slice(4).map(cluster => `
                            <div class="cluster-card unchanged" style="border-left: 4px solid #6c757d; padding: 10px; margin-bottom: 10px; background: #f8f9fa;">
                                <h5 style="margin: 0 0 10px 0;">${cluster.cluster_id}</h5>
                                <p><strong>Размер:</strong> ${cluster.size} документов</p>
                                <p><strong>Темы:</strong> ${cluster.main_topics.join(', ')}</p>
                                <p><strong>Когезия:</strong> ${(cluster.cohesion_score * 100).toFixed(1)}%</p>
                                <p><strong>Silhouette:</strong> ${cluster.silhouette_score.toFixed(3)}</p>
                            </div>
                        `).join('')}
                        </div>
                    </details>
                ` : ''}
            </div>
        `;
    }
    
    if (clusterData.summary) {
        const summary = clusterData.summary;
        clustersHtml += `
            <div class="cluster-summary" style="margin-top: 30px; padding: 20px; background: #e9ecef; border-radius: 8px;">
                <h4>📊 Сводная статистика кластеризации</h4>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; text-align: center;">
                    <div style="padding: 10px; background: white; border-radius: 8px;">
                        <div style="font-size: 24px; font-weight: bold; color: #28a745;">${summary.documents_in_new_clusters}</div>
                        <div>В новых кластерах</div>
                    </div>
                    <div style="padding: 10px; background: white; border-radius: 8px;">
                        <div style="font-size: 24px; font-weight: bold; color: #ffc107;">${summary.documents_in_modified_clusters}</div>
                        <div>В измененных кластерах</div>
                    </div>
                    <div style="padding: 10px; background: white; border-radius: 8px;">
                        <div style="font-size: 24px; font-weight: bold; color: #6c757d;">${summary.documents_in_unchanged_clusters}</div>
                        <div>В неизмененных кластерах</div>
                    </div>
                </div>
            </div>
        `;
    }
    
    clusteringSection.innerHTML = `
        <h3>📊 Результаты кластеризации после дообучения</h3>
        <div class="clustering-results">
            <div class="cluster-overview" style="display: flex; gap: 20px; margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                <div><strong>Всего кластеров:</strong> ${clusterData.total_clusters || 'N/A'}</div>
                <div><strong>Новых:</strong> <span style="color: #28a745;">${clusterData.new_clusters || 'N/A'}</span></div>
                <div><strong>Измененных:</strong> <span style="color: #ffc107;">${clusterData.modified_clusters || 'N/A'}</span></div>
                <div><strong>Неизмененных:</strong> <span style="color: #6c757d;">${clusterData.unchanged_clusters || 'N/A'}</span></div>
            </div>
            ${clustersHtml}
        </div>
    `;
    
    document.getElementById('results').appendChild(clusteringSection);
}

// Загрузка истории выполненных заданий дообучения
async function loadFineTuningHistory() {
    
    // try {
    //     const response = await apiFetch('/api/fine-tuning/history');

    //     if (response.ok) {
    //         const history = await response.json();
    //         displayFineTuningHistory(history);
    //     }
    // } catch (error) {
    //     console.error('Error loading fine-tuning history:', error);
    // }
}

function displayFineTuningHistory(history) {
    const container = document.getElementById('fineTuningHistory');
    if (!history || history.length === 0) {
        container.innerHTML = '<p>📝 Нет истории дообучения</p>';
        return;
    }

    container.innerHTML = history.map(job => `
        <div class="job-item" style="border: 1px solid #ddd; padding: 15px; margin-bottom: 10px; border-radius: 8px;">
            <div class="job-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <strong>🔧 ${job.job_id?.substring(0, 8)}...</strong>
                <span class="job-status status-${job.status}" style="padding: 3px 8px; border-radius: 4px; font-size: 0.9rem;">
                    ${getStatusIcon(job.status)} ${job.status}
                </span>
            </div>
            <div class="job-details" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;">
                <p><strong>Базовая модель:</strong> ${job.base_model_id || 'N/A'}</p>
                <p><strong>Новая модель:</strong> ${job.new_model_id || 'N/A'}</p>
                <p><strong>Корпус:</strong> ${job.corpus_id || 'N/A'}</p>
                <p><strong>Создано:</strong> ${new Date(job.created_at).toLocaleString()}</p>
                <p><strong>Время:</strong> ${job.training_time ? job.training_time.toFixed(1) + 'с' : 'N/A'}</p>
                <p><strong>Silhouette:</strong> ${job.fine_tuned_silhouette_score ? job.fine_tuned_silhouette_score.toFixed(3) : 'N/A'}</p>
            </div>
        </div>
    `).join('');
}

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

document.addEventListener('DOMContentLoaded', () => {
    loadModels();
    loadCorpusHistory();
    loadFineTuningHistory();
    
    const style = document.createElement('style');
    style.textContent = `
        .positive { color: #28a745; font-weight: bold; }
        .negative { color: #dc3545; font-weight: bold; }
        .cluster-card { transition: transform 0.2s; }
        .cluster-card:hover { transform: translateY(-2px); box-shadow: 0 4px 8px rgba(0,0,0,0.1); }
        .job-status { text-transform: capitalize; }
        .status-processing { background: #fff3cd; color: #856404; }
        .status-completed { background: #d4edda; color: #155724; }
        .status-error { background: #f8d7da; color: #721c24; }
        .file-ext { background: #e9ecef; padding: 2px 6px; border-radius: 4px; margin: 0 2px; }
        .selected-folder { margin-left: 10px; font-weight: bold; color: #28a745; }
    `;
    document.head.appendChild(style);
});