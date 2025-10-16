const BASE_URL = "/api";
let currentJobId = null;
let isUploading = false;
let availableModels = [];

document.addEventListener('DOMContentLoaded', async () => {
    await loadModels();
    setupEventListeners();
});

function setupEventListeners() {
    document.getElementById('uploadBtn').addEventListener('click', uploadDocuments);
    document.getElementById('folderInput').addEventListener('change', function() {
        document.getElementById('folderName').value = this.files.length > 0 ? 
            `${this.files.length} файлов выбрано` : 'Папка не выбрана';
    });
}

async function loadModels() {
    try {
        const response = await fetch(`${BASE_URL}/models`);
        if (!response.ok) throw new Error(await response.text());
        
        availableModels = await response.json();
        const modelSelect = document.getElementById('modelSelect');
        
        modelSelect.innerHTML = '<option value="">-- Выберите модель --</option>';
        
        availableModels.forEach(model => {
            const option = document.createElement('option');
            option.value = model.model_id;
            option.textContent = model.model_name || model.model_id;
            if (model.dimension) {
                option.textContent += ` (${model.dimension})`;
            }
            modelSelect.appendChild(option);
        });
    } catch (error) {
        console.error("Error loading models:", error);
        showError('Ошибка загрузки моделей: ' + error.message);
    }
}

function getModelNameById(modelId) {
    const model = availableModels.find(m => m.model_id === modelId);
    return model ? (model.model_name || model.model_id) : modelId;
}

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

    // Lock button and show progress
    isUploading = true;
    uploadBtn.disabled = true;
    uploadBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Загрузка...';
    
    // Show progress bar
    document.getElementById('uploadProgressContainer').classList.remove('hidden');
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
        currentJobId = currentJobId.replace("/", "");
                
        document.getElementById('uploadResults').innerHTML = `
            <div class="alert alert-info">
                <h4 class="alert-heading">Загрузка начата</h4>
                <p><strong>ID задачи:</strong> ${currentJobId}</p>
                <p><strong>Примерное время:</strong> ${data.estimated_time_min || 'неизвестно'} минут</p>
            </div>
        `;
        
        // Start status checking
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

            // опрос каждые 5 секунд
            setTimeout(checkUploadStatus, 5000);
        } 
        else if (status.status === 'completed') {
            updateUploadProgress(100, 'Загрузка завершена! Получение результатов...');
            await getUploadResults(status.result_url);
            resetUploadButton();
        }
        
    } catch (error) {
        console.error("Status check error:", error);
        showError('Ошибка проверки статуса: ' + error.message);
        resetUploadButton();
    }
}

function updateUploadProgress(percent, message) {
    const progressBar = document.getElementById('uploadProgressBar');
    const statusElement = document.getElementById('uploadStatus');
    
    progressBar.style.width = percent + '%';
    progressBar.setAttribute('aria-valuenow', percent);
    statusElement.textContent = message;
}

// Reset upload button
function resetUploadButton() {
    const uploadBtn = document.getElementById('uploadBtn');
    uploadBtn.disabled = false;
    uploadBtn.innerHTML = '<i class="bi bi-cloud-upload"></i> Загрузить корпус текстов';
    isUploading = false;
}

async function getUploadResults(resultUrl) {
    try {
        console.log("Making request to /api/result with resultUrl:", resultUrl);
        
        const response = await fetch("/api/result", {
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
        
        return await processSuccessfulResponse(response);
        
    } catch (error) {
        console.error("Error in getUploadResults:", error);
        showError('Ошибка получения результатов загрузки: ' + error.message);
    }
}

async function processSuccessfulResponse(response) {
    const results = await response.json();
    const modelId = document.getElementById('modelSelect').value;
    console.log(results);
    
    await saveCorpusToProxy(results.corpus_id, modelSelect.value, results.file_count);
    saveCorpusToHistory(results.corpus_id, modelSelect.value, results.file_count);
    
    // Показываем результаты
    document.getElementById('uploadResults').innerHTML = `
        <div class="alert alert-success">
            <h4 class="alert-heading">✅ Загрузка завершена</h4>
            <p><strong>ID корпуса:</strong> ${results.corpus_id}</p>
            <p><strong>Модель:</strong> ${getModelNameById(modelId)}</p>
            <p><strong>Файлов:</strong> ${results.file_count}</p>
            <p class="mb-0"><small>Корпус успешно загружен и проиндексирован</small></p>
        </div>
    `;
    
    return results;
}

function saveCorpusToHistory(corpusId,modelId, files) {
    const history = JSON.parse(localStorage.getItem('corpusHistory')) || [];
    
    const existingIndex = history.findIndex(item => item.id === corpusId);
    
    const corpusInfo = {
        id: corpusId,
        model: modelId,
        files: files,
        date: new Date().toISOString()
    };
    
    if (existingIndex >= 0) {
        history[existingIndex] = corpusInfo;
    } else {
        history.unshift(corpusInfo);
    }
    
    localStorage.setItem('corpusHistory', JSON.stringify(history));
}

function showError(message) {
    const errorContainer = document.getElementById('errorContainer');
    
    const alertDiv = document.createElement('div');
    alertDiv.className = 'alert alert-danger alert-dismissible fade show';
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    errorContainer.appendChild(alertDiv);
    
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.classList.remove('show');
            setTimeout(() => alertDiv.remove(), 150);
        }
    }, 5000);
}

async function saveCorpusToProxy(corpusId, modelId, files) {
    try {
        const corpusInfo = {
            id: corpusId,
            model: modelId,
            files: files,
            date: new Date().toISOString()
        };

        const response = await fetch(`/corpus-history`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(corpusInfo)
        });

        if (!response.ok) {
            throw new Error(`Ошибка сервера: ${response.status}`);
        }
        
        console.log('Корпус успешно сохранен в истории прокси');
    } catch (error) {
        console.error('Ошибка при сохранении в прокси:', error);
    }
}



