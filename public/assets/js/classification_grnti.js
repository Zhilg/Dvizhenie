let currentJobId = null;
let checkInterval = null;
let availableModels = [];
let jobHistory = [];

// Загрузка моделей
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
    const select = document.getElementById('modelSelect');
    select.innerHTML = '<option value="">Выберите модель...</option>';
    
    availableModels.forEach(model => {
        const option = document.createElement('option');
        option.value = model.model_id;
        option.textContent = model.model_name || model.model_id;
        option.dataset.dimension = model.dimension;
        select.appendChild(option);
    });
}

// Загрузка истории кластеризации
async function loadClusteringHistory() {
    try {
        showStatus('🔄 Загрузка истории кластеризации...', 'processing');
        const response = await fetch('/api/clusterization/history');
        
        if (!response.ok) throw new Error('Ошибка загрузки истории');
        
        const history = await response.json();
        displayClusteringHistory(history);
        showStatus('✅ История загружена', 'success');
        
    } catch (error) {
        console.error('Error loading clustering history:', error);
        showStatus('❌ Ошибка загрузки истории: ' + error.message, 'error');
    }
}

function displayClusteringHistory(history) {
    const container = document.getElementById('clusteringHistory');
    if (!history || history.length === 0) {
        container.innerHTML = '<p>📝 Нет истории кластеризации</p>';
        return;
    }

    container.innerHTML = history.map(job => `
        <div class="job-item">
            <div class="job-header">
                <strong>📊 ${job.job_id?.substring(0, 8)}...</strong>
                <span class="job-status ${job.status}">${getStatusIcon(job.status)} ${job.status}</span>
            </div>
            <div class="job-details">
                <p><strong>Модель:</strong> ${job.model_id || 'N/A'}</p>
                <p><strong>Создано:</strong> ${new Date(job.created_at).toLocaleString()}</p>
                ${job.corpus_path ? `<p><strong>Корпус:</strong> ${job.corpus_path}</p>` : ''}
            </div>
            <button class="btn btn-small" onclick="useClusteringJob('${job.job_id}', '${job.model_id}')">
                ✅ Использовать
            </button>
        </div>
    `).join('');
}

function useClusteringJob(jobId, modelId) {
    document.getElementById('clusteringJobId').value = jobId;
    if (modelId) {
        document.getElementById('modelSelect').value = modelId;
    }
    showStatus(`✅ Выбрана кластеризация: ${jobId}`, 'success');
}

// Основная функция классификации
async function startGrntiClassification() {
    const modelId = document.getElementById('modelSelect').value;
    const clusteringJobId = document.getElementById('clusteringJobId').value;
    const ttlHours = document.getElementById('ttlHours').value;
    const files = document.getElementById('fileInput').files;

    if (!modelId || !clusteringJobId || files.length === 0) {
        showStatus('❌ Заполните все обязательные поля', 'error');
        return;
    }

    try {
        document.getElementById('loading').style.display = 'block';
        document.getElementById('startBtn').disabled = true;
        showStatus('🚀 Запуск классификации по ГРНТИ...', 'processing');

        const formData = new FormData();
        Array.from(files).forEach(file => formData.append('files', file));

        const response = await fetch('/api/classification/grnti', {
            method: 'POST',
            headers: {
                'x-model-id': modelId,
                'x-clustering-job-id': clusteringJobId,
                'x-ttl-hours': ttlHours
            },
            body: formData
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(error || 'Ошибка сервера');
        }

        const result = await response.json();
        currentJobId = result.job_id;
        
        showStatus(`✅ Классификация запущена. Job ID: ${currentJobId}`, 'success');
        startStatusChecking();
        
    } catch (error) {
        console.error('Classification error:', error);
        showStatus('❌ Ошибка: ' + error.message, 'error');
    } finally {
        document.getElementById('startBtn').disabled = false;
    }
}

// Проверка статуса
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
                showStatus('❌ Ошибка обработки', 'error');
            }
        } catch (error) {
            console.error('Status check error:', error);
        }
    }, 2000);
}

function updateProgress(status) {
    const progress = status.progress || 0;
    document.getElementById('progressFill').style.width = progress + '%';
    
    let details = `Прогресс: ${progress}%`;
    if (status.details) {
        details += ` | Файлов: ${status.details.files_processed || 0}`;
        details += ` | Данных: ${formatBytes(status.details.bytes_processed || 0)}`;
    }
    document.getElementById('progressDetails').textContent = details;
}

// Получение и отображение результатов
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
        showStatus('Классификация завершена успешно!', 'success');
        
    } catch (error) {
        console.error('Error fetching results:', error);
        showStatus('Ошибка получения результатов: ' + error.message, 'error');
    } finally {
        document.getElementById('loading').style.display = 'none';
    }
}

function displayResults(results) {
    if (!results.classification_results) {
        showStatus('❌ Нет данных результатов', 'error');
        return;
    }

    // Общая статистика
    const summary = results.classification_results.summary;
    document.getElementById('summaryStats').innerHTML = `
        <div class="stat-item">
            <div class="stat-value">${summary.agreement_with_expert * 100}%</div>
            <div class="stat-label">Совпадение с экспертом</div>
        </div>
        <div class="stat-item">
            <div class="stat-value">${summary.accuracy_top_3 * 100}%</div>
            <div class="stat-label">Точность (топ-3)</div>
        </div>
        <div class="stat-item">
            <div class="stat-value">${summary.total_files}</div>
            <div class="stat-label">Всего файлов</div>
        </div>
    `;

    // Детальные результаты
    const tbody = document.getElementById('resultsBody');
    tbody.innerHTML = '';
    
    results.files.forEach(file => {
        const isCorrect = file.expert_grnti_code === file.predicted_grnti_code;
        const rowClass = isCorrect ? 'correct' : 'incorrect';
        
        const top5Html = file.top_5_predictions.map(pred => 
            `<div>${pred[0]} (${(pred[1] * 100).toFixed(1)}%)</div>`
        ).join('');
        
        tbody.innerHTML += `
            <tr class="${rowClass}">
                <td>${file.file}</td>
                <td>${file.expert_grnti_code} - ${file.expert_grnti_name}</td>
                <td>${file.predicted_grnti_code} - ${file.predicted_grnti_name}</td>
                <td>${(file.similarity * 100).toFixed(1)}%</td>
                <td>${top5Html}</td>
                <td>${isCorrect ? '✅' : '❌'}</td>
            </tr>
        `;
    });

    document.getElementById('results').style.display = 'block';
}

// Вспомогательные функции
function selectFolder() {
    document.getElementById('fileInput').click();
}

document.getElementById('fileInput').addEventListener('change', function(e) {
    const files = e.target.files;
    document.getElementById('selectedFolder').textContent = 
        `📁 Выбрано файлов: ${files.length}`;
    document.getElementById('startBtn').disabled = files.length === 0;
});

function showStatus(message, type) {
    const container = document.getElementById('status');
    container.innerHTML = `<div class="status status-${type}">${message}</div>`;
}

function getStatusIcon(status) {
    const icons = {
        'processing': '🔄',
        'completed': '✅',
        'error': '❌'
    };
    return icons[status] || '📋';
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Загрузка истории заданий
async function loadJobHistory(type = 'all') {
    try {
        const url = type === 'all' ? '/api/jobs/history' : `/api/jobs/history?type=${type}`;
        const response = await fetch(url);
        
        if (response.ok) {
            jobHistory = await response.json();
            displayJobHistory();
        }
    } catch (error) {
        console.error('Error loading job history:', error);
    }
}

function displayJobHistory() {
    const container = document.getElementById('jobHistory');
    if (!jobHistory.length) {
        container.innerHTML = '<p>📝 Нет истории заданий</p>';
        return;
    }

    container.innerHTML = jobHistory.map(job => `
        <div class="job-item">
            <div class="job-header">
                <strong>${job.type === 'grnti_classification' ? '🏷️' : '📊'} ${job.job_id?.substring(0, 8)}...</strong>
                <span class="job-status ${job.status}">${getStatusIcon(job.status)} ${job.status}</span>
            </div>
            <div class="job-details">
                <p><strong>Тип:</strong> ${job.type}</p>
                <p><strong>Модель:</strong> ${job.model_id || 'N/A'}</p>
                <p><strong>Создано:</strong> ${new Date(job.created_at).toLocaleString()}</p>
            </div>
        </div>
    `).join('');
}

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    loadModels();
    loadClusteringHistory();
    loadJobHistory('all');
});