// Конфигурация API сервисов для различных операций обработки текста
const API_CONFIG = {
    // URL сервиса для очистки текста от шума и нормализации
    CLEANER_SERVICE: 'https://django-server-1.example.com/api/clean_text/',
    // URL сервиса для создания векторных представлений текста (эмбеддингов)
    EMBEDDING_SERVICE: 'https://django-server-2.example.com/api/embeddings/',
    // URL сервиса для расчета схожести между текстами
    SIMILARITY_SERVICE: 'https://django-server-2.example.com/api/similarity/',
    // URL сервиса для семантического анализа текста
    SEMANTIC_SERVICE: 'https://django-server-3.example.com/api/semantic_analysis/',

    // Настройки CORS для кросс-доменных запросов
    CORS_OPTIONS: {
        credentials: 'include', // Включение отправки куки и авторизационных заголовков
        headers: {
            'Content-Type': 'application/json', // Тип содержимого запроса
            'X-Requested-With': 'XMLHttpRequest' // Заголовок для идентификации AJAX запросов
        }
    }
};