let classificationHistory = [];

// Загрузка истории заданий классификации
async function loadClassificationHistory(type = 'all') {
    try {
        showStatus('🔄 Загрузка истории классификации...', 'processing');
        
        const response = await fetch('/api/classification/history');
        
        if (!response.ok) {
            throw new Error('Ошибка загрузки истории');
        }
        
        const data = await response.json();
        classificationHistory = Array.isArray(data) ? data : [];
        
        displayClassificationHistory(type);
        showStatus('✅ История загружена', 'success');
        
    } catch (error) {
        console.error('Error loading classification history:', error);
        showStatus('❌ Ошибка загрузки истории: ' + error.message, 'error');
        classificationHistory = [];
        displayClassificationHistory(type);
    }
}

function displayClassificationHistory(type) {
    const container = document.getElementById('classificationHistory');
    
    const filteredHistory = type === 'all' 
        ? classificationHistory 
        : classificationHistory.filter(job => job.type === type || job.type === `${type}_classification`);
    
    if (filteredHistory.length === 0) {
        container.innerHTML = '<p>📝 Нет истории заданий классификации</p>';
        return;
    }

    container.innerHTML = filteredHistory.map(job => `
        <div class="job-item">
            <div class="job-header">
                <strong>${job.type.includes('grnti') ? '🏷️' : '📊'} ${job.job_id?.substring(0, 8)}...</strong>
                <span class="job-status ${job.status}">${getStatusIcon(job.status)} ${job.status}</span>
            </div>
            <div class="job-details">
                <p><strong>Тип:</strong> ${job.type.includes('grnti') ? 'ГРНТИ' : 'Кластерная'}</p>
                <p><strong>Модель:</strong> ${job.model_id || 'N/A'}</p>
                <p><strong>Создано:</strong> ${new Date(job.created_at).toLocaleString()}</p>
                ${job.corpus_path ? `<p><strong>Корпус:</strong> ${job.corpus_path}</p>` : ''}
            </div>
            <button class="btn btn-small btn-primary" onclick="useClassificationJob('${job.job_id}', '${job.type.includes('grnti') ? 'grnti' : 'cluster'}')">
                ✅ Использовать для оценки
            </button>
        </div>
    `).join('');
}

function useClassificationJob(jobId, jobType) {
    document.getElementById('classificationJobId').value = jobId;
    document.getElementById('evaluationType').value = jobType;
    showStatus(`✅ Выбрано задание: ${jobId}`, 'success');
}

// Запуск оценки точности
async function evaluatePrecision() {
    const jobId = document.getElementById('classificationJobId').value;
    const evalType = document.getElementById('evaluationType').value;
    const threshold = parseFloat(document.getElementById('precisionThreshold').value);
    
    if (!jobId || !evalType) {
        showStatus('❌ Заполните все обязательные поля', 'error');
        return;
    }
    
    try {
        document.getElementById('evaluateBtn').disabled = true;
        showStatus('🧮 Вычисление точности...', 'processing');
        
        const response = await fetch('/api/evaluation/precision', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-classification-job-id': jobId,
                'x-evaluation-type': evalType
            }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Ошибка сервера');
        }
        
        const results = await response.json();
        displayResults(results);
        showStatus('✅ Оценка точности завершена!', 'success');
        
    } catch (error) {
        console.error('Evaluation error:', error);
        showStatus('❌ Ошибка оценки: ' + error.message, 'error');
    } finally {
        document.getElementById('evaluateBtn').disabled = false;
    }
}

// Отображение результатов
function displayResults(results) {
    // Обновляем summary cards
    document.getElementById('precisionValue').textContent = results.metrics.precision.toFixed(4);
    document.getElementById('totalFiles').textContent = results.metrics.total_files;
    document.getElementById('matchesFound').textContent = results.summary.files_with_matches;
    document.getElementById('matchesPercent').textContent = 
        Math.round((results.summary.files_with_matches / results.metrics.total_files) * 100) + '%';
    document.getElementById('thresholdValue').textContent = results.threshold;
    
    // Обновляем детальную статистику
    document.getElementById('totalTp').textContent = results.metrics.total_tp;
    document.getElementById('totalFp').textContent = results.metrics.total_fp;
    document.getElementById('totalFn').textContent = results.metrics.total_fn;
    
    // Обновляем статус требования
    const precisionCard = document.getElementById('precisionCard');
    const precisionStatus = document.getElementById('precisionStatus');
    const requirementMet = document.getElementById('requirementMet');
    
    if (results.threshold_met) {
        precisionCard.classList.add('success');
        precisionCard.classList.remove('warning', 'error');
        precisionStatus.textContent = 'Требование выполнено ✅';
        requirementMet.textContent = 'Выполнено ✅';
        requirementMet.className = 'status-success';
    } else {
        precisionCard.classList.add('error');
        precisionCard.classList.remove('success', 'warning');
        precisionStatus.textContent = 'Требование не выполнено ❌';
        requirementMet.textContent = 'Не выполнено ❌';
        requirementMet.className = 'status-error';
    }
    
    // Заполняем таблицу результатов
    const tbody = document.getElementById('resultsBody');
    tbody.innerHTML = '';
    
    results.file_level_metrics.forEach(metric => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${metric.file}</td>
            <td>${metric.expert_label}</td>
            <td>${metric.match_found ? '✅' : '❌'}</td>
            <td>${metric.tp}</td>
            <td>${metric.fp}</td>
            <td>${metric.fn}</td>
            <td>${metric.precision.toFixed(4)}</td>
            <td><span class="status-badge ${metric.match_found ? 'status-success' : 'status-error'}">
                ${metric.match_found ? 'Совпадение' : 'Нет совпадения'}
            </span></td>
        `;
        tbody.appendChild(row);
    });
    
    // Показываем результаты
    document.getElementById('results').style.display = 'block';
}

// Вспомогательные функции
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

function downloadReport() {
    alert('Функция скачивания отчета будет реализована');
}

function visualizeResults() {
    alert('Функция визуализации будет реализована');
}

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    loadClassificationHistory('all');
});