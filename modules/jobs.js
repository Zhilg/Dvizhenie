const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * Модуль для управления асинхронными задачами
 * Обеспечивает поллинг задач, обработку результатов и управление очередью задач
 */

class JobManager {
  constructor(backendServiceUrl, corpusDB, sharedDataPath) {
    this.backendServiceUrl = backendServiceUrl;
    this.corpusDB = corpusDB;
    this.sharedDataPath = sharedDataPath || './shared_data';
    this.jobsFilePath = path.join(this.sharedDataPath, 'jobs_database.json');
    this.jobsDB = { jobs: [] };
    this.pollQueue = new Map(); // Для отслеживания задач загрузки
  }

  /**
   * Загружает базу данных job'ов из файла
   * @returns {Promise<Object>} загруженные данные
   */
  async loadJobsFromFile() {
    try {
      if (fs.existsSync(this.jobsFilePath)) {
        const data = fs.readFileSync(this.jobsFilePath, 'utf8');
        const parsedData = JSON.parse(data);
        console.log(`База данных job'ов загружена из файла ${this.jobsFilePath}: ${parsedData.jobs.length} задач`);
        return parsedData;
      } else {
        console.log(`Файл базы данных job'ов ${this.jobsFilePath} не существует, используются данные по умолчанию`);
        return { jobs: [] };
      }
    } catch (error) {
      console.error(`Ошибка загрузки базы данных job'ов из ${this.jobsFilePath}:`, error);
      return { jobs: [] };
    }
  }

  /**
   * Сохраняет базу данных job'ов в файл
   * @returns {Promise<boolean>} успешность операции
   */
  async saveJobsToFile() {
    try {
      // Убеждаемся, что директория существует
      const dir = path.dirname(this.jobsFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Записываем данные в файл
      fs.writeFileSync(this.jobsFilePath, JSON.stringify(this.jobsDB, null, 2), 'utf8');
      console.log(`База данных job'ов сохранена в файл ${this.jobsFilePath}: ${this.jobsDB.jobs.length} задач`);
      return true;
    } catch (error) {
      console.error(`Ошибка сохранения базы данных job'ов в файл ${this.jobsFilePath}:`, error);
      return false;
    }
  }

  /**
   * Инициализирует базу данных job'ов из файла
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      this.jobsDB = await this.loadJobsFromFile();
      console.log('База данных job\'ов успешно инициализирована');
    } catch (error) {
      console.error('Ошибка инициализации базы данных job\'ов:', error);
      this.jobsDB = { jobs: [] };
    }
  }

  /**
   * Сохраняет задачу в базу данных
   * @param {Object} jobData - данные задачи
   * @returns {Promise<boolean>} успешность операции
   */
  async saveJobToDB(jobData) {
    try {
      if (!jobData.created_at) {
        jobData.created_at = new Date().toISOString();
      }

      this.jobsDB.jobs.push(jobData);
      console.log(`Задача сохранена в БД: ${jobData.job_id} (тип: ${jobData.type})`);

      // Сохраняем в файл
      await this.saveJobsToFile();

      return true;
    } catch (error) {
      console.error('Ошибка сохранения задачи в БД:', error);
      return false;
    }
  }

  /**
   * Получает задачу из базы данных по ID
   * @param {string} jobId - ID задачи
   * @returns {Object|null} найденная задача или null
   */
  getJobById(jobId) {
    return this.jobsDB.jobs.find(j => j.job_id === jobId) || null;
  }

  /**
   * Обновляет статус задачи в базе данных
   * @param {string} jobId - ID задачи
   * @param {Object} statusData - данные статуса
   */
  async updateJobStatus(jobId, statusData) {
    const jobIndex = this.jobsDB.jobs.findIndex(job => job.job_id === jobId);
    if (jobIndex !== -1) {
      Object.assign(this.jobsDB.jobs[jobIndex], statusData);
      // Сохраняем в файл
      await this.saveJobsToFile();
    }
  }

  /**
   * Функция построения фоллбэк URL
   * @param {string} originalUrl - исходный URL
   * @returns {Promise<string>} URL фоллбэка
   */
  async buildFallbackUrl(originalUrl) {
    try {
        if (!originalUrl || typeof originalUrl !== 'string') {
            throw new Error('Неверный resultUrl предоставлен');
        }
        
        console.log("Построение фоллбэк URL из:", originalUrl);
        
        // Если это HTTP ссылка, заменяем домен
        if (originalUrl.startsWith('http')) {
            try {
                const urlObj = new URL(originalUrl);
                const fallbackUrl = `http://back-service:3000${urlObj.pathname}${urlObj.search}${urlObj.hash}`;
                console.log("Построен HTTP фоллбэк URL:", fallbackUrl);
                return fallbackUrl;
            } catch (e) {
                console.error('Ошибка парсинга URL:', e);
                // Если URL невалидный, считаем что это endpoint
                const fallbackUrl = `http://back-service:3000${originalUrl.startsWith('/') ? '' : '/'}${originalUrl}`;
                console.log("Построен фоллбэк из невалидного URL:", fallbackUrl);
                return fallbackUrl;
            }
        }
        
        // Если это относительный путь
        const fallbackUrl = `http://back-service:3000${originalUrl.startsWith('/') ? '' : '/'}${originalUrl}`;
        console.log("Построен фоллбэк URL относительного пути:", fallbackUrl);
        return fallbackUrl;
        
    } catch (error) {
        console.error('Ошибка в buildFallbackUrl:', error);
        throw error;
    }
  }

  /**
   * Обработка завершенной задачи загрузки и сохранение в историю корпусов
   * @param {string} jobId - ID задачи
   * @param {Object} status - статус задачи
   * @returns {Promise<void>}
   */
  async processCompletedUploadJob(jobId, status) {
    try {
      console.log(`=== DEBUG: Обработка завершенной задачи загрузки ${jobId} ===`);
      
      // Получаем данные задачи из jobsDB для поиска информации о корпусе
      const job = this.getJobById(jobId);
      console.log('=== DEBUG: Найдены данные задачи ===');
      console.log('Задача найдена:', !!job);
      if (job) {
        console.log('Данные задачи:', JSON.stringify(job, null, 2));
        console.log('Имя корпуса в задаче:', job.corpus_name);
        console.log('Тип имени корпуса:', typeof job.corpus_name);
        console.log('Длина имени корпуса:', job.corpus_name ? job.corpus_name.length : 'Н/Д');
      } else {
        console.log('Задача не найдена в jobsDB');
        console.log('Всего задач в БД:', this.jobsDB.jobs.length);
        console.log('Доступные ID задач:', this.jobsDB.jobs.map(j => j.job_id));
      }
      console.log('=== КОНЕЦ DEBUG ===');
      
      if (!job) {
        console.error(`Задача ${jobId} не найдена в jobsDB`);
        return;
      }

      // Используем ту же логику построения URL, что и в существующем /api/result
      const resultUrl = status.result_url;
      let response;
      
      try {
        // Первая попытка - прямой запрос
        response = await axios.get(resultUrl, { 
          timeout: 10000,
          validateStatus: () => true
        });
        console.log("Статус основного запроса:", response.status);
      } catch (primaryError) {
        console.log("Основной запрос завершился с ошибкой:", primaryError.message);
        // Используем ту же логику фоллбэка, что и /api/result
        if (primaryError.code === 'ENOTFOUND' || primaryError.code === 'ECONNREFUSED' || 
            primaryError.code === 'ECONNABORTED' || primaryError.code === 'ETIMEDOUT' || 
            primaryError.code === 'ERR_INVALID_URL' || primaryError.code === 'EAI_AGAIN') {
            
          console.log("Обнаружена сетевая ошибка, пробуем фоллбэк...");
          const fallbackUrl = await this.buildFallbackUrl(resultUrl);
          console.log("URL фоллбэка:", fallbackUrl);
          
          response = await axios.get(fallbackUrl, {
            timeout: 10000,
            validateStatus: () => true
          });
          console.log("Статус запроса фоллбэка:", response.status);
        } else {
          throw primaryError;
        }
      }

      // Если получили HTTP ошибку, генерируем исключение
      if (response.status >= 400) {
        throw new Error(`Не удалось получить результаты: ${response.statusText}`);
      }

      const results = response.data;
      console.log('Получены результаты загрузки:', results);

      // Сохраняем оригинальный путь корпуса ДО обновления job данных
      const originalCorpusPath = job.corpus_path;
      
      // Обновляем jobsDB с правильным corpus_path из результатов бэкенда
      const jobIndex = this.jobsDB.jobs.findIndex(j => j.job_id === jobId);
      if (jobIndex !== -1 && results.corpus_path) {
        this.jobsDB.jobs[jobIndex].corpus_path = results.corpus_path;
        console.log(`Обновлена задача ${jobId} с правильным corpus_path: ${results.corpus_path}`);
      }

      // Обновляем количество файлов в корпусе
      // Используем оригинальный путь для поиска в БД
      const corpusPathToUpdate = originalCorpusPath || `/${job.corpusId}`;
      console.log('Используем путь для обновления БД:', corpusPathToUpdate);
      const updated = await this.corpusDB.updateCorpusFileCount(
        corpusPathToUpdate,
        results.corpus_id,
        results.file_count
      );
      
      if (!updated) {
        // Fallback: создаем новую запись, если существующая не найдена
        const corpusInfo = {
          id: results.corpus_id,
          name: job.corpus_name || 'Неизвестно',
          model: job.model_id,
          files: results.file_count,
          corpus_path: `/${job.corpusId}`,
          date: new Date().toISOString()
        };
        await this.corpusDB.saveCorpus(corpusInfo);
        console.log(`Корпус ${results.corpus_id} сохранен в историю на стороне сервера (fallback)`);
        console.log(`Корпус ${results.corpus_id} автоматически сохранен в историю на стороне сервера`);
        console.log(`Имя корпуса: "${corpusInfo.name}", Файлов: ${corpusInfo.files}, Модель: ${corpusInfo.model}`);
        console.log(`Корпус ${results.corpus_id} автоматически сохранен в историю`);
      }
      
    } catch (error) {
      console.error(`Ошибка обработки завершенной задачи загрузки ${jobId}:`, error);
    }
  }

  /**
   * Серверная функция опроса для задач загрузки
   * @param {string} jobId - ID задачи
   * @param {string} corpusName - имя корпуса
   * @param {string} modelId - ID модели
   * @param {string} corpusId - ID корпуса
   * @returns {Promise<void>}
   */
  async pollUploadJob(jobId, corpusName, modelId, corpusId) {
    try {
      console.log(`=== DEBUG: Запуск серверного опроса для задачи загрузки: ${jobId} ===`);
      console.log('Полученные параметры:');
      console.log('  jobId:', jobId);
      console.log('  corpusName:', corpusName);
      console.log('  modelId:', modelId);
      console.log('=== КОНЕЦ DEBUG ===');
      
      const pollJob = async () => {
        try {
          // Проверяем статус задачи от бэкенда
          const response = await axios.get(`${this.backendServiceUrl}/jobs/${jobId}`);
          const status = response.data;

          // Обновляем jobsDB
          const jobIndex = this.jobsDB.jobs.findIndex(job => job.job_id === jobId);
          if (jobIndex !== -1) {
            this.jobsDB.jobs[jobIndex].status = status.status;
            if (status.result_url) {
              this.jobsDB.jobs[jobIndex].result_url = status.result_url;
            }
            this.jobsDB.jobs[jobIndex].progress = status.progress || 0;
            this.jobsDB.jobs[jobIndex].updated_at = new Date().toISOString();
            // Сохраняем в файл при обновлении статуса
            await this.saveJobsToFile();
          }

          console.log(`=== DEBUG: Статус задачи ${jobId}: ${status.status} ===`);

          if (status.status === 'processing') {
            // Интервал опроса 10 секунд
            setTimeout(pollJob, 10000);
          } else if (status.status === 'completed') {
            this.pollQueue.set(jobId, {
              status: 'completed',
              result: status,
              completed_at: new Date().toISOString()
            });
            console.log(`Задача загрузки ${jobId} завершена, автоматически обрабатываем результаты`);
            
            // Автоматически обрабатываем результаты и сохраняем в историю корпусов
            try {
              await this.processCompletedUploadJob(jobId, status);
            } catch (error) {
              console.error(`Ошибка обработки завершенной задачи загрузки ${jobId}:`, error);
            }
          } else {
            // Задача провалена или неизвестный статус
            this.pollQueue.set(jobId, {
              status: 'failed',
              result: status,
              failed_at: new Date().toISOString()
            });
            console.log(`Задача загрузки ${jobId} провалена: ${status.status}`);
          }
        } catch (error) {
          console.error(`Ошибка опроса задачи загрузки ${jobId}:`, error);
          // Продолжаем опрос при ошибке
          setTimeout(pollJob, 10000);
        }
      };

      // Начинаем опрос
      setTimeout(pollJob, 5000);
      
    } catch (error) {
      console.error(`Не удалось запустить опрос для задачи загрузки ${jobId}:`, error);
    }
  }

  /**
   * Получает статус задачи
   * @param {string} jobId - ID задачи
   * @returns {Promise<Object>} статус задачи
   */
  async getJobStatus(jobId) {
    try {
      const response = await axios.get(`${this.backendServiceUrl}/jobs/${jobId}`);

      const jobIndex = this.jobsDB.jobs.findIndex(job => job.job_id === jobId);
      if (jobIndex !== -1) {
        this.jobsDB.jobs[jobIndex].status = response.data.status;
        if (response.data.result_url) {
          this.jobsDB.jobs[jobIndex].result_url = response.data.result_url;
        }
        // Сохраняем в файл при обновлении статуса
        await this.saveJobsToFile();
      }

      return response.data;
    } catch (error) {
      console.error('Ошибка получения статуса задачи:', error);
      throw error;
    }
  }

  /**
   * Получает результаты задачи
   * @param {string} resultUrl - URL результата
   * @returns {Promise<Object>} результаты задачи
   */
  async getJobResults(resultUrl) {
    try {
      console.log("Обработка URL результата:", resultUrl);

      let response;
      
      try {
        // Первая попытка - прямой запрос
        response = await axios.get(resultUrl, { 
          timeout: 10000,
          validateStatus: () => true
        });
        console.log("Статус основного запроса:", response.status);
      } catch (primaryError) {
        console.log("Основной запрос завершился с ошибкой:", primaryError.message);
        // Если это сетевая ошибка (DNS, таймаут и т.д.), пробуем фоллбэк
        if (primaryError.code === 'ENOTFOUND' || primaryError.code === 'ECONNREFUSED' || 
            primaryError.code === 'ECONNABORTED' || primaryError.code === 'ETIMEDOUT' || 
            primaryError.code === 'ERR_INVALID_URL' || primaryError.code === 'EAI_AGAIN') {
            
          console.log("Обнаружена сетевая ошибка, пробуем фоллбэк...");
          const fallbackUrl = await this.buildFallbackUrl(resultUrl);
          console.log("URL фоллбэка:", fallbackUrl);
          
          response = await axios.get(fallbackUrl, {
            timeout: 10000,
            validateStatus: () => true
          });
          console.log("Статус запроса фоллбэка:", response.status);
        } else {
          // Если это не сетевая ошибка, пробрасываем дальше
          throw primaryError;
        }
      }

      // Если после всех попыток получили HTTP ошибку
      if (response.status >= 400) {
        return {
          error: 'Не удалось получить результаты',
          message: response.statusText,
          details: response.data
        };
      }

      // Успешный ответ
      return response.data;

    } catch (error) {
      console.error('Ошибка получения результатов:', error);
      
      // Если это таймаут
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        return { 
          error: 'Gateway Timeout',
          message: 'Сервис результатов недоступен'
        };
      }
      
      return {
        error: 'Не удалось получить результаты',
        message: error.message
      };
    }
  }

  /**
   * Получает все задачи определенного типа
   * @param {string} jobType - тип задачи
   * @param {number} limit - лимит количества задач
   * @returns {Array} массив задач
   */
  getJobsByType(jobType, limit = null) {
    let jobs = this.jobsDB.jobs.filter(job => job.type === jobType);
    jobs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    if (limit) {
      jobs = jobs.slice(0, limit);
    }
    
    return jobs;
  }

  /**
   * Получает все задачи
   * @returns {Array} массив всех задач
   */
  getAllJobs() {
    return this.jobsDB.jobs;
  }

  /**
   * Получает задачу из базы данных по ID
   * @param {string} jobId - ID задачи
   * @returns {Object|null} найденная задача или null
   */
  getJob(jobId) {
    return this.jobsDB.jobs.find(job => job.job_id === jobId) || null;
  }

  /**
   * Обновляет задачу в базе данных
   * @param {Object} job - обновленная задача
   * @returns {Promise<boolean>} успешность операции
   */
  async updateJob(job) {
    const index = this.jobsDB.jobs.findIndex(j => j.job_id === job.job_id);
    if (index !== -1) {
      this.jobsDB.jobs[index] = { ...this.jobsDB.jobs[index], ...job };
      // Сохраняем в файл
      await this.saveJobsToFile();
      return true;
    }
    return false;
  }

  /**
   * Добавляет задачу в базу данных
   * @param {Object} jobData - данные задачи
   * @returns {Promise<boolean>} успешность операции
   */
  async addJob(jobData) {
    return await this.saveJobToDB(jobData);
  }

  /**
   * Запускает опрос задачи загрузки
   * @param {string} jobId - ID задачи
   * @param {string} corpusName - имя корпуса
   * @param {string} modelId - ID модели
   * @param {string} corpusId - ID корпуса
   */
  startUploadJobPolling(jobId, corpusName, modelId, corpusId) {
    this.pollUploadJob(jobId, corpusName, modelId, corpusId);
  }

  /**
   * Удаляет задачу из базы данных
   * @param {string} jobId - ID задачи
   * @returns {boolean} успешность операции
   */
  removeJob(jobId) {
    const index = this.jobsDB.jobs.findIndex(job => job.job_id === jobId);
    if (index !== -1) {
      this.jobsDB.jobs.splice(index, 1);
      return true;
    }
    return false;
  }
}

module.exports = JobManager;