// Глобальные переменные для хранения содержимого текста и состояния
const DOCKER_SERVICE_URL_EMBEDDING = 'http://localhost:8000/embedding';
const DOCKER_SERVICE_URL_SIMILARITY = "http://localhost:8000/similarity";
let originalText = '';
let modifiedText = '';
let filePath = '';
let modifiedPath = '';
let availableModels = [];
let currentModelId = '';
let startTime = '';
let endTime = '';
let angularGauge = null;

// Ссылки на элементы DOM
const fileUpload = document.getElementById('file-upload');
const originalTextArea = document.getElementById('originalText');
const modifiedTextArea = document.getElementById('modifiedText');
const processFileBtn = document.getElementById('process-file');
const saveChangesBtn = document.getElementById('save-changes');
const checkSynonymyBtn = document.getElementById('check-synonymy');
const resultsContainer = document.getElementById('vector-results');
const vectorDim = document.getElementById('vector-dimension');

// Обработчики событий
fileUpload.addEventListener('change', handleFileUpload);
checkSynonymyBtn.addEventListener('click', checkTextSimilarity);

// Отображение имени выбранного файла
fileUpload.addEventListener('change', function(e) {
    const label = document.querySelector('.custom-file-upload');
    if (this.files.length > 0) {
        label.innerHTML = `<i class="bi bi-file-text"></i> ${this.files[0].name}`;
    } else {
        label.innerHTML = '<i class="bi bi-cloud-arrow-up-fill"></i> Загрузить текст';
    }
});

// ========================================
// КЛАСС СПИДОМЕТРА УГЛОВОГО РАСХОЖДЕНИЯ
// ========================================
class AngularGauge {
    constructor() {
        this.minValue = 0;
        this.maxValue = Math.PI / 2; // Максимум π/2 (90°)
        this.currentValue = 0;
        this.startAngle = -90;
        this.endAngle = 90;
        this.container = null;
        this.needle = null;
        this.valueDisplay = null;
        this.statusElement = null;
        this.statusText = null;
    }
    
    // Создаём и вставляем спидометр в DOM
    inject(targetSelector) {
        const target = document.querySelector(targetSelector);
        if (!target) return false;
        
        // Создаём контейнер для спидометра
        this.container = document.createElement('div');
        this.container.className = 'gauge-section';
        this.container.innerHTML = `
            <div class="gauge-container">
                <div class="gauge-title">Угловое расхождение</div>
                
                <div class="gauge-wrapper">
                    <svg class="gauge-svg" viewBox="0 0 280 160">
                        <defs>
                            <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stop-color="#10b981"/>
                                <stop offset="30%" stop-color="#10b981"/>
                                <stop offset="50%" stop-color="#f59e0b"/>
                                <stop offset="70%" stop-color="#f59e0b"/>
                                <stop offset="85%" stop-color="#ef4444"/>
                                <stop offset="100%" stop-color="#ef4444"/>
                            </linearGradient>
                        </defs>
                        
                        <path class="gauge-bg" d="M 25 130 A 115 115 0 0 1 255 130"/>
                        <path class="gauge-fill" d="M 25 130 A 115 115 0 0 1 255 130" stroke="url(#gaugeGradient)"/>
                        
                        <text class="gauge-label" x="10" y="140">0</text>
                        <text class="gauge-label" x="52" y="55">π/8</text>
                        <text class="gauge-label" x="132" y="18">π/4</text>
                        <text class="gauge-label" x="212" y="55">3π/8</text>
                        <text class="gauge-label" x="255" y="140">π/2</text>
                        
                        <g class="gauge-needle" id="gauge-needle">
                            <polygon class="gauge-needle-shape" points="140,30 136,125 144,125"/>
                            <circle class="gauge-needle-center" cx="140" cy="130" r="10"/>
                        </g>
                    </svg>
                    
                    <div class="gauge-value-container">
                        <div class="gauge-value" id="gauge-value">0.0000</div>
                        <div class="gauge-unit">радиан</div>
                    </div>
                </div>
                
                <div class="zone-labels">
                    <span class="zone-label success">Малое</span>
                    <span class="zone-label warning">Умеренное</span>
                    <span class="zone-label danger">Большое</span>
                </div>
                
                <div class="gauge-status low" id="gauge-status">
                    <span class="status-dot"></span>
                    <span id="gauge-status-text">Малое расхождение</span>
                </div>
            </div>
        `;
        
        // Вставляем в начало target
        target.insertBefore(this.container, target.firstChild);
        
        // Кешируем элементы
        this.needle = document.getElementById('gauge-needle');
        this.valueDisplay = document.getElementById('gauge-value');
        this.statusElement = document.getElementById('gauge-status');
        this.statusText = document.getElementById('gauge-status-text');
        
        return true;
    }
    
    setValue(value) {
        this.currentValue = Math.max(this.minValue, Math.min(this.maxValue, value));
        
        const percentage = (this.currentValue - this.minValue) / (this.maxValue - this.minValue);
        const rotationAngle = this.startAngle + (percentage * (this.endAngle - this.startAngle));
        
        if (this.needle) {
            this.needle.style.transform = `rotate(${rotationAngle}deg)`;
        }
        
        if (this.valueDisplay) {
            this.valueDisplay.textContent = this.currentValue.toFixed(4);
        }
        
        this.updateStatus(percentage);
    }
    
    updateStatus(percentage) {
        if (!this.statusElement || !this.statusText || !this.valueDisplay) return;
        
        this.statusElement.classList.remove('low', 'medium', 'high');
        
        if (percentage < 0.33) {
            this.statusElement.classList.add('low');
            this.statusText.textContent = 'Малое расхождение';
            this.valueDisplay.style.color = '#10b981';
        } else if (percentage < 0.66) {
            this.statusElement.classList.add('medium');
            this.statusText.textContent = 'Умеренное расхождение';
            this.valueDisplay.style.color = '#f59e0b';
        } else {
            this.statusElement.classList.add('high');
            this.statusText.textContent = 'Большое расхождение';
            this.valueDisplay.style.color = '#ef4444';
        }
    }
    
    animateTo(targetValue, duration = 800) {
        const startValue = this.currentValue;
        const animStartTime = performance.now();
        
        const animate = (currentTime) => {
            const elapsed = currentTime - animStartTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeOutCubic = 1 - Math.pow(1 - progress, 3);
            const currentVal = startValue + (targetValue - startValue) * easeOutCubic;
            this.setValue(currentVal);
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        requestAnimationFrame(animate);
    }
}

// ========================================
// ОСНОВНЫЕ ФУНКЦИИ
// ========================================

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

function readFileContent(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target.result);
        reader.onerror = (error) => reject(error);
        reader.readAsText(file);
    });
}

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
        return 0;
    }

    return dotProduct / (normA * normB);
}

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
        startTime = performance.now();
        
        const response = await apiFetch('/api/similarity', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text1: originalTextArea.value,
                text2: modifiedTextArea.value,
                modelId: currentModelId
            })
        });

        if (!response.ok) throw new Error(await response.text());

        const results = await response.json();
        const embedding1 = results.embeddings?.[0] || [];
        const embedding2 = results.embeddings?.[1] || [];
        const cosineSimilarity = calculateCosineSimilarity(embedding1, embedding2);

        const displayData = {
            ...results,
            embedding1: embedding1,
            embedding2: embedding2,
            similarity: cosineSimilarity
        };
        
        endTime = performance.now();
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

// Инициализация
document.addEventListener('DOMContentLoaded', async () => {
    await loadModels();
    initModelSelector();
    
    // Создаём спидометр и вставляем в #vector-results
    angularGauge = new AngularGauge();
    angularGauge.inject('#vector-results');
    
    // Скрываем только блок сравнения векторов
    const vectorComparison = document.getElementById('vector-comparison');
    if (vectorComparison) {
        vectorComparison.style.display = 'none';
        // Скрываем также родителя если это отдельный блок
        const parent = vectorComparison.parentElement;
        if (parent && parent.children.length === 1) {
            parent.style.display = 'none';
        }
    }
});

async function loadModels() {
    try {
        const response = await apiFetch('/api/models');
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

function initModelSelector() {
    const selector = document.getElementById('model-selector');
    if (!selector) return;

    selector.innerHTML = '';
    availableModels.forEach(model => {
        const option = document.createElement('option');
        option.value = model.model_id;
        option.textContent = model.model_name
            ? `${model.model_name} (${model.dimension}D)`
            : `Model ${model.model_id.substring(0, 8)} (${model.dimension}D)`;
        selector.appendChild(option);
    });

    selector.addEventListener('change', (e) => {
        currentModelId = e.target.value;
        updateModelInfo();
    });

    updateModelInfo();
}

function updateModelInfo() {
    const model = availableModels.find(m => m.model_id === currentModelId);
    const infoElement = document.getElementById('model-info');
    if (!infoElement) return;

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
    // Косинусная схожесть
    const cosineSimilarity = parseFloat(results.similarity);
    const similarityBadge = document.getElementById('similarity-badge');
    const similarityText = document.getElementById('similarity-text');
    
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

    // Обновляем спидометр
    const angularDiff = results.angular_similarity_radians;
    if (angularGauge && angularDiff !== undefined) {
        angularGauge.animateTo(angularDiff, 1000);
    }
    
    // Старые элементы (для совместимости)
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

    // Developer value
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

    // Показываем результаты
    const resultsContainer = document.getElementById('vector-results');
    if (resultsContainer) {
        resultsContainer.style.display = 'block';
    }
    
    if (vectorDim) {
        vectorDim.textContent = results.dimension;
    }
    
    // Время
    const executionTimeElement = document.getElementById('execution-time');
    if (executionTimeElement) {
        executionTimeElement.textContent = `${(endTime - startTime).toFixed(2)} мс`;
    }
}

function showError(message) {
    alert(message);
}