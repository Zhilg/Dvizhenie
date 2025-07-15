const API_CONFIG = {
    CLEANER_SERVICE: 'https://django-server-1.example.com/api/clean_text/',
    EMBEDDING_SERVICE: 'https://django-server-2.example.com/api/embeddings/',
    SIMILARITY_SERVICE: 'https://django-server-2.example.com/api/similarity/',
    SEMANTIC_SERVICE: 'https://django-server-3.example.com/api/semantic_analysis/',
    
    // Настройки CORS (если нужно)
    CORS_OPTIONS: {
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
        }
    }
};