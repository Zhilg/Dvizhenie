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
// Базовый URL для API запросов
const BASE_URL = "/api";
// Список доступных моделей для поиска
let availableModels = [];

// Инициализация главной страницы поиска при загрузке DOM
document.addEventListener('DOMContentLoaded', async () => {
    await loadModels(); // Загрузка списка моделей
    updateUI(); // Обновление интерфейса
    setupEventListeners(); // Настройка обработчиков событий
});

// Настройка обработчиков событий для элементов интерфейса
function setupEventListeners() {
    document.getElementById('searchBtn').addEventListener('click', searchDocuments); // Кнопка поиска
    document.getElementById('corpusId').addEventListener('change', updateCorpusInfo); // Выбор корпуса
    document.getElementById('showHistoryBtn').addEventListener('click', showHistoryModal); // Показ истории
}

// Загрузка списка доступных моделей с сервера
async function loadModels() {
    try {
        const response = await fetch(`${BASE_URL}/models`);
        if (response.ok) {
            availableModels = await response.json(); // Сохранение списка моделей
        }
    } catch (error) {
        console.error("Error loading models:", error);
    }
}

// Обновление пользовательского интерфейса в зависимости от наличия корпусов
async function updateUI() {
    try {
        corpusHistory = await loadCorpusHistory(); // Загрузка истории корпусов

        if (corpusHistory.length > 0) {
            // Если есть корпуса, показываем секцию поиска и скрываем сообщение об отсутствии
            document.getElementById('noCorpusMessage').style.display = 'none';
            document.getElementById('searchSection').style.display = 'block';
            loadCorpusDropdown(); // Загружаем выпадающий список корпусов
        } else {
            // Если корпусов нет, показываем сообщение и скрываем поиск
            document.getElementById('noCorpusMessage').style.display = 'block';
            document.getElementById('searchSection').style.display = 'none';
        }
    } catch (error) {
        console.error('Ошибка при обновлении UI:', error);
        // Fallback на данные из localStorage при ошибке
        corpusHistory = JSON.parse(localStorage.getItem('corpusHistory')) || [];
        if (corpusHistory.length > 0) {
            loadCorpusDropdown();
        }
    }

    // Скрываем секцию загрузки (не используется на странице поиска)
    document.getElementById('uploadSection').style.display = 'none';
}

// Получение названия модели по её ID
function getModelNameById(modelId) {
    const model = availableModels.find(m => m.model_id === modelId);
    return model ? (model.model_name || model.model_id) : modelId; // Возвращаем название или ID если название не найдено
}

// Загрузка выпадающего списка корпусов из истории
function loadCorpusDropdown() {
    const history = JSON.parse(localStorage.getItem('corpusHistory')) || [];
    const corpusSelect = document.getElementById('corpusId');

    const currentValue = corpusSelect.value; // Сохраняем текущее значение
    corpusSelect.innerHTML = '<option value="">-- Выберите корпус --</option>'; // Очищаем список
    
    // Добавляем опции для каждого корпуса из истории
    history.forEach(corpus => {
        console.log(corpus);
        const option = document.createElement('option');
        option.value = corpus.id;
        option.textContent = `${corpus.name} ID: ${corpus.id} (${getModelNameById(corpus.model) || 'неизвестна'}, файлов: ${corpus.files || '?'})`;
        corpusSelect.appendChild(option);
    });

    // Восстанавливаем предыдущий выбор если он все еще доступен
    if (currentValue && history.some(c => c.id === currentValue)) {
        corpusSelect.value = currentValue;
        updateCorpusInfo(); // Обновляем информацию о выбранном корпусе
    }
}

// Обновление отображения информации о выбранном корпусе
function updateCorpusInfo() {
    const corpusId = document.getElementById('corpusId').value;
    const corpusInfoElement = document.getElementById('corpusInfo');

    if (!corpusId) {
        corpusInfoElement.textContent = ''; // Очищаем информацию если корпус не выбран
        return;
    }

    const history = JSON.parse(localStorage.getItem('corpusHistory')) || [];
    const corpus = history.find(item => item.id === corpusId); // Ищем информацию о корпусе

    if (corpus) {
        // Отображаем детальную информацию о корпусе
        corpusInfoElement.innerHTML = `
            <strong>Модель:</strong> ${getModelNameById(corpus.model) || 'неизвестна'} |
            <strong>Файлов:</strong> ${corpus.files || 'неизвестно'} |
            <strong>Загружен:</strong> ${formatDate(corpus.date)}
        `;
    } else {
        corpusInfoElement.textContent = 'Информация о корпусе недоступна';
    }
}

// Основная функция поиска документов в корпусе
async function searchDocuments() {
    const corpusId = document.getElementById('corpusId').value;
    const searchQuery = document.getElementById('searchQuery');
    const resultAmount = document.getElementById('resultAmount').value;
    const searchBtn = document.getElementById('searchBtn');

    // Валидация входных данных
    if (!corpusId) {
        alert('Пожалуйста, выберите корпус');
        return;
    }

    if (!searchQuery.value.trim()) {
        alert('Пожалуйста, введите поисковый запрос');
        return;
    }

    // Получение информации о модели из истории корпусов
    const history = JSON.parse(localStorage.getItem('corpusHistory')) || [];
    const corpusInfo = history.find(item => item.id === corpusId);

    if (!corpusInfo || !corpusInfo.model) {
        alert('Не удалось определить модель для выбранного корпуса');
        return;
    }

    // Отображение состояния загрузки
    searchBtn.disabled = true;
    searchBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Поиск...';

    try {
        // Отправка запроса на семантический поиск
        const response = await fetch(`${BASE_URL}/semantic/search`, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'x-corpus-id': corpusId, // ID корпуса для поиска
                'x-model-id': corpusInfo.model, // ID модели
                'x-result-amount': resultAmount // Количество результатов
            },
            body: searchQuery.value // Поисковый запрос
        });

        if (!response.ok) throw new Error(await response.text());

        const results = await response.json();
        displaySearchResults(results); // Отображение результатов поиска

    } catch (error) {
        console.error("Search error:", error);
        alert('Ошибка поиска: ' + error.message);
    } finally {
        // Восстановление состояния кнопки
        searchBtn.disabled = false;
        searchBtn.innerHTML = '<i class="bi bi-search"></i> Найти';
    }
}

function displaySearchResults(results) {
    const searchResults = document.getElementById('searchResults');
    let html = `
        <div class="table-responsive">
            <table class="table table-striped table-hover">
                <thead>
                    <tr>
                        <th style="width: 25%; min-width: 200px;">Документ</th>
                        <th style="width: 60%;">Фрагмент текста</th>
                        <th style="width: 15%; min-width: 100px;">Сходство</th>
                    </tr>
                </thead>
                <tbody>
    `;

    // Формирование строк таблицы для каждого результата
    results.results.forEach(result => {
        html += `
            <tr>
                <td>
                    <div class="file-info">
                        <strong class="file-name">${result.file_id}</strong>
                        ${result.fragment ? `<div class="fragment-info text-muted">${result.fragment}</div>` : ''}
                    </div>
                </td>
                <td class="preview-text">${result.preview || ''}</td>
                <td>
                    <span class="similarity-badge">${result.score.toFixed(4)}</span>
                </td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
        <div class="mt-3">
            <p class="mb-0 text-muted">Найдено результатов: ${results.results.length}</p>
        </div>
    `;

    searchResults.innerHTML = html;
    document.getElementById('resultsContainer').classList.remove('hidden');

    // Добавляем CSS для правильного переноса текста
    const style = document.createElement('style');
    style.textContent = `
        .file-info {
            max-width: 100%;
            word-wrap: break-word;
            word-break: break-word;
        }
        .file-name {
            font-size: 0.9rem;
            line-height: 1.2;
            word-wrap: break-word;
            word-break: break-word;
            white-space: normal;
        }
        .fragment-info {
            font-size: 0.8rem;
            margin-top: 4px;
            word-wrap: break-word;
            word-break: break-word;
            white-space: normal;
        }
        .preview-text {
            font-size: 0.9rem;
            line-height: 1.4;
            text-align: justify;
            word-wrap: break-word;
            word-break: break-word;
            white-space: normal;
        }
        .similarity-badge {
            display: inline-block;
            padding: 4px 8px;
            background-color: #e9ecef;
            border-radius: 4px;
            font-size: 0.85rem;
            font-weight: bold;
            white-space: nowrap;
        }
        .table th {
            border-top: none;
            font-weight: 600;
        }
        .table td {
            vertical-align: top;
        }
    `;
    document.head.appendChild(style);

    // Прокрутка страницы к результатам
    document.getElementById('resultsContainer').scrollIntoView({ behavior: 'smooth' });
}

// Отображение модального окна с историей корпусов
function showHistoryModal() {
    const history = JSON.parse(localStorage.getItem('corpusHistory')) || [];
    const modalBody = document.getElementById('historyModalBody');

    if (history.length === 0) {
        modalBody.innerHTML = '<p>История корпусов пуста</p>';
    } else {
        // Формирование таблицы с историей корпусов
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
                                <td>${formatDate(corpus.date)}</td>
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

        // Добавление обработчиков событий для кнопок "Использовать"
        document.querySelectorAll('.use-corpus-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                document.getElementById('corpusId').value = this.getAttribute('data-id'); // Выбор корпуса
                bootstrap.Modal.getInstance(document.getElementById('historyModal')).hide(); // Закрытие модального окна
                updateCorpusInfo(); // Обновление информации о корпусе
            });
        });
    }

    // Показ модального окна
    new bootstrap.Modal(document.getElementById('historyModal')).show();
}

// Загрузка истории корпусов с сервера с fallback на localStorage
async function loadCorpusHistory() {
    try {
        const response = await fetch(`/corpus-history`);

        if (!response.ok) {
            if (response.status === 404) {
                return []; // Возвращаем пустой массив если эндпоинт не найден
            }
            throw new Error(`Ошибка сервера: ${response.status}`);
        }

        const history = await response.json();
        return history;
    } catch (error) {
        console.error('Ошибка загрузки истории из прокси:', error);
        // Fallback на данные из localStorage при ошибке
        return JSON.parse(localStorage.getItem('corpusHistory')) || [];
    }
}