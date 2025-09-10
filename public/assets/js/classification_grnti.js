let currentJobId = null;
let checkInterval = null;
let availableModels = [];
let jobHistory = [];
let grntiCodesData = {}; // Словарь с расшифровками кодов ГРНТИ
let expertOpinions = {}; // Мнения экспертов
let currentResults = null;

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
    // const ttlHours = document.getElementById('ttlHours').value;
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
                'x-ttl-hours': 0
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

    currentResults = results; // Сохраняем результаты

    // Общая статистика
    const summary = results.classification_results.summary;
    document.getElementById('summaryStats').innerHTML = `
        <div class="stat-item">
            <div class="stat-value">${(summary.agreement_with_expert * 100).toFixed(1)}%</div>
            <div class="stat-label">Совпадение с экспертом</div>
        </div>
        <div class="stat-item">
            <div class="stat-value">${(summary.accuracy_top_3 * 100).toFixed(1)}%</div>
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
        
        const row = document.createElement('tr');
        row.className = rowClass;
        row.dataset.file = file.file;
        
        row.innerHTML = `
            <td>${file.file}</td>
            <td></td> <!-- Экспертная оценка -->
            <td></td> <!-- Предсказание системы -->
            <td>
                <input type="number" class="expert-input" 
                       value="${(file.similarity * 100).toFixed(1)}" 
                       min="0" max="100" step="1" 
                       onchange="saveExpertPercentage('${file.file}', this.value)">
                %
            </td>
            <td></td> <!-- Топ-5 предсказаний -->
            <td>${isCorrect ? '✅' : '❌'}</td>
            <td>
                <button class="btn btn-small" onclick="showFileDetails('${file.file}')">
                    📋 Детали
                </button>
            </td>
        `;
        
        // Экспертная оценка (редактируемая)
        const expertCell = row.cells[1];
        const expertContent = createGrntiCell(
            file.expert_grnti_code, 
            file.expert_grnti_name, 
            true,
            'expert'
        );
        expertCell.appendChild(expertContent);
        
        // Предсказание системы (только просмотр)
        const systemCell = row.cells[2];
        const systemContent = createGrntiCell(
            file.predicted_grnti_code, 
            file.predicted_grnti_name, 
            false,
            'system'
        );
        systemCell.appendChild(systemContent);
        
        // Топ-5 предсказаний
        const top5Cell = row.cells[4];
        const top5Content = createTop5PredictionsCell(file.top_5_predictions);
        top5Cell.appendChild(top5Content);
        
        tbody.appendChild(row);
    });

    document.getElementById('results').style.display = 'block';
}

function showFileDetails(fileName) {
    const fileData = currentResults.files.find(f => f.file === fileName);
    if (!fileData) return;

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 800px;">
            <span class="close" onclick="this.parentElement.parentElement.style.display='none'">&times;</span>
            <h3>📄 Детали файла: ${fileName}</h3>
            
            <div class="file-details-grid">
                <div class="detail-item">
                    <h4>Экспертная оценка</h4>
                    ${createGrntiCell(fileData.expert_grnti_code, fileData.expert_grnti_name, false, 'expert').outerHTML}
                </div>
                
                <div class="detail-item">
                    <h4>Предсказание системы</h4>
                    ${createGrntiCell(fileData.predicted_grnti_code, fileData.predicted_grnti_name, false, 'system').outerHTML}
                    <p><strong>Сходство:</strong> ${(fileData.similarity * 100).toFixed(1)}%</p>
                </div>
            </div>
            
            <h4>Топ-5 предсказаний системы:</h4>
            <div class="predictions-list">
                ${fileData.top_5_predictions.map((pred, index) => `
                    <div class="prediction-item">
                        <span class="prediction-rank">${index + 1}.</span>
                        ${createGrntiCell(pred[0], '', false, 'system').outerHTML}
                        <span class="prediction-confidence">${(pred[1] * 100).toFixed(1)}%</span>
                    </div>
                `).join('')}
            </div>
            
            ${currentResults.grnti_branch ? `
                <div class="branch-info">
                    <h4>Область знаний:</h4>
                    <p>${currentResults.grnti_branch}</p>
                </div>
            ` : ''}
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Обработчик закрытия по клику вне модального окна
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
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


async function loadGrntiCodes() {
    try {
        const response = await fetch('/api/grnti-codes');
        if (response.ok) {
            const data = await response.json();
            window.grntiCodesData = data; // Делаем глобально доступным
            showStatus('✅ Расшифровка кодов ГРНТИ загружена', 'success');
        } else {
            showStatus('⚠️ Не удалось загрузить расшифровку кодов ГРНТИ', 'warning');
        }
    } catch (error) {
        console.error('Error loading GRNTI codes:', error);
        showStatus('❌ Ошибка загрузки расшифровки кодов ГРНТИ', 'error');
    }
}

// Показ модального окна с информацией о коде ГРНТИ
function showGrntiInfo(code, source = 'system') {
    const modal = document.getElementById('grntiModal');
    const codeInfo = window.grntiCodesData?.[code] || {
        name: 'Информация не найдена',
        description: 'Описание отсутствует в базе данных ГРНТИ',
        branch: 'Неизвестная область'
    };

    // Очищаем предыдущую информацию об источнике
    const grntiCodeInfo = document.getElementById('grntiCodeInfo');
    
    // Сохраняем основную структуру, но удаляем старые элементы источника
    grntiCodeInfo.innerHTML = `
        <p><strong>Код:</strong> <span id="modalCode">${code}</span></p>
        <p><strong>Название:</strong> <span id="modalName">${codeInfo.name}</span></p>
        <p><strong>Описание:</strong> <span id="modalDescription">${codeInfo.description}</span></p>
        <p><strong>Область знаний:</strong> <span id="modalBranch">${codeInfo.branch || 'Общая рубрика'}</span></p>
    `;
    
    // Добавляем информацию о источнике (только один раз)
    const sourceInfo = document.createElement('p');
    sourceInfo.innerHTML = `<strong>Источник:</strong> ${source === 'system' ? 'Предсказание системы' : 'Экспертная оценка'}`;
    grntiCodeInfo.appendChild(sourceInfo);
    
    modal.style.display = 'block';
}

// Закрытие модального окна
function closeGrntiModal() {
    document.getElementById('grntiModal').style.display = 'none';
}

// Функция для создания ячейки с кодом ГРНТИ и иконкой информации
function createGrntiCell(code, name, isEditable = false, source = 'system') {
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.justifyContent = 'space-between';
    
    const textSpan = document.createElement('span');
    textSpan.textContent = `${code} - ${name}`;
    
    const infoIcon = document.createElement('span');
    infoIcon.textContent = 'ℹ️';
    infoIcon.className = 'info-icon';
    infoIcon.title = 'Показать расшифровку ГРНТИ';
    infoIcon.onclick = (e) => {
        e.stopPropagation();
        showGrntiInfo(code, source);
    };
    
    container.appendChild(textSpan);
    container.appendChild(infoIcon);
    
    if (isEditable) {
        container.className = 'editable-cell';
        container.onclick = (e) => {
            if (e.target !== infoIcon) {
                editGrntiCell(container, code, name, source);
            }
        };
    }
    
    return container;
}

function createTop5PredictionsCell(predictions) {
    const container = document.createElement('div');
    
    predictions.forEach((pred, index) => {
        const [code, confidence] = pred;
        const predictionItem = document.createElement('div');
        predictionItem.style.display = 'flex';
        predictionItem.style.justifyContent = 'space-between';
        predictionItem.style.alignItems = 'center';
        predictionItem.style.marginBottom = '4px';
        
        const codeSpan = document.createElement('span');
        codeSpan.textContent = `${code}`;
        
        const confidenceSpan = document.createElement('span');
        confidenceSpan.textContent = `${(confidence * 100).toFixed(1)}%`;
        confidenceSpan.style.marginLeft = '10px';
        
        const infoIcon = document.createElement('span');
        infoIcon.textContent = 'ℹ️';
        infoIcon.className = 'info-icon';
        infoIcon.title = 'Показать расшифровку ГРНТИ';
        infoIcon.onclick = (e) => {
            e.stopPropagation();
            showGrntiInfo(code, 'system');
        };
        
        predictionItem.appendChild(codeSpan);
        predictionItem.appendChild(confidenceSpan);
        predictionItem.appendChild(infoIcon);
        
        container.appendChild(predictionItem);
    });
    
    return container;
}

// Редактирование ячейки с кодом ГРНТИ
function editGrntiCell(cellElement, currentCode, currentName) {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = `${currentCode} - ${currentName}`;
    input.className = 'editable-input';
    
    // Сохраняем оригинальное содержимое
    const originalContent = cellElement.innerHTML;
    
    // Заменяем содержимое на input
    cellElement.innerHTML = '';
    cellElement.appendChild(input);
    input.focus();
    
    // Обработка сохранения
    const saveEdit = () => {
        const newValue = input.value.trim();
        if (newValue) {
            // Разбираем введенное значение (ожидаем формат "код - название")
            const parts = newValue.split(' - ');
            const newCode = parts[0];
            const newName = parts.slice(1).join(' - ');
            
            // Обновляем содержимое ячейки
            cellElement.innerHTML = '';
            const newContent = createGrntiCell(newCode, newName, true);
            cellElement.appendChild(newContent);
            
            // Сохраняем изменение эксперта
            saveExpertOpinion(cellElement.closest('tr').dataset.file, newCode, newName);
        } else {
            // Восстанавливаем оригинальное содержимое
            cellElement.innerHTML = originalContent;
        }
    };
    
    // Обработка нажатия Enter
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            saveEdit();
        }
    });
    
    // Обработка потери фокуса
    input.addEventListener('blur', saveEdit);
}

// Функция для создания input для экспертной оценки
function createExpertInput(fileName, currentValue) {
    const container = document.createElement('div');
    
    const input = document.createElement('input');
    input.type = 'number';
    input.min = 0;
    input.max = 100;
    input.step = 1;
    input.value = currentValue || '';
    input.className = 'expert-input';
    input.placeholder = '0-100%';
    
    input.addEventListener('change', (e) => {
        const value = parseInt(e.target.value);
        if (value >= 0 && value <= 100) {
            saveExpertPercentage(fileName, value);
        } else {
            e.target.value = '';
        }
    });
    
    container.appendChild(input);
    return container;
}

// Сохранение мнения эксперта о коде ГРНТИ
function saveExpertOpinion(fileName, code, name) {
    if (!expertOpinions[fileName]) {
        expertOpinions[fileName] = {};
    }
    expertOpinions[fileName].expert_code = code;
    expertOpinions[fileName].expert_name = name;
    
    console.log('Expert opinion saved:', fileName, code, name);
}

// Сохранение процентного соответствия от эксперта
function saveExpertPercentage(fileName, percentage) {
    if (!expertOpinions[fileName]) {
        expertOpinions[fileName] = {};
    }
    expertOpinions[fileName].expert_percentage = percentage;
    
    console.log('Expert percentage saved:', fileName, percentage);
}

async function saveAllExpertOpinions() {
    try {
        const response = await fetch('/api/save-expert-opinions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                job_id: currentJobId,
                expert_opinions: expertOpinions,
                original_results: currentResults
            })
        });
        
        if (response.ok) {
            showStatus('✅ Мнения эксперта сохранены', 'success');
        } else {
            throw new Error('Failed to save expert opinions');
        }
    } catch (error) {
        console.error('Error saving expert opinions:', error);
        showStatus('❌ Ошибка сохранения мнений эксперта', 'error');
    }
}

// Добавим кнопку для сохранения в раздел actions
document.querySelector('.actions').innerHTML += `
    <button class="btn btn-success" onclick="saveAllExpertOpinions()">
        💾 Сохранить мнения эксперта
    </button>
`;



window.addEventListener('click', (e) => {
    const modal = document.getElementById('grntiModal');
    if (e.target === modal) {
        closeGrntiModal();
    }
});

// Обновляем инициализацию для загрузки кодов ГРНТИ
document.addEventListener('DOMContentLoaded', () => {
    loadModels();
    loadClusteringHistory();
    loadJobHistory('all');
    loadGrntiCodes();
});