/**
 * Модуль для управления выбором бекэнда компании
 * Позволяет переключаться между CNII, Peredovie и Kazan
 */

class BackendSelector {
    constructor() {
        this.currentBackend = localStorage.getItem('selected-backend') || 'cnii';
        this.backends = [];
        this.initialized = false;
    }

    /**
     * Инициализация селектора
     */
    async init() {
        if (this.initialized) return;

        try {
            // Получаем список доступных бекэндов
            const response = await fetch('/api/backends');
            const data = await response.json();

            this.backends = data.backends;
            this.currentBackend = localStorage.getItem('selected-backend') || data.current;

            this.createSelectorUI();
            this.setupEventListeners();
            this.initialized = true;

            console.log('Backend Selector initialized:', this.currentBackend);
        } catch (error) {
            console.error('Failed to initialize backend selector:', error);
        }
    }

    /**
     * Создание UI элемента для выбора бекэнда
     */
    createSelectorUI() {
        // Создаем контейнер для селектора
        const selectorContainer = document.createElement('div');
        selectorContainer.className = 'backend-selector-container';
        selectorContainer.innerHTML = `
            <div class="backend-selector">
                <label for="backend-select">Компания:</label>
                <select id="backend-select" class="backend-select">
                    ${this.backends.map(backend => `
                        <option value="${backend.id}" ${backend.id === this.currentBackend ? 'selected' : ''}>
                            ${backend.name}
                        </option>
                    `).join('')}
                </select>
            </div>
        `;

        // Добавляем в начало body или в header
        const header = document.querySelector('h1') || document.querySelector('.container');
        if (header) {
            header.parentNode.insertBefore(selectorContainer, header);
        } else {
            document.body.insertBefore(selectorContainer, document.body.firstChild);
        }
    }

    /**
     * Настройка обработчиков событий
     */
    setupEventListeners() {
        const select = document.getElementById('backend-select');
        if (select) {
            select.addEventListener('change', (e) => {
                this.switchBackend(e.target.value);
            });
        }
    }

    /**
     * Переключение на другой бекэнд
     */
    switchBackend(backendId) {
        console.log(`Switching backend from ${this.currentBackend} to ${backendId}`);

        this.currentBackend = backendId;
        localStorage.setItem('selected-backend', backendId);

        // Обновляем индикатор
        this.updateIndicator();

        // Показываем уведомление
        this.showNotification(`Переключено на бекэнд: ${this.getBackendName(backendId)}`);

        // Генерируем событие для других модулей
        window.dispatchEvent(new CustomEvent('backend-changed', {
            detail: { backend: backendId }
        }));
    }

    /**
     * Получить имя бекэнда по ID
     */
    getBackendName(backendId) {
        const backend = this.backends.find(b => b.id === backendId);
        return backend ? backend.name : backendId;
    }

    /**
     * Получить текущий выбранный бекэнд
     */
    getCurrentBackend() {
        return this.currentBackend;
    }

    /**
     * Обновление визуального индикатора
     */
    updateIndicator() {
        const indicator = document.querySelector('.backend-indicator');
        if (indicator) {
            indicator.classList.add('pulse');
            setTimeout(() => {
                indicator.classList.remove('pulse');
            }, 600);
        }
    }

    /**
     * Показать уведомление пользователю
     */
    showNotification(message) {
        // Создаем уведомление
        const notification = document.createElement('div');
        notification.className = 'backend-notification';
        notification.textContent = message;

        document.body.appendChild(notification);

        // Анимация появления
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);

        // Удаление через 3 секунды
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 3000);
    }

    /**
     * Добавить заголовок бекэнда к запросу
     */
    addBackendHeader(headers = {}) {
        return {
            ...headers,
            'x-backend-company': this.currentBackend
        };
    }
}

// Создаем глобальный экземпляр
window.backendSelector = new BackendSelector();

/**
 * Глобальная helper-функция для API запросов с автоматическим добавлением заголовка бэкенда
 * @param {string} url - URL для запроса
 * @param {object} options - Опции fetch (method, headers, body и т.д.)
 * @returns {Promise} - Promise с результатом fetch
 */
window.apiFetch = function(url, options = {}) {
    // Создаем копию options, чтобы не мутировать оригинал
    const fetchOptions = { ...options };

    // Добавляем или объединяем headers
    if (window.backendSelector) {
        fetchOptions.headers = window.backendSelector.addBackendHeader(options.headers || {});
    } else {
        fetchOptions.headers = options.headers || {};
    }

    // Выполняем запрос с обновленными headers
    return fetch(url, fetchOptions);
};

// Инициализируем при загрузке страницы
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.backendSelector.init();
    });
} else {
    window.backendSelector.init();
}

// Экспортируем для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BackendSelector;
}
