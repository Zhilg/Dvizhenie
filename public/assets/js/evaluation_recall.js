// Глобальная переменная для хранения истории заданий классификации
let classificationHistory = [];

// Загрузка истории выполненных заданий классификации с сервера
async function loadClassificationHistory(type = 'all') {
    try {
        showStatus('🔄 Загрузка истории классификации...', 'processing');

        const response = await apiFetch('/api/classification/history');

        if (!response.ok) {
            throw new Error('Ошибка загрузки истории');
        }

        const data = await response.json();
        classificationHistory = Array.isArray(data) ? data : []; // Убеждаемся что данные - массив

        displayClassificationHistory(type); // Отображаем историю
        showStatus('✅ История загружена', 'success');

    } catch (error) {
        console.error('Error loading classification history:', error);
        showStatus('❌ Ошибка загрузки истории: ' + error.message, 'error');
        classificationHistory = [];
        displayClassificationHistory(type);
    }
}

// Отображение истории заданий классификации с фильтрацией по типу
function displayClassificationHistory(type) {
    const container = document.getElementById('classificationHistory');

    // Фильтруем историю по типу задания
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

// Выбор задания классификации для использования в оценке
function useClassificationJob(jobId, jobType) {
    document.getElementById('classificationJobId').value = jobId;
    document.getElementById('evaluationType').value = jobType;
    showStatus(`✅ Выбрано задание: ${jobId}`, 'success');
}

// Запуск процесса оценки полноты классификации
async function evaluateRecall() {
    const jobId = document.getElementById('classificationJobId').value;
    const evalType = document.getElementById('evaluationType').value;
    const threshold = 0.8; // Пороговое значение для оценки

    if (!jobId || !evalType) {
        showStatus('❌ Заполните все обязательные поля', 'error');
        return;
    }

    try {
        document.getElementById('evaluateBtn').disabled = true;
        showStatus('🧮 Вычисление полноты...', 'processing');

        const response = await apiFetch('/api/evaluation/recall', {
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
        displayResults(results); // Отображаем результаты оценки
        showStatus('✅ Оценка полноты завершена!', 'success');

    } catch (error) {
        console.error('Evaluation error:', error);
        showStatus('❌ Ошибка оценки: ' + error.message, 'error');
    } finally {
        document.getElementById('evaluateBtn').disabled = false;
    }
}

// Отображение результатов оценки полноты в интерфейсе
function displayResults(results) {
    // Обновляем сводные карточки с метриками
    document.getElementById('recallValue').textContent = results.metrics.recall.toFixed(4);
    document.getElementById('totalFiles').textContent = results.metrics.total_files;
    document.getElementById('matchesFound').textContent = results.summary.files_with_matches;
    document.getElementById('matchesPercent').textContent =
        Math.round((results.summary.files_with_matches / results.metrics.total_files) * 100) + '%';


    // Обновляем детальную статистику (True Positive, False Positive, False Negative)
    document.getElementById('totalTp').textContent = results.metrics.total_tp;
    document.getElementById('totalFp').textContent = results.metrics.total_fp;
    document.getElementById('totalFn').textContent = results.metrics.total_fn;

    // Обновляем статус выполнения требования по порогу полноты
    const recallCard = document.getElementById('recallCard');
    const recallStatus = document.getElementById('recallStatus');


    if (results.threshold_met) {
        recallCard.classList.add('success');
        recallCard.classList.remove('warning', 'error');
        recallStatus.textContent = 'Требование выполнено ✅';

    } else {
        recallCard.classList.add('error');
        recallCard.classList.remove('success', 'warning');
        recallStatus.textContent = 'Требование не выполнено ❌';
    }

    // Заполняем таблицу с результатами по каждому файлу
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
            <td>${metric.recall.toFixed(4)}</td>
            <td><span class="status-badge ${metric.match_found ? 'status-success' : 'status-error'}">
                ${metric.match_found ? 'Совпадение' : 'Нет совпадения'}
            </span></td>
        `;
        tbody.appendChild(row);
    });

    // Показываем блок с результатами
    document.getElementById('results').style.display = 'block';
}

// Вспомогательные функции для работы с интерфейсом

// Отображение статуса операции в интерфейсе
function showStatus(message, type) {
    const container = document.getElementById('status');
    container.innerHTML = `<div class="status status-${type}">${message}</div>`;
}

// Получение иконки для отображения статуса задания
function getStatusIcon(status) {
    const icons = {
        'processing': '🔄',
        'completed': '✅',
        'error': '❌'
    };
    return icons[status] || '📋';
}

// Заглушка для функции скачивания отчета (пока не реализована)
function downloadReport() {
    alert('Функция скачивания отчета будет реализована');
}

// Заглушка для функции визуализации результатов (пока не реализована)
function visualizeResults() {
    alert('Функция визуализации будет реализована');
}

// Инициализация приложения при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    loadClassificationHistory('all'); // Загружаем историю всех заданий классификации
});