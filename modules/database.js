const fs = require('fs');
const path = require('path');

/**
 * Модуль для работы с базой данных корпусов
 * Обеспечивает постоянное хранение информации о корпусах в файловой системе
 */

class CorpusDatabase {
  constructor(sharedDataPath) {
    this.sharedDataPath = sharedDataPath;
    this.dbFilePath = path.join(sharedDataPath, 'corpora_database.json');
    this.data = { corpora: [] };
  }

  /**
   * Загружает базу данных из файла
   * @param {Object} defaultData - данные по умолчанию, если файл не существует
   * @returns {Promise<Object>} загруженные данные
   */
  async loadFromFile(defaultData = { corpora: [] }) {
    try {
      if (fs.existsSync(this.dbFilePath)) {
        const data = fs.readFileSync(this.dbFilePath, 'utf8');
        const parsedData = JSON.parse(data);
        console.log(`База данных загружена из файла ${this.dbFilePath}:`, parsedData);
        return parsedData;
      } else {
        console.log(`Файл базы данных ${this.dbFilePath} не существует, используются данные по умолчанию`);
        return defaultData;
      }
    } catch (error) {
      console.error(`Ошибка загрузки базы данных из ${this.dbFilePath}:`, error);
      return defaultData;
    }
  }

  /**
   * Сохраняет данные в файл
   * @param {Object} data - данные для сохранения
   * @returns {Promise<boolean>} успешность операции
   */
  async saveToFile(data) {
    try {
      // Убеждаемся, что директория существует
      const dir = path.dirname(this.dbFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // Записываем данные в файл
      fs.writeFileSync(this.dbFilePath, JSON.stringify(data, null, 2), 'utf8');
      console.log(`База данных сохранена в файл ${this.dbFilePath}`);
      return true;
    } catch (error) {
      console.error(`Ошибка сохранения базы данных в файл ${this.dbFilePath}:`, error);
      return false;
    }
  }

  /**
   * Инициализирует базу данных из файла или создает новую
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      // Загружаем базу данных
      this.data = await this.loadFromFile({ corpora: [] });
      
      // Создаем файл базы данных, если он не существует
      await this.ensureFileExists();
      
      console.log('База данных корпусов успешно инициализирована');
    } catch (error) {
      console.error('Ошибка инициализации базы данных:', error);
      // Используем пустую базу данных по умолчанию
      this.data = { corpora: [] };
    }
  }

  /**
   * Убеждается, что файл базы данных существует, создает его если нужно
   * @returns {Promise<void>}
   */
  async ensureFileExists() {
    try {
      if (!fs.existsSync(this.dbFilePath)) {
        await this.saveToFile(this.data);
        console.log(`Создан новый файл базы данных: ${this.dbFilePath}`);
      }
    } catch (error) {
      console.error('Ошибка создания файла базы данных:', error);
    }
  }

  /**
   * Получает все корпуса из базы данных
   * @returns {Array} массив корпусов
   */
  getAllCorpora() {
    return this.data.corpora;
  }

  /**
   * Находит корпус по ID
   * @param {string} corpusId - ID корпуса
   * @returns {Object|null} найденный корпус или null
   */
  getCorpusById(corpusId) {
    return this.data.corpora.find(c => c.id === corpusId) || null;
  }

  /**
   * Сохраняет корпус в базу данных
   * @param {Object} corpusData - данные корпуса
   * @returns {Promise<boolean>} успешность операции
   */
  async saveCorpus(corpusData) {
    try {
      if (!corpusData.created_at) {
        corpusData.created_at = new Date().toISOString();
      }

      console.log('=== DEBUG: Сохранение корпуса в базу данных ===');
      console.log('Полученные данные корпуса:', JSON.stringify(corpusData, null, 2));
      console.log('Имя сохраняемого корпуса:', corpusData.name);
      console.log('=== КОНЕЦ DEBUG ===');

      // Проверяем, существует ли уже корпус с таким ID
      const existingIndex = this.data.corpora.findIndex(c => c.id === corpusData.id);
      if (existingIndex >= 0) {
        // Обновляем существующий корпус
        this.data.corpora[existingIndex] = corpusData;
        console.log(`Корпус обновлен в базе данных: ${corpusData.id}`);
      } else {
        // Добавляем новый корпус
        this.data.corpora.push(corpusData);
        console.log(`Корпус сохранен в базе данных: ${corpusData.id}`);
      }
      
      // Сохраняем в постоянное хранилище
      await this.saveToFile(this.data);
      
      return true;
    } catch (error) {
      console.error('Ошибка добавления корпуса в базу данных:', error);
      return false;
    }
  }

  /**
   * Обновляет количество файлов в корпусе
   * @param {string} corpusPath - путь к корпусу
   * @param {string} newCorpusId - новый ID корпуса от бэкенда
   * @param {number} fileCount - количество файлов
   * @returns {Promise<boolean>} успешность операции
   */
  async updateCorpusFileCount(corpusPath, newCorpusId, fileCount) {
    try {
      // Находим существующий корпус по пути
      const existingCorpusIndex = this.data.corpora.findIndex(c => c.corpus_path === corpusPath);
      
      if (existingCorpusIndex >= 0) {
        // Обновляем существующий корпус с ID и количеством файлов от бэкенда
        this.data.corpora[existingCorpusIndex].id = newCorpusId; // Обновляем ID до ID от бэкенда
        this.data.corpora[existingCorpusIndex].files = fileCount; // Обновляем количество файлов
        
        // Сохраняем обновленный корпус в постоянное хранилище
        await this.saveToFile(this.data);
              
        console.log(`Корпус ${corpusPath} обновлен с ID от бэкенда: ${newCorpusId}`);
        return true;
      }
      
      return false; // Корпус не найден
    } catch (error) {
      console.error('Ошибка обновления количества файлов в корпусе:', error);
      return false;
    }
  }

  /**
   * Получает corpus_path из базы данных по ID корпуса
   * @param {string} corpusId - ID корпуса
   * @returns {string|null} путь к корпусу или null
   */
  getCorpusPath(corpusId) {
    try {
      const corpus = this.getCorpusById(corpusId);
      if (!corpus) {
        console.log(`Корпус ${corpusId} не найден в базе данных`);
        return null;
      }
      
      // Возвращаем corpus_path из базы данных
      if (corpus.corpus_path) {
        console.log(`Найден corpus_path для ${corpusId}: ${corpus.corpus_path}`);
        return corpus.corpus_path;
      }
      
      // Fallback: используем corpus_id как путь
      console.log(`Для ${corpusId} не найден corpus_path, используется fallback: /${corpusId}`);
      return `/${corpusId}`;
      
    } catch (error) {
      console.error(`Ошибка получения corpus_path для ${corpusId}:`, error);
      return null;
    }
  }
}

module.exports = CorpusDatabase;