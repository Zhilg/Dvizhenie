// Базовый URL для API запросов
const BASE_URL = "/api";
// ID текущего задания загрузки
let currentJobId = null;
// Флаг состояния загрузки
let isUploading = false;
// Список доступных моделей для загрузки
let availableModels = [];
// Текущее имя корпуса
let currentCorpusName = null;

let corpusPath = null;

// Инициализация страницы загрузки при загрузке DOM
document.addEventListener('DOMContentLoaded', async () => {
    await loadModels(); // Загрузка списка моделей
    setupEventListeners(); // Настройка обработчиков событий
});

// Настройка обработчиков событий для элементов интерфейса
function setupEventListeners() {
    document.getElementById('uploadBtn').addEventListener('click', uploadDocuments); // Кнопка загрузки
    document.getElementById('folderInput').addEventListener('change', function() {
        // Обновление отображения количества выбранных файлов
        document.getElementById('folderName').value = this.files.length > 0 ?
            `${this.files.length} файлов выбрано` : 'Папка не выбрана';
    });
}

// Загрузка списка доступных моделей с сервера
async function loadModels() {
    try {
        const response = await apiFetch(`${BASE_URL}/models`);
        if (!response.ok) throw new Error(await response.text());

        availableModels = await response.json();
        const modelSelect = document.getElementById('modelSelect');

        modelSelect.innerHTML = '<option value="">-- Выберите модель --</option>';

        // Заполнение выпадающего списка моделей
        availableModels.forEach(model => {
            const option = document.createElement('option');
            option.value = model.model_id;
            option.textContent = model.model_name || model.model_id;
            if (model.dimension) {
                option.textContent += ` (${model.dimension})`; // Добавление размерности модели
            }
            modelSelect.appendChild(option);
        });
    } catch (error) {
        console.error("Error loading models:", error);
        showError('Ошибка загрузки моделей: ' + error.message);
    }
}

// Получение названия модели по её ID
function getModelNameById(modelId) {
    const model = availableModels.find(m => m.model_id === modelId);
    return model ? (model.model_name || model.model_id) : modelId; // Возвращаем название или ID если название не найдено
}

// Основная функция загрузки документов на сервер
async function uploadDocuments() {
    const folderInput = document.getElementById('folderInput');
    const modelSelect = document.getElementById('modelSelect');
    const corpusNameValue = document.getElementById('corpusName').value;
    const ttlHours = document.getElementById('ttlHours').value;
    const uploadBtn = document.getElementById('uploadBtn');

    // Валидация входных данных
    if (!corpusNameValue) {
        showError('Пожалуйста, введите имя корпуса');
        return;
    }

    if (!folderInput.files.length) {
        showError('Пожалуйста, выберите папку с документами');
        return;
    }

    if (!modelSelect.value) {
        showError('Пожалуйста, выберите модель');
        return;
    }

    // Блокировка кнопки и отображение прогресса
    isUploading = true;
    uploadBtn.disabled = true;
    uploadBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Загрузка...';

    // Показ индикатора прогресса
    document.getElementById('uploadProgressContainer').classList.remove('hidden');
    updateUploadProgress(0, 'Начало загрузки...');

    try {
        const formData = new FormData();
        // Добавление всех выбранных файлов в FormData
        for (let i = 0; i < folderInput.files.length; i++) {
            formData.append('files', folderInput.files[i]);
        }

        // Отправка файлов на сервер для семантической обработки
        console.log('=== DEBUG: Client sending upload request ===');
        console.log('corpusNameValue:', corpusNameValue);
        console.log('corpusNameValue encoding:', new TextEncoder().encode(corpusNameValue));
        console.log('modelId:', modelSelect.value);
        console.log('ttlHours:', ttlHours || '0');
        console.log('Files count:', folderInput.files.length);
        
        const response = await apiFetch(`${BASE_URL}/semantic/upload`, {
            method: 'POST',
            headers: {
                'x-model-id': modelSelect.value, // ID выбранной модели
                'x-ttl-hours': ttlHours || '0', // Время жизни корпуса
                'x-corpus-name': encodeURIComponent(corpusNameValue), // Имя корпуса с URL encoding
            },
            body: formData
        });
        
        console.log('=== DEBUG: Response received ===');
        console.log('Response status:', response.status);
        console.log('=== END DEBUG ===');

        if (!response.ok) throw new Error(await response.text());

        const data = await response.json();
        console.log(`DATA ${data}`);
        currentJobId = data.job_id;
        currentJobId = currentJobId.replace("/", ""); // Очистка ID от слешей
        currentCorpusName = corpusNameValue; // Сохранение имени корпуса глобально
        corpusPath = data.corpus_path; // Сохранение пути к корпусу глобально

        // Отображение информации о начатой загрузке
        const displayCorpusName = decodeURIComponent(corpusNameValue); // Ensure proper display
        document.getElementById('uploadResults').innerHTML = `
            <div class="alert alert-info">
                <h4 class="alert-heading">Загрузка начата</h4>
                <p><strong>ID задачи:</strong> ${currentJobId}</p>
                <p><strong>Примерное время:</strong> ${data.estimated_time_min || 'неизвестно'} минут</p>
                <p><strong>Имя корпуса:</strong> ${displayCorpusName}</p>
                <p><strong>Модель:</strong> ${modelSelect.options[modelSelect.selectedIndex].text}</p>
                <p><strong>Файлов:</strong> ${folderInput.files.length}</p>
                <p><strong>Имя папки корпуса в /shared_data:</strong> ${corpusPath}</p>
                <p><strong>Статус:</strong> Обработка продолжается на сервере</p>
            </div>
        `;

        // Запуск серверной проверки статуса загрузки
        checkUploadStatus();

    } catch (error) {
        console.error("Upload error:", error);
        showError('Ошибка загрузки: ' + error.message);
        resetUploadButton(); // Восстановление состояния кнопки
    }
}

// Проверка статуса выполнения загрузки и обработки документов
async function checkUploadStatus() {
    if (!currentJobId) return;

    try {
        // Use original API endpoint - server-side polling is transparent to client
        const response = await apiFetch(`${BASE_URL}/jobs/${currentJobId}`);
        if (!response.ok) throw new Error(await response.text());

        const status = await response.json();

        if (status.status === 'processing') {
            const progress = status.progress || 0;
            updateUploadProgress(progress, `Обработка: ${progress.toFixed(1)}%`);

            // Continue polling - server handles background processing
            setTimeout(checkUploadStatus, 5000);
        }
        else if (status.status === 'completed') {
            updateUploadProgress(100, '✅ Результаты получены. Смотрите ниже.', 'success');
            await getUploadResults(status.result_url, currentCorpusName);
            resetUploadButton();
        }

    } catch (error) {
        console.error("Status check error:", error);
        showError('Ошибка проверки статуса: ' + error.message);
        resetUploadButton();
    }
}

// Обновление индикатора прогресса загрузки
function updateUploadProgress(percent, message, type = 'info') {
    const progressBar = document.getElementById('uploadProgressBar');
    const statusElement = document.getElementById('uploadStatus');

    progressBar.style.width = percent + '%';
    progressBar.setAttribute('aria-valuenow', percent);
    statusElement.textContent = message;

    // Удаление предыдущих классов типа
    statusElement.classList.remove('status-success', 'status-info', 'status-error');
    statusElement.classList.add(`status-${type}`);
}

// Восстановление состояния кнопки загрузки
function resetUploadButton() {
    const uploadBtn = document.getElementById('uploadBtn');
    uploadBtn.disabled = false;
    uploadBtn.innerHTML = '<i class="bi bi-cloud-upload"></i> Загрузить корпус текстов';
    isUploading = false;
}

// Получение результатов загрузки и обработки документов
async function getUploadResults(resultUrl, corpusName) {
    try {
        console.log("Making request to /api/result with resultUrl:", resultUrl);

        const response = await apiFetch("/api/result", {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "x-result-url": resultUrl
            },
        });

        console.log("Response status:", response.status);

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText);
        }

        return await processSuccessfulResponse(response, corpusName); // Обработка успешного ответа

    } catch (error) {
        console.error("Error in getUploadResults:", error);
        showError('Ошибка получения результатов загрузки: ' + error.message);
    }
}

// Обработка успешного ответа от сервера с результатами загрузки
async function processSuccessfulResponse(response, corpusName) {
    const results = await response.json();
    const modelId = document.getElementById('modelSelect').value;
    console.log(results);

    // Корпус автоматически сохранен сервером в БД

    // Отображение результатов загрузки
    const displayCorpusName = decodeURIComponent(corpusName); // Ensure proper display of Russian names
    document.getElementById('uploadResults').innerHTML = `
        <div class="alert alert-success">
            <h4 class="alert-heading">✅ Загрузка завершена</h4>
            <p><strong>Имя корпуса:</strong> ${displayCorpusName}</p>
            <p><strong>ID корпуса:</strong> ${results.corpus_id}</p>
            <p><strong>Имя папки корпуса в /shared_data:</strong> ${corpusPath}</p>
            <p><strong>Модель:</strong> ${getModelNameById(modelId)}</p>
            <p><strong>Файлов:</strong> ${results.file_count}</p>
            <p><strong>Статус:</strong> Корпус автоматически сохранен в истории</p>
            <p class="mb-0"><small>Корпус успешно загружен и проиндексирован</small></p>
        </div>
    `;

    return results;
}



// Отображение сообщения об ошибке пользователю
function showError(message) {
    const errorContainer = document.getElementById('errorContainer');

    const alertDiv = document.createElement('div');
    alertDiv.className = 'alert alert-danger alert-dismissible fade show';
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;

    errorContainer.appendChild(alertDiv);

    // Автоматическое скрытие сообщения через 5 секунд
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.classList.remove('show');
            setTimeout(() => alertDiv.remove(), 150);
        }
    }, 5000);
}




// Форматирование даты в человеко-читаемый вид
function formatDate(dateString) {
    if (!dateString) return 'Неизвестно';

    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'Некорректная дата';

        // Format as DD.MM.YYYY HH:MM
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');

        return `${day}.${month}.${year} ${hours}:${minutes}`;
    } catch (error) {
        console.error('Error formatting date:', error);
        return 'Ошибка формата';
    }
}

