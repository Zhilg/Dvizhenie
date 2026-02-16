/**
 * Конфигурация сервера
 * Все настройки сервера вынесены в один модуль для удобства управления
 */

const config = {
  // Порт сервера
  PORT: process.env.PORT || 4000,

  // Путь к общему хранилищу данных
  SHARED_DATA_PATH: process.env.SHARED_DATA_PATH || "/app/shared_data",

  // URLs всех трех бекэндов
  BACKENDS: {
    BACK: 'http://back-service:3000/api',
  },

  // Бэкенд по умолчанию (можно менять через API или переменную окружения)
  DEFAULT_BACKEND: process.env.DEFAULT_BACKEND || 'cnii',

  // URL бэкенд-сервиса (для обратной совместимости)
  get BACKEND_SERVICE_URL() {
    const backend = this.currentBackend || this.DEFAULT_BACKEND;
    return this.BACKENDS[backend] || this.BACKENDS[this.DEFAULT_BACKEND];
  },

  // Текущий выбранный бекэнд (устанавливается динамически)
  currentBackend: null,

  // Настройки Express
  express: {
    jsonLimit: 'Infinity',
    textLimit: 'Infinity'
  },

  // Настройки по умолчанию
  defaults: {
    modelId: 'default-model',
    ttlHours: 0,
    resultAmount: 5
  },

  // Таймауты для HTTP-запросов (мс)
  timeouts: {
    default: 10000
  }
};

module.exports = config;
