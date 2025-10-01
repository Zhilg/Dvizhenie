const BASE_URL = "/api";
let availableModels = [];

// Initialize main page
document.addEventListener('DOMContentLoaded', async () => {
    await loadModels();
    updateUI();
    setupEventListeners();
});

function setupEventListeners() {
    document.getElementById('searchBtn').addEventListener('click', searchDocuments);
    document.getElementById('corpusId').addEventListener('change', updateCorpusInfo);
    document.getElementById('showHistoryBtn').addEventListener('click', showHistoryModal);
}

async function loadModels() {
    try {
        const response = await fetch(`${BASE_URL}/models`);
        if (response.ok) {
            availableModels = await response.json();
        }
    } catch (error) {
        console.error("Error loading models:", error);
    }
}

async function updateUI() {
    try {
        corpusHistory = await loadCorpusHistory();
        
        if (corpusHistory.length > 0) {
            document.getElementById('noCorpusMessage').style.display = 'none';
            document.getElementById('searchSection').style.display = 'block';
            loadCorpusDropdown();
        } else {
            document.getElementById('noCorpusMessage').style.display = 'block';
            document.getElementById('searchSection').style.display = 'none';
        }
    } catch (error) {
        console.error('Ошибка при обновлении UI:', error);
        corpusHistory = JSON.parse(localStorage.getItem('corpusHistory')) || [];
        if (corpusHistory.length > 0) {
            loadCorpusDropdown();
        }
    }
    
    document.getElementById('uploadSection').style.display = 'none';
}

function getModelNameById(modelId) {
    const model = availableModels.find(m => m.model_id === modelId);
    return model ? (model.model_name || model.model_id) : modelId;
}

// Load corpus dropdown
function loadCorpusDropdown() {
    const history = JSON.parse(localStorage.getItem('corpusHistory')) || [];
    const corpusSelect = document.getElementById('corpusId');
    
    const currentValue = corpusSelect.value;
    corpusSelect.innerHTML = '<option value="">-- Выберите корпус --</option>';
    
    history.forEach(corpus => {
        const option = document.createElement('option');
        option.value = corpus.id;
        option.textContent = `${corpus.id} (${getModelNameById(corpus.model) || 'неизвестна'}, файлов: ${corpus.files || '?'})`;
        corpusSelect.appendChild(option);
    });
    
    if (currentValue && history.some(c => c.id === currentValue)) {
        corpusSelect.value = currentValue;
        updateCorpusInfo();
    }
}

// Update corpus info display
function updateCorpusInfo() {
    const corpusId = document.getElementById('corpusId').value;
    const corpusInfoElement = document.getElementById('corpusInfo');
    
    if (!corpusId) {
        corpusInfoElement.textContent = '';
        return;
    }
    
    const history = JSON.parse(localStorage.getItem('corpusHistory')) || [];
    const corpus = history.find(item => item.id === corpusId);
    
    if (corpus) {
        corpusInfoElement.innerHTML = `
            <strong>Модель:</strong> ${getModelNameById(corpus.model) || 'неизвестна'} | 
            <strong>Файлов:</strong> ${corpus.files || 'неизвестно'} | 
            <strong>Загружен:</strong> ${new Date(corpus.date).toLocaleString()}
        `;
    } else {
        corpusInfoElement.textContent = 'Информация о корпусе недоступна';
    }
}

// Search function
async function searchDocuments() {
    const corpusId = document.getElementById('corpusId').value;
    const searchQuery = document.getElementById('searchQuery');
    const resultAmount = document.getElementById('resultAmount').value;
    const searchBtn = document.getElementById('searchBtn');
    
    if (!corpusId) {
        alert('Пожалуйста, выберите корпус');
        return;
    }

    if (!searchQuery.value.trim()) {
        alert('Пожалуйста, введите поисковый запрос');
        return;
    }

    // Get model info from corpus history
    const history = JSON.parse(localStorage.getItem('corpusHistory')) || [];
    const corpusInfo = history.find(item => item.id === corpusId);
    
    if (!corpusInfo || !corpusInfo.model) {
        alert('Не удалось определить модель для выбранного корпуса');
        return;
    }

    // Show loading state
    searchBtn.disabled = true;
    searchBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Поиск...';

    try {
        const response = await fetch(`${BASE_URL}/semantic/search`, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'x-corpus-id': corpusId,
                'x-model-id': corpusInfo.model,
                'x-result-amount': resultAmount
            },
            body: searchQuery.value
        });

        if (!response.ok) throw new Error(await response.text());

        const results = await response.json();
        displaySearchResults(results);
        
    } catch (error) {
        console.error("Search error:", error);
        alert('Ошибка поиска: ' + error.message);
    } finally {
        // Reset button
        searchBtn.disabled = false;
        searchBtn.innerHTML = '<i class="bi bi-search"></i> Найти';
    }
}

// Display search results
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
    document.getElementById('resultsContainer').classList.remove('hidden');
    
    // Scroll to results
    document.getElementById('resultsContainer').scrollIntoView({ behavior: 'smooth' });
}

// Show history modal
function showHistoryModal() {
    const history = JSON.parse(localStorage.getItem('corpusHistory')) || [];
    const modalBody = document.getElementById('historyModalBody');
    
    if (history.length === 0) {
        modalBody.innerHTML = '<p>История корпусов пуста</p>';
    } else {
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
                                <td>${getModelNameById(corpus.model) || 'неизвестна'}</td>
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
        
        // Add event listeners to use buttons
        document.querySelectorAll('.use-corpus-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                document.getElementById('corpusId').value = this.getAttribute('data-id');
                bootstrap.Modal.getInstance(document.getElementById('historyModal')).hide();
                updateCorpusInfo();
            });
        });
    }
    
    // Show modal
    new bootstrap.Modal(document.getElementById('historyModal')).show();
}

async function loadCorpusHistory() {
    try {
        const response = await fetch(`/corpus-history`);
        
        if (!response.ok) {
            if (response.status === 404) {
                return [];
            }
            throw new Error(`Ошибка сервера: ${response.status}`);
        }
        
        const history = await response.json();
        return history;
    } catch (error) {
        console.error('Ошибка загрузки истории из прокси:', error);
        // Fallback на localStorage
        return JSON.parse(localStorage.getItem('corpusHistory')) || [];
    }
}