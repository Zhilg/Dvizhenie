// Global variables to store text content
const DOCKER_SERVICE_URL_EMBEDDING = 'http://localhost:8000/embedding';
const DOCKER_SERVICE_URL_SIMILARITY = "http://localhost:8000/similarity";
let originalText = '';
let modifiedText = '';
let filePath = '';
let modifiedPath = '';
let availableModels = [];
let currentModelId = '';

// DOM elements
const fileUpload = document.getElementById('file-upload');
const originalTextArea = document.getElementById('originalText');
const modifiedTextArea = document.getElementById('modifiedText');
const processFileBtn = document.getElementById('process-file');
const saveChangesBtn = document.getElementById('save-changes');
const checkSynonymyBtn = document.getElementById('check-synonymy');
const resultsContainer = document.getElementById('vector-results');

// Event listeners
fileUpload.addEventListener('change', handleFileUpload);
checkSynonymyBtn.addEventListener('click', checkTextSimilarity);

// Show selected file name
fileUpload.addEventListener('change', function(e) {
    const label = document.querySelector('.custom-file-upload');
    if (this.files.length > 0) {
        label.innerHTML = `<i class="bi bi-file-text"></i> ${this.files[0].name}`;
    } else {
        label.innerHTML = '<i class="bi bi-cloud-arrow-up-fill"></i> Загрузить текст';
    }
});

// Handle file upload
async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
        const content = await readFileContent(file);
        originalText = content;
        modifiedText = content;
        originalTextArea.value = content;
        modifiedTextArea.value = content;
        
        // In a real app, you would send this to your backend for saving
        filePath = `uploads/${file.name}`;
        console.log('File uploaded:', filePath);
    } catch (error) {
        console.error('Error reading file:', error);
        alert('Ошибка при чтении файла');
    }
}

// Read file content
function readFileContent(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target.result);
        reader.onerror = (error) => reject(error);
        reader.readAsText(file);
    });
}

// Функция для расчета косинусной близости
function calculateCosineSimilarity(vecA, vecB) {
    if (vecA.length !== vecB.length) {
        throw new Error('Векторы должны иметь одинаковую размерность');
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    
    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);
    
    if (normA === 0 || normB === 0) {
        return 0; // Чтобы избежать деления на ноль
    }
    
    return dotProduct / (normA * normB);
}

// Check text similarity
async function checkTextSimilarity() {
    if (!currentModelId) {
    showError('Пожалуйста, выберите модель');
    return;
  }
  if (!originalText || !modifiedText) {
    alert('Пожалуйста, загрузите файл и введите модифицированный текст');
    return;
  }

  try {
    checkSynonymyBtn.disabled = true;
    checkSynonymyBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Обработка...';

    const response = await fetch('/api/similarity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text1: originalTextArea.value,
        text2: modifiedTextArea.value,
        modelId: currentModelId // Можно выбрать из списка моделей
      })
    });

    if (!response.ok) throw new Error(await response.text());

    const results = await response.json();
    const embedding1 = results.embeddings?.[0] || [];
    const embedding2 = results.embeddings?.[1] || [];
    const cosineSimilarity = calculateCosineSimilarity(embedding1, embedding2);


    // Формируем полные данные для отображения
    const displayData = {
      ...results,
      embedding1: embedding1,
      embedding2: embedding2,
      similarity: cosineSimilarity
    };

    displayResults(displayData);
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



// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', async () => {
  await loadModels();
  initModelSelector();
});

// Загрузка списка моделей
async function loadModels() {
  try {
    const response = await fetch('/api/models');
    if (!response.ok) throw new Error('Failed to load models');
    
    availableModels = await response.json();
    if (availableModels.length > 0) {
      currentModelId = availableModels[0].model_id;
    }
  } catch (error) {
    console.error('Error loading models:', error);
    showError('Не удалось загрузить список моделей');
  }
}

// Инициализация селектора моделей
function initModelSelector() {
  const selector = document.getElementById('model-selector');
  
  // Очищаем и добавляем опции
  selector.innerHTML = '';
  availableModels.forEach(model => {
    const option = document.createElement('option');
    option.value = model.model_id;
    option.textContent = model.model_name 
      ? `${model.model_name} (${model.dimension}D)`
      : `Model ${model.model_id.substring(0, 8)} (${model.dimension}D)`;
    selector.appendChild(option);
  });
  
  // Обработчик изменения
  selector.addEventListener('change', (e) => {
    currentModelId = e.target.value;
    updateModelInfo();
  });
  
  updateModelInfo();
}

// Обновление информации о выбранной модели
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

function displayResults(results) {
    const startTime = performance.now();
    const vectorPairs = [];
    
    // Create vector pairs for display
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

    // Format vector pairs for display
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

    // Обрабатываем косинусную близость
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

    // Обрабатываем угловое расхождение (вычисляем из косинусной близости)
    const angularDiff = Math.acos(cosineSimilarity);
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

    // Обрабатываем developer value
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

    // Показываем блок результатов
    const resultsContainer = document.getElementById('vector-results');
    if (resultsContainer) {
        resultsContainer.style.display = 'block';
    }

    // Отображаем время выполнения
    const executionTimeElement = document.getElementById('execution-time');
    if (executionTimeElement) {
        const endTime = performance.now();
        executionTimeElement.textContent = `${(endTime - startTime).toFixed(2)} мс`;
    }
}