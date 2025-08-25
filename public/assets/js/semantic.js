const BASE_URL = "/api"; // Базовый URL API

// Глобальные переменные
let currentJobId = null;
let currentCorpusId = null;
let checkStatusInterval = null;
let isUploading = false;

// Инициализация - загрузка моделей
document.addEventListener('DOMContentLoaded', async () => {
    await loadModels();
});

// Загрузка списка моделей
async function loadModels() {
    try {
        const response = await fetch(`${BASE_URL}/models`);
        if (!response.ok) throw new Error(await response.text());
        
        const models = await response.json();
        const modelSelect = document.getElementById('modelSelect');
        const searchModelSelect = document.getElementById('searchModelSelect');
        
        // Очищаем и добавляем модели
        modelSelect.innerHTML = '<option value="">-- Выберите модель --</option>';
        searchModelSelect.innerHTML = '<option value="">-- Выберите модель --</option>';
        
        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.model_id;
            option.textContent = model.model_name || model.model_id;
            
            modelSelect.appendChild(option.cloneNode(true));
            searchModelSelect.appendChild(option);
        });
    } catch (error) {
        console.error("Error loading models:", error);
        showError('Ошибка загрузки моделей: ' + error.message);
    }
}

// Загрузка документов
async function uploadDocuments() {
    const folderInput = document.getElementById('folderInput');
    const modelSelect = document.getElementById('modelSelect');
    const ttlHours = document.getElementById('ttlHours').value;
    const uploadBtn = document.getElementById('uploadBtn');
    
    if (!folderInput.files.length) {
        showError('Пожалуйста, выберите папку с документами');
        return;
    }
    
    if (!modelSelect.value) {
        showError('Пожалуйста, выберите модель');
        return;
    }

    // Блокируем кнопку и показываем прогресс
    isUploading = true;
    uploadBtn.disabled = true;
    uploadBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Загрузка...';
    
    // Показываем прогресс бар
    document.getElementById('uploadProgressContainer').style.display = 'block';
    updateUploadProgress(0, 'Начало загрузки...');

    try {
        const formData = new FormData();
        for (let i = 0; i < folderInput.files.length; i++) {
            formData.append('files', folderInput.files[i]);
        }

        const response = await fetch(`${BASE_URL}/semantic/upload`, {
            method: 'POST',
            headers: {
                'x-model-id': modelSelect.value,
                'x-ttl-hours': ttlHours || '0'
            },
            body: formData
        });

        if (!response.ok) throw new Error(await response.text());

        const data = await response.json();
        currentJobId = data.job_id;

        document.getElementById('uploadResults').innerHTML = `
            <div class="alert alert-info">
                <h4 class="alert-heading">Загрузка начата</h4>
                <p><strong>ID задачи:</strong> ${currentJobId}</p>
                <p><strong>Примерное время:</strong> ${data.estimated_time_min || 'неизвестно'} минут</p>
            </div>
        `;
        
        // Запускаем проверку статуса
        checkUploadStatus();
        
    } catch (error) {
        console.error("Upload error:", error);
        showError('Ошибка загрузки: ' + error.message);
        resetUploadButton();
    }
}

async function checkUploadStatus() {
    if (!currentJobId) return;
    
    try {
        const response = await fetch(`${BASE_URL}/jobs/${currentJobId}`);
        if (!response.ok) throw new Error(await response.text());
        
        const status = await response.json();
        
        if (status.status === 'processing') {
            const progress = status.progress || 0;
            updateUploadProgress(progress, `Обработка: ${progress.toFixed(1)}%`);
            
            // Продолжаем проверять каждые 2 секунды
            setTimeout(checkUploadStatus, 2000);
        } 
        else if (status.status === 'completed') {
            updateUploadProgress(100, 'Загрузка завершена!');
            // Получаем результат по URL из статуса
            await getUploadResults(status.result_url);
            resetUploadButton();
        }
        
    } catch (error) {
        console.error("Status check error:", error);
        showError('Ошибка проверки статуса: ' + error.message);
        resetUploadButton();
    }
}

// Обновление прогресса загрузки
function updateUploadProgress(percent, message) {
    const progressBar = document.getElementById('uploadProgressBar');
    const progressPercent = document.getElementById('uploadProgressPercent');
    const statusElement = document.getElementById('uploadStatus');
    
    progressBar.style.width = percent + '%';
    progressBar.setAttribute('aria-valuenow', percent);
    progressPercent.textContent = percent + '%';
    statusElement.textContent = message;
}

// Сброс кнопки загрузки
function resetUploadButton() {
    const uploadBtn = document.getElementById('uploadBtn');
    uploadBtn.disabled = false;
    uploadBtn.innerHTML = '<i class="bi bi-cloud-upload"></i> Загрузить корпус текстов';
    isUploading = false;
}

async function getUploadResults(resultUrl) {
        // Делаем запрос на URL результата
        const response = await fetch("/api/result", {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            "x-result-url": resultUrl
        },
        });

        if (!response.ok) throw new Error(await response.text());
        
        const results = await response.json();
        
        currentCorpusId = results.corpus_id;
        const corpusSelect = document.getElementById('corpusId');
        
        // Добавляем новый корпус в выпадающий список
        const option = document.createElement('option');
        option.value = results.corpus_id;
        option.textContent = `${results.corpus_id} (${results.file_count} файлов)`;
        corpusSelect.appendChild(option);
        corpusSelect.value = results.corpus_id;
        
        // Сохраняем в историю
        saveCorpusId(results.corpus_id, document.getElementById('modelSelect').value, results.file_count);
        
        // Показываем результаты
        document.getElementById('uploadResults').innerHTML = `
            <div class="alert alert-success">
                <h4 class="alert-heading">✅ Загрузка завершена</h4>
                <p><strong>ID корпуса:</strong> ${results.corpus_id}</p>
                <p><strong>Файлов:</strong> ${results.file_count}</p>
                <p><strong>Размер индекса:</strong> ${results.index_stats?.total_size_gb || 'N/A'} GB</p>
                <p class="mb-0"><small>Корпус успешно загружен и проиндексирован</small></p>
            </div>
        `;
    
}

// Остальные функции остаются без изменений
document.getElementById('showHistoryBtn').addEventListener('click', function() {
    loadCorpusHistory();
    const modal = new bootstrap.Modal(document.getElementById('historyModal'));
    modal.show();
});

// Поиск по корпусу
async function searchDocuments() {
    const corpusId = document.getElementById('corpusId').value;
    const searchQuery = document.getElementById('searchQuery');
    const searchModelSelect = document.getElementById('searchModelSelect');
    const resultAmount = document.getElementById('resultAmount').value;
    const searchBtn = document.getElementById('searchBtn');
    
    if (!corpusId) {
        showError('Пожалуйста, введите ID корпуса');
        return;
    }

    if (!searchQuery.value) {
        showError('Пожалуйста, введите поисковый запрос');
        return;
    }
    
    if (!searchModelSelect.value) {
        showError('Пожалуйста, выберите модель');
        return;
    }

    showLoading(searchBtn);

    try {
        const response = await fetch(`${BASE_URL}/semantic/search`, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'x-corpus-id': corpusId,
                'x-result-amount': resultAmount,
                'x-model-id': searchModelSelect.value
            },
            body: searchQuery.value
        });

        if (!response.ok) throw new Error(await response.text());

        const results = await response.json();
        displaySearchResults(results);
        
    } catch (error) {
        console.error("Search error:", error);
        showError('Ошибка поиска: ' + error.message);
    } finally {
        resetButton(searchBtn, '<i class="bi bi-search"></i> Найти');
    }
}

// Отображение результатов поиска
function displaySearchResults(results) {
    const searchResults = document.getElementById('searchResults');
    let html = `
        <div class="table-responsive">
            <table class="table table-striped">
                <thead>
                    <tr>
                        <th>Документ</th>
                        <th>Фрагмент</th>
                        <th>Сходство</th>
                    </tr>
                </thead>
                <tbody>
    `;

    results.results.forEach(result => {
        html += `
            <tr>
                <td>
                    <strong>${result.file_id}</strong><br>
                    <small class="text-muted">${result.fragment || ''}</small>
                </td>
                <td>${result.preview || ''}</td>
                <td>${result.score.toFixed(4)}</td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
        <p class="mt-2">Найдено результатов: ${results.results.length}</p>
    `;

    searchResults.innerHTML = html;
    searchResults.style.display = 'block';
    document.getElementById('resultsContainer').style.display = 'block';
}

// Вспомогательные функции
function showLoading(button) {
    button.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Обработка...';
    button.disabled = true;
}

function resetButton(button, originalText) {
    button.innerHTML = originalText;
    button.disabled = false;
}

function showError(message) {
    const alertDiv = document.createElement('div');
    alertDiv.className = 'alert alert-danger';
    alertDiv.textContent = message;
    
    const container = document.getElementById('resultsContainer');
    container.insertBefore(alertDiv, container.firstChild);
    container.style.display = 'block';
    
    setTimeout(() => alertDiv.remove(), 5000);
}

// Обработчики событий
document.getElementById('uploadBtn').addEventListener('click', uploadDocuments);
document.getElementById('searchBtn').addEventListener('click', searchDocuments);
document.getElementById('folderInput').addEventListener('change', function() {
    document.getElementById('folderName').value = this.files.length > 0 ? 
        `${this.files.length} файлов выбрано` : 'Папка не выбрана';
});

// Функции для работы с историей
function saveCorpusId(corpusId, modelId = null, fileCount = null) {
    const history = JSON.parse(localStorage.getItem('corpusHistory')) || [];
    
    const existingIndex = history.findIndex(item => item.id === corpusId);
    
    const corpusInfo = {
        id: corpusId,
        model: modelId || document.getElementById('modelSelect').value,
        files: fileCount || null,
        date: new Date().toISOString()
    };
    
    if (existingIndex >= 0) {
        history[existingIndex] = corpusInfo;
    } else {
        history.unshift(corpusInfo);
    }
    
    localStorage.setItem('corpusHistory', JSON.stringify(history.slice(0, 10)));
    loadCorpusDropdown();
}

function loadCorpusHistory() {
    const history = JSON.parse(localStorage.getItem('corpusHistory')) || [];
    updateHistoryModal(history);
}

function loadCorpusDropdown() {
    const history = JSON.parse(localStorage.getItem('corpusHistory')) || [];
    const corpusSelect = document.getElementById('corpusId');
    
    const currentValue = corpusSelect.value;
    corpusSelect.innerHTML = '<option value="">-- Выберите корпус --</option>';
    
    history.forEach(corpus => {
        const option = document.createElement('option');
        option.value = corpus.id;
        option.textContent = `${corpus.id} (модель: ${corpus.model || 'неизвестна'}, файлов: ${corpus.files || '?'})`;
        corpusSelect.appendChild(option);
    });
    
    if (currentValue && history.some(c => c.id === currentValue)) {
        corpusSelect.value = currentValue;
    }
}

function updateHistoryModal(history) {
    const modalBody = document.getElementById('historyModalBody');
    
    if (history.length === 0) {
        modalBody.innerHTML = '<p>История поиска пуста</p>';
        return;
    }
    
    modalBody.innerHTML = `
        <div class="table-responsive">
            <table class="table table-sm">
                <thead>
                    <tr>
                        <th>ID корпуса</th>
                        <th>Модель</th>
                        <th>Файлов</th>
                        <th>Дата</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    ${history.map(corpus => `
                        <tr>
                            <td><code>${corpus.id}</code></td>
                            <td>${corpus.model || 'неизвестна'}</td>
                            <td>${corpus.files || 'неизвестно'}</td>
                            <td>${new Date(corpus.date).toLocaleString()}</td>
                            <td>
                                <button class="btn btn-sm btn-outline-primary use-corpus-btn" 
                                    data-id="${corpus.id}">
                                    Использовать
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
    
    document.querySelectorAll('.use-corpus-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.getElementById('corpusId').value = this.getAttribute('data-id');
            bootstrap.Modal.getInstance(document.getElementById('historyModal')).hide();
        });
    });
}
