/**
 * Конфигурация сервера
 * Все настройки сервера вынесены в один модуль для удобства управления
 */

const config = {
  // Порт сервера
  PORT: process.env.PORT || 4000,
  
  // Путь к общему хранилищу данных
  SHARED_DATA_PATH: process.env.SHARED_DATA_PATH || "/app/shared_data",
  
  // URL бэкенд-сервиса
  BACKEND_SERVICE_URL: process.env.BACKEND_SERVICE_URL || 'http://back-service:3000/api',
  
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
