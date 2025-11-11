// Глобальные переменные для хранения содержимого текста и состояния
const DOCKER_SERVICE_URL_EMBEDDING = 'http://localhost:8000/embedding'; // URL сервиса для создания эмбеддингов
const DOCKER_SERVICE_URL_SIMILARITY = "http://localhost:8000/similarity"; // URL сервиса для расчета схожести
let originalText = ''; // Оригинальный текст из файла
let modifiedText = ''; // Модифицированный текст для сравнения
let filePath = ''; // Путь к загруженному файлу
let modifiedPath = ''; // Путь к модифицированному файлу
let availableModels = []; // Список доступных моделей эмбеддингов
let currentModelId = ''; // ID выбранной модели
let startTime = ''; // Время начала выполнения операции
let endTime = ''; // Время окончания выполнения операции
// Ссылки на элементы DOM для управления интерфейсом
const fileUpload = document.getElementById('file-upload'); // Элемент загрузки файла
const originalTextArea = document.getElementById('originalText'); // Текстовое поле с оригинальным текстом
const modifiedTextArea = document.getElementById('modifiedText'); // Текстовое поле с модифицированным текстом
const processFileBtn = document.getElementById('process-file'); // Кнопка обработки файла
const saveChangesBtn = document.getElementById('save-changes'); // Кнопка сохранения изменений
const checkSynonymyBtn = document.getElementById('check-synonymy'); // Кнопка проверки синонимии
const resultsContainer = document.getElementById('vector-results'); // Контейнер для отображения результатов
const vectorDim = document.getElementById('vector-dimension'); // Элемент отображения размерности вектора

// Обработчики событий для элементов интерфейса
fileUpload.addEventListener('change', handleFileUpload); // Обработчик загрузки файла
checkSynonymyBtn.addEventListener('click', checkTextSimilarity); // Обработчик проверки схожести

// Отображение имени выбранного файла в интерфейсе
fileUpload.addEventListener('change', function(e) {
    const label = document.querySelector('.custom-file-upload');
    if (this.files.length > 0) {
        label.innerHTML = `<i class="bi bi-file-text"></i> ${this.files[0].name}`;
    } else {
        label.innerHTML = '<i class="bi bi-cloud-arrow-up-fill"></i> Загрузить текст';
    }
});

// Обработка загрузки файла пользователем
async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
        const content = await readFileContent(file);
        originalText = content;
        modifiedText = content;
        originalTextArea.value = content;
        modifiedTextArea.value = content;

    } catch (error) {
        console.error('Error reading file:', error);
        alert('Ошибка при чтении файла');
    }
}

// Чтение содержимого файла с помощью FileReader API
function readFileContent(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target.result); // Успешное чтение файла
        reader.onerror = (error) => reject(error); // Ошибка чтения файла
        reader.readAsText(file); // Чтение файла как текст
    });
}

// Расчет косинусной схожести между двумя векторами
function calculateCosineSimilarity(vecA, vecB) {
    if (vecA.length !== vecB.length) {
        throw new Error('Векторы должны иметь одинаковую размерность');
    }

    let dotProduct = 0; // Скалярное произведение векторов
    let normA = 0; // Норма первого вектора
    let normB = 0; // Норма второго вектора

    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
        return 0; // Избегание деления на ноль для нулевых векторов
    }

    return dotProduct / (normA * normB); // Формула косинусной схожести
}

// Проверка схожести между оригинальным и модифицированным текстом
async function checkTextSimilarity() {
    if (!currentModelId) {
    showError('Пожалуйста, выберите модель');
    return;
  }
  if (!originalTextArea.value || !modifiedTextArea.value) {
    alert('Пожалуйста, загрузите файл и введите модифицированный текст');
    return;
  }

  try {
    checkSynonymyBtn.disabled = true;
    checkSynonymyBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Обработка...';
    startTime = performance.now(); // Засекаем время начала обработки
    const response = await fetch('/api/similarity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text1: originalTextArea.value,
        text2: modifiedTextArea.value,
        modelId: currentModelId // Используем выбранную модель
      })
    });

    if (!response.ok) throw new Error(await response.text());

    const results = await response.json();
    const embedding1 = results.embeddings?.[0] || []; // Эмбеддинг первого текста
    const embedding2 = results.embeddings?.[1] || []; // Эмбеддинг второго текста
    const cosineSimilarity = calculateCosineSimilarity(embedding1, embedding2); // Расчет схожести


    // Формируем полные данные для отображения результатов
    const displayData = {
      ...results,
      embedding1: embedding1,
      embedding2: embedding2,
      similarity: cosineSimilarity
    };
    endTime = performance.now(); // Засекаем время окончания
    displayResults(displayData); // Отображаем результаты
    document.getElementById('vector-results').scrollIntoView({
    behavior: 'smooth',
    block: 'end'
  });

  } catch (error) {
    console.error('Ошибка сравнения:', error);
    alert(`Ошибка: ${error.message}`);
  } finally {
    checkSynonymyBtn.disabled = false;
    checkSynonymyBtn.innerHTML = '<i class="bi bi-graph-up"></i> Проверить синонимию';
  }
}



// Инициализация приложения при загрузке страницы
document.addEventListener('DOMContentLoaded', async () => {
  await loadModels(); // Загружаем список моделей
  initModelSelector(); // Инициализируем селектор моделей
});

// Загрузка списка доступных моделей эмбеддингов
async function loadModels() {
  try {
    const response = await fetch('/api/models');
    if (!response.ok) throw new Error('Failed to load models');

    availableModels = await response.json();
    if (availableModels.length > 0) {
      currentModelId = availableModels[0].model_id; // Выбираем первую модель по умолчанию
    }
  } catch (error) {
    console.error('Error loading models:', error);
    showError('Не удалось загрузить список моделей');
  }
}

// Инициализация выпадающего списка моделей
function initModelSelector() {
  const selector = document.getElementById('model-selector');

  // Очищаем список и добавляем опции для каждой модели
  selector.innerHTML = '';
  availableModels.forEach(model => {
    const option = document.createElement('option');
    option.value = model.model_id;
    option.textContent = model.model_name
      ? `${model.model_name} (${model.dimension}D)`
      : `Model ${model.model_id.substring(0, 8)} (${model.dimension}D)`;
    selector.appendChild(option);
  });

  // Обработчик изменения выбранной модели
  selector.addEventListener('change', (e) => {
    currentModelId = e.target.value;
    updateModelInfo(); // Обновляем информацию о модели
  });

  updateModelInfo(); // Показываем информацию о текущей модели
}

// Обновление отображения информации о выбранной модели
function updateModelInfo() {
  const model = availableModels.find(m => m.model_id === currentModelId);
  const infoElement = document.getElementById('model-info');

  if (model) {
    infoElement.innerHTML = `
      <strong>Модель:</strong> ${model.model_name || 'Без названия'}<br>
      <strong>Размерность:</strong> ${model.dimension}D<br>
      <small class="text-muted">ID: ${model.model_id}</small>
    `;
  } else {
    infoElement.textContent = 'Модель не выбрана';
  }
}

// Отображение результатов сравнения текстов в интерфейсе
function displayResults(results) {

    const vectorPairs = [];

    // Создаем пары значений векторов для отображения
    for (let i = 0; i < results.embedding1.length; i++) {
        const elem1 = results.embedding1[i];
        const elem2 = results.embedding2[i];
        const diff = Math.abs(elem1 - elem2);
        const diffPercent = (diff * 100).toFixed(2);
        vectorPairs.push({
            original: elem1.toFixed(6),
            modified: elem2.toFixed(6),
            diff: diffPercent
        });
    }

    // Форматируем пары векторов для отображения
    const vectorComparison = document.getElementById('vector-comparison');
    if (vectorComparison) {
        vectorComparison.innerHTML = '';

        vectorPairs.forEach(pair => {
            const pairElement = document.createElement('span');
            pairElement.className = 'vector-pair';
            pairElement.textContent = `(${pair.original}, ${pair.modified}, ${pair.diff}%)`;
            vectorComparison.appendChild(pairElement);
        });
    }

    // Отображаем косинусную схожесть
    const cosineSimilarity = parseFloat(results.similarity);
    const similarityBadge = document.getElementById('similarity-badge');
    const similarityText = document.getElementById('similarity-text');
    console.log('similarity value:', results.similarity, typeof results.similarity);
    if (similarityBadge) {
        similarityBadge.textContent = cosineSimilarity.toFixed(6);
    }

    if (similarityText) {
        if (cosineSimilarity > 0.8) {
            similarityText.innerHTML = '<span class="text-success">Высокая схожесть</span>';
        } else if (cosineSimilarity > 0.5) {
            similarityText.innerHTML = '<span class="text-warning">Средняя схожесть</span>';
        } else {
            similarityText.innerHTML = '<span class="text-danger">Низкая схожесть</span>';
        }
    }

    // Отображаем угловое расхождение между векторами
    const angularDiff = results.angular_similarity_radians;
    const angularBadge = document.getElementById('angular-badge');
    const angleText = document.getElementById('angle-text');

    if (angularBadge) {
        angularBadge.textContent = angularDiff.toFixed(6);
    }

    if (angleText) {
        if (angularDiff < 0.5) {
            angleText.innerHTML = '<span class="text-success">Малое расхождение</span>';
        } else if (angularDiff < 1.0) {
            angleText.innerHTML = '<span class="text-warning">Умеренное расхождение</span>';
        } else {
            angleText.innerHTML = '<span class="text-danger">Большое расхождение</span>';
        }
    }

    // Отображаем developer value если присутствует
    const devValueContainer = document.getElementById('developer-value-container');
    const devValue = document.getElementById('developer-value');

    if (devValueContainer && devValue) {
        if (results.developer_value) {
            devValue.textContent = JSON.stringify(results.developer_value, null, 2);
            devValueContainer.style.display = 'block';
        } else {
            devValueContainer.style.display = 'none';
        }
    }

    // Показываем блок с результатами
    const resultsContainer = document.getElementById('vector-results');
    if (resultsContainer) {
        resultsContainer.style.display = 'block';
    }
    vectorDim.textContent = results.dimension;
    // Отображаем время выполнения операции
    const executionTimeElement = document.getElementById('execution-time');
    if (executionTimeElement) {

        executionTimeElement.textContent = `${(endTime - startTime).toFixed(2)} мс`;
    }
}