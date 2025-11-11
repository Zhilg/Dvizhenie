// Глобальные переменные для управления состоянием классификации
let currentJobId = null; // ID текущего задания классификации
let checkInterval = null; // Интервал для проверки статуса задания
let availableModels = []; // Список доступных моделей для классификации
let jobHistory = []; // История выполненных заданий кластеризации

// Загрузка списка доступных моделей с сервера
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

// Обновление выпадающего списка моделей на основе загруженных данных
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

// Обработчик изменения выбранной модели - отображение информации о модели
document.getElementById('modelSelect').addEventListener('change', function() {
    const selectedModelId = this.value;
    const modelInfo = document.getElementById('modelInfo');
    const modelDetails = document.getElementById('modelDetails');

    if (!selectedModelId) {
        modelInfo.style.display = 'none';
        return;
    }

    const model = availableModels.find(m => m.model_id === selectedModelId);
    if (model) {
        modelDetails.innerHTML = `
            <p><strong>ID:</strong> ${model.model_id}</p>
            <p><strong>Размерность:</strong> ${model.dimension}D</p>
            ${model.model_name ? `<p><strong>Название:</strong> ${model.model_name}</p>` : ''}
        `;
        modelInfo.style.display = 'block';
    }
});

// Загрузка истории выполненных заданий кластеризации для выбора
async function loadJobHistory() {
 try {
     showStatus('🔄 Загрузка истории кластеризации...', 'processing');

     const response = await fetch('/api/clusterization/history');

     if (!response.ok) {
         throw new Error('Ошибка загрузки истории кластеризации');
     }

     const data = await response.json();

     // Проверяем что получили массив заданий
     if (!Array.isArray(data)) {
         console.warn('Expected array but got:', data);
         jobHistory = [];
     } else {
         jobHistory = data;
     }

     displayJobHistory();
     showStatus('✅ История загружена', 'success');

 } catch (error) {
     console.error('Error loading job history:', error);
     showStatus('❌ Ошибка загрузки истории: ' + error.message, 'error');
     jobHistory = [];
     displayJobHistory();
 }
}

// Отображение списка заданий кластеризации в интерфейсе
function displayJobHistory() {
 const historyDiv = document.getElementById('jobHistory');

 // Дополнительная проверка корректности данных
 if (!Array.isArray(jobHistory) || jobHistory.length === 0) {
     historyDiv.innerHTML = '<p>📝 Нет истории заданий кластеризации</p>';
     return;
 }

 try {
     historyDiv.innerHTML = jobHistory.map(job => {
         // Проверяем что job является объектом
         if (typeof job !== 'object' || job === null) {
             return '<div class="job-item">❌ Неверный формат задания</div>';
         }

         const jobId = job.job_id || 'Unknown ID';
         const status = job.status || 'unknown';
         const modelId = job.model_id || 'N/A';
         const createdAt = job.created_at ? new Date(job.created_at).toLocaleString() : 'N/A';
         const estimatedTime = job.estimated_time_min ? `~${job.estimated_time_min} мин` : 'неизвестно';

         return `
             <div class="job-item" data-job-id="${jobId}">
                 <div class="job-header">
                     <strong>📊 ${jobId.substring(0, 8)}...</strong>
                     <span class="job-status ${status}">${getStatusIcon(status)} ${status}</span>
                 </div>
                 <div class="job-details">
                     <p><strong>Модель:</strong> ${modelId}</p>
                     <p><strong>Создано:</strong> ${createdAt}</p>
                     <p><strong>Время обработки:</strong> ${estimatedTime}</p>
                     ${job.corpus_path ? `<p><strong>Корпус:</strong> ${job.corpus_path}</p>` : ''}
                 </div>
                 <div class="job-actions">
                     <button class="btn btn-small btn-primary" onclick="useClusteringJob('${jobId}', '${modelId}')">
                         ✅ Использовать для классификации
                     </button>
                     <button class="btn btn-small" onclick="checkJobStatus('${jobId}')">
                         🔄 Проверить статус
                     </button>
                 </div>
             </div>
         `;
     }).join('');
 } catch (error) {
     console.error('Error displaying job history:', error);
     historyDiv.innerHTML = '<p>❌ Ошибка отображения истории</p>';
 }
}

// Получение иконки для отображения статуса задания
function getStatusIcon(status) {
const icons = {
    'pending': '⏳',
    'processing': '🔄',
    'completed': '✅',
    'error': '❌',
    'failed': '❌'
};
return icons[status] || '📋';
}

// Выбор задания кластеризации для использования в классификации
function useClusteringJob(jobId, modelId) {
document.getElementById('clusteringJobId').value = jobId;

// Автоматически выбираем ту же модель для классификации
const modelSelect = document.getElementById('modelSelect');
if (modelId && Array.from(modelSelect.options).some(opt => opt.value === modelId)) {
    modelSelect.value = modelId;
}

showStatus(`✅ Выбрана кластеризация: ${jobId}`, 'success');

// Прокручиваем к форме классификации
// document.getElementById('classificationForm').scrollIntoView({
//     behavior: 'smooth'
// });
}

// Проверка текущего статуса задания кластеризации
async function checkJobStatus(jobId) {
try {
showStatus('🔄 Проверка статуса...', 'processing');

const response = await fetch(`/api/jobs/${jobId}`);
if (!response.ok) throw new Error('Ошибка проверки статуса');

const status = await response.json();

// Обновляем статус в локальной истории заданий
const jobIndex = jobHistory.findIndex(job => job.job_id === jobId);
if (jobIndex !== -1) {
    jobHistory[jobIndex].status = status.status;
    displayJobHistory();
}

showStatus(`Статус задания: ${status.status}`, 'success');

} catch (error) {
console.error('Error checking job status:', error);
showStatus('❌ Ошибка проверки статуса: ' + error.message, 'error');
}
}


// Просмотр детальной информации о задании кластеризации
async function viewJobDetails(jobId) {
try {
    const response = await fetch(`/api/jobs/${jobId}/details`);
    const jobDetails = await response.json();

    // Показываем модальное окно с деталями задания
    alert(JSON.stringify(jobDetails, null, 2));

} catch (error) {
    console.error('Error fetching job details:', error);
    showStatus('❌ Ошибка загрузки деталей задания', 'error');
}
}

// Открытие диалога выбора файлов
function selectFolder() {
    document.getElementById('fileInput').click();
}

// Обработчик изменения выбранных файлов
document.getElementById('fileInput').addEventListener('change', function(e) {
    const files = e.target.files;
    if (files.length === 0) return;

    document.getElementById('selectedFolder').textContent =
        `Выбрано файлов: ${files.length}`;
});

// Запуск процесса классификации документов
async function startClassification() {
    const modelSelect = document.getElementById('modelSelect');
    const modelId = modelSelect.value;
    const clusteringJobId = document.getElementById('clusteringJobId').value;

    if (!modelId) {
        showStatus('❌ Выберите модель классификации', 'error');
        return;
    }

    if (!clusteringJobId) {
        showStatus('❌ Введите ID кластеризации', 'error');
        return;
    }

    const files = document.getElementById('fileInput').files;
    if (files.length === 0) {
        showStatus('Выберите папку с файлами', 'error');
        return;
    }

    clearStatus();
    document.getElementById('loading').style.display = 'block';
    document.getElementById('startBtn').disabled = true;

    try {
        const formData = new FormData();
        for (let i = 0; i < files.length; i++) {
            formData.append('files', files[i]);
        }

        const modelId = document.getElementById('modelSelect').value;
        const ttlHours = document.getElementById('ttlHours').value;

        const response = await fetch('/api/classification', {
            method: 'POST',
            headers: {
                'x-model-id': modelId,
                'x-clustering-job-id': clusteringJobId,
                'x-ttl-hours': ttlHours
            },
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Ошибка сервера');
        }

        const result = await response.json();
        currentJobId = result.job_id;

        showStatus(`Классификация запущена. Job ID: ${currentJobId}`, 'processing');
        startStatusChecking();

    } catch (error) {
        console.error('Error:', error);
        showStatus('Ошибка: ' + error.message, 'error');
    } finally {
        document.getElementById('startBtn').disabled = false;
    }
}

// Запуск периодической проверки статуса выполнения задания
function startStatusChecking() {
    if (checkInterval) clearInterval(checkInterval);

    checkInterval = setInterval(async () => {
        try {
            const response = await fetch(`/api/jobs/${currentJobId}`);
            const status = await response.json();

            if (status.status === 'processing') {
                updateProgress(status);
            } else if (status.status === 'completed') {
                clearInterval(checkInterval);
                await fetchResults(status.result_url);
            } else if (status.status === 'error') {
                clearInterval(checkInterval);
                showStatus('Ошибка обработки: ' + status.message, 'error');
            }
        } catch (error) {
            console.error('Status check error:', error);
        }
    }, 2000);
}

// Обновление индикатора прогресса обработки файлов
function updateProgress(status) {
    const progress = status.progress || 0;
    document.getElementById('progressFill').style.width = progress + '%';

    let details = `Прогресс: ${progress}%`;
    if (status.details) {
        if (status.details.files_processed) {
            details += ` | Обработано файлов: ${status.details.files_processed}`;
        }
        if (status.details.bytes_processed) {
            details += ` | Байт: ${formatBytes(status.details.bytes_processed)}`;
        }
    }
    document.getElementById('progressDetails').textContent = details;

    showStatus(`Обработка: ${progress}%`, 'processing');
}

// Загрузка и отображение результатов классификации
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

// Отображение результатов классификации в таблице
function displayResults(results) {
    const tableBody = document.getElementById('tableBody');
    tableBody.innerHTML = '';

    if (!results.correspondence_table || !results.correspondence_table.files) {
        tableBody.innerHTML = '<tr><td colspan="12">Нет данных для отображения</td></tr>';
        return;
    }

    const clusterNames = results.correspondence_table.cluster_names || {};

    results.correspondence_table.files.forEach(file => {
        const devClasses = file.d || [];
        // Расчет классов оболочки на основе референсной близости
        const shellClasses = calculateShellClasses(devClasses, clusterNames);

        const row1 = document.createElement('tr');
        const row2 = document.createElement('tr');

        // Первая строка - классы разработчика (developer classes)
        row1.innerHTML = `
            <td rowspan="2" class="file-info">${file.f}</td>
        `;

        devClasses.forEach(([classId, similarity]) => {
            row1.innerHTML += `<td>${clusterNames[classId] || classId}<br>${similarity.toFixed(3)}</td>`;
        });

        for (let i = devClasses.length; i < 5; i++) {
            row1.innerHTML += '<td>-</td>';
        }

        row1.innerHTML += `<td rowspan="2" id="matches-${file.f}"></td>`;

        // Вторая строка - классы оболочки (shell classes)
        shellClasses.forEach((shellClass, index) => {
            const isMatch = devClasses.some(([devId]) => devId === shellClass.classId);
            const cellClass = isMatch ? 'match' : '';
            row2.innerHTML += `<td class="${cellClass}">${shellClass.name}<br>${shellClass.similarity.toFixed(3)}</td>`;
        });

        for (let i = shellClasses.length; i < 5; i++) {
            row2.innerHTML += '<td>-</td>';
        }

        tableBody.appendChild(row1);
        tableBody.appendChild(row2);

        // Добавляем информацию о найденных совпадениях
        const matches = findMatches(devClasses, shellClasses, clusterNames);
        document.getElementById(`matches-${file.f}`).innerHTML = matches.join('<br>');
    });

    document.getElementById('results').style.display = 'block';
}

// Расчет классов оболочки на основе референсной близости (заглушка для демонстрации)
function calculateShellClasses(devClasses, clusterNames) {
    // Заглушка - здесь будет ваша логика расчета референсной близости
    // Возвращаем те же классы с немного измененными значениями similarity
    return devClasses.map(([classId, similarity]) => ({
        classId,
        name: clusterNames[classId] || classId,
        similarity: Math.max(0.1, similarity + (Math.random() - 0.5) * 0.1)
    }));
}

// Поиск совпадений между классами разработчика и оболочки
function findMatches(devClasses, shellClasses, clusterNames) {
    const matches = [];
    devClasses.forEach(([devId, devSim], index) => {
        const shellClass = shellClasses.find(s => s.classId === devId);
        if (shellClass) {
            matches.push(`${clusterNames[devId] || devId}: dev=${devSim.toFixed(3)}, shell=${shellClass.similarity.toFixed(3)}`);
        }
    });
    return matches;
}

// Отображение статуса операции в интерфейсе
function showStatus(message, type) {
    const statusDiv = document.getElementById('status');
    statusDiv.innerHTML = `<div class="status status-${type}">${message}</div>`;
}

// Очистка отображения статуса
function clearStatus() {
    document.getElementById('status').innerHTML = '';
}

// Форматирование размера файла в человеко-читаемый вид
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Инициализация приложения после загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
    loadModels();
    loadJobHistory('all');

    // Автоматическое обновление истории заданий каждые 30 секунд
    setInterval(() => loadJobHistory('all'), 30000);
});
