// Здесь будет ваш JavaScript код
// Глобальные переменные состояния
let currentFolder = null;
let clustersData = null;
let currentClusterId = null;
let timerInterval = null;
let startTime = null;
let sortColumn = 'similarity';
let sortDirection = 'desc';
let currentJobId = null;
let checkStatusInterval = null;
let availableModels = [];
let isCompactMode = false;
let maxDepth = 0;

// DOM элементы
const selectFolderBtn = document.getElementById('selectFolderBtn');
const exportBtn = document.getElementById('exportBtn');
const timerElement = document.getElementById('timer');
const progressBar = document.getElementById('progressBar');
const clusterTree = document.getElementById('clusterTree');
const clusterInfo = document.getElementById('clusterInfo');
const filesTableBody = document.getElementById('filesTableBody');
const previewContent = document.getElementById('previewContent');
const statusMessage = document.getElementById('statusMessage');
const statusText = document.getElementById('statusText');
const similarityChart = document.getElementById('similarityChart');
const modelSelect = document.getElementById('modelSelect');
const startClusteringBtn = document.getElementById('startClusteringBtn');

// Конфигурация API
const API_BASE_URL = '/api';

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', async () => {
await loadModels();
setupFolderSelector();

// Добавляем обработчик для кнопки запуска кластеризации
startClusteringBtn.addEventListener('click', startClustering);
});

// Загрузка списка моделей
async function loadModels() {
try {
    const response = await fetch(`${API_BASE_URL}/models`);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    availableModels = await response.json();
    
    // Заполняем выпадающий список моделей
    modelSelect.innerHTML = '<option value="">Выберите модель</option>';
    availableModels.forEach(model => {
        const option = document.createElement('option');
        option.value = model.model_id;
        option.textContent = model.model_name || model.model_id;
        option.title = `Размерность: ${model.dimension}`;
        modelSelect.appendChild(option);
    });
    
} catch (error) {
    console.error('Error loading models:', error);
    showStatus('Ошибка загрузки моделей', 'error');
}
}

// Настройка проводника для выбора папки
function setupFolderSelector() {
const folderInput = document.createElement('input');
folderInput.type = 'file';
folderInput.style.display = 'none';
folderInput.webkitdirectory = true;
folderInput.directory = true;
folderInput.multiple = true;

folderInput.addEventListener('change', (event) => {
    const files = event.target.files;
    if (files.length > 0) {
        // Получаем путь к папке из первого файла
        const filePath = files[0].webkitRelativePath;
        const folderPath = filePath.split('/')[0];
        
        // Сохраняем выбранную папку
        currentFolder = folderPath;
        
        // Показываем выбранную папку
        const folderDisplay = document.getElementById('selectedFolder');
        if (folderDisplay) {
            folderDisplay.textContent = `Выбрана папка: ${folderPath}`;
        }
        
        showStatus(`Выбрана папка: ${folderPath}`, 'success');
    }
});

// Добавляем input в DOM
document.body.appendChild(folderInput);

// Обработчик кнопки выбора папки
selectFolderBtn.addEventListener('click', () => {
    if (window.showDirectoryPicker) {
        // Современный API для выбора папки
        openModernFolderPicker();
    } else {
        // Fallback для старых браузеров
        folderInput.click();
    }
});
}

// Современный API для выбора папки
async function openModernFolderPicker() {
try {
    const directoryHandle = await window.showDirectoryPicker();
    
    // Получаем информацию о папке
    const folderName = directoryHandle.name;
    currentFolder = folderName;
    
    // Показываем выбранную папку
    const folderDisplay = document.getElementById('selectedFolder');
    if (folderDisplay) {
        folderDisplay.textContent = `Выбрана папка: ${folderName}`;
    }
    
    showStatus(`Выбрана папка: ${folderName}`, 'success');
    
    // Можно также получить список файлов для проверки
    await scanDirectory(directoryHandle);
    
} catch (error) {
    if (error.name !== 'AbortError') {
        console.error('Folder picker error:', error);
        showStatus('Ошибка выбора папки', 'error');
    }
}
}

// Сканирование содержимого папки
async function scanDirectory(directoryHandle) {
let fileCount = 0;
let txtFileCount = 0;

try {
    for await (const entry of directoryHandle.values()) {
        if (entry.kind === 'file') {
            fileCount++;
            if (entry.name.toLowerCase().endsWith('.txt')) {
                txtFileCount++;
            }
        }
    }
    
    showStatus(`Найдено файлов: ${fileCount}, текстовых: ${txtFileCount}`, 'info');
    
} catch (error) {
    console.error('Directory scan error:', error);
}
}

// Функция запуска кластеризации
async function startClustering() {
if (!currentFolder) {
    showStatus('Сначала выберите папку', 'error');
    return;
}

if (!modelSelect.value) {
    showStatus('Выберите модель для кластеризации', 'error');
    return;
}

showStatus('Запуск кластеризации...', 'info');
selectFolderBtn.disabled = true;
startClusteringBtn.disabled = true;
startClusteringBtn.innerHTML = '<span class="loading"></span> Обработка...';

// Сброс предыдущих данных
clusterTree.innerHTML = '';
filesTableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 30px;">Запуск кластеризации...</td></tr>';
previewContent.textContent = 'Запуск кластеризации...';

// Запуск таймера
startTimer();

try {
    // Отправляем запрос на кластеризацию
    const response = await fetch(`${API_BASE_URL}/clusterization`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-corpus-path': currentFolder,
            'x-model-id': modelSelect.value,
            'x-ttl-hours': '0'
        },
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    currentJobId = data.job_id;

    showStatus(`Кластеризация запущена. ID задачи: ${currentJobId}`, 'info');
    
    // Начинаем отслеживать статус
    checkClusteringStatus();
    
} catch (error) {
    console.error('Clustering error:', error);
    showStatus('Ошибка при запуске кластеризации: ' + error.message, 'error');
    resetUI();
}
}

// Функция проверки статуса кластеризации
async function checkClusteringStatus() {
if (!currentJobId) return;

try {
    const response = await fetch(`${API_BASE_URL}/jobs/${currentJobId}`);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    const status = await response.json();
    
    if (status.status === 'processing') {
        const progress = status.progress || 0;
        updateProgress(progress, `Обработка: ${progress.toFixed(1)}%`);
        
        // Обновляем информацию о прогрессе
        if (status.details) {
            const details = `Файлов обработано: ${status.details.files_processed || 0}, ` +
                            `Данных: ${formatFileSize(status.details.bytes_processed || 0)}`;
            showStatus(details, 'info');
        }
        
        // Продолжаем проверять каждые 3 секунды
        setTimeout(checkClusteringStatus, 3000);
    } 
    else if (status.status === 'completed') {
        updateProgress(100, 'Кластеризация завершена!');
        // Получаем результаты
        await getClusteringResults(status.result_url);
    }
    else {
        throw new Error(`Неизвестный статус: ${status.status}`);
    }
    
} catch (error) {
    console.error('Status check error:', error);
    showStatus('Ошибка проверки статуса: ' + error.message, 'error');
    resetUI();
}
}

// Вспомогательные функции
function showStatus(message, type) {
statusText.textContent = message;
statusMessage.className = 'status-message status-' + type;
}

function updateProgress(percent, message) {
progressBar.style.width = percent + '%';
if (message) {
    statusText.textContent = message;
}
}

function startTimer() {
startTime = new Date();
clearInterval(timerInterval);
timerInterval = setInterval(updateTimer, 1000);
}

function updateTimer() {
const now = new Date();
const diff = now - startTime;
const hours = Math.floor(diff / 3600000);
const minutes = Math.floor((diff % 3600000) / 60000);
const seconds = Math.floor((diff % 60000) / 1000);

timerElement.textContent = 
    `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function formatFileSize(bytes) {
if (bytes < 1024) return bytes + ' B';
if (bytes < 1048576) return (bytes / 1024).toFixed(2) + ' KB';
return (bytes / 1048576).toFixed(2) + ' MB';
}

function resetUI() {
selectFolderBtn.disabled = false;
startClusteringBtn.disabled = false;
startClusteringBtn.innerHTML = '🚀 Запустить кластеризацию';
clearInterval(timerInterval);
}

async function getClusteringResults(resultUrl) {
try {
showStatus('Получение результатов...', 'info');

const response = await fetch("/api/result", {
method: "GET",
headers: {
    "Content-Type": "application/json",
    "x-result-url": resultUrl
},
});

if (!response.ok) {
const errorText = await response.text();
throw new Error(`HTTP ${response.status}: ${errorText}`);
}

const results = await response.json();

// Сохраняем данные кластеров
clustersData = results;

// Останавливаем таймер
clearInterval(timerInterval);

// Разблокируем кнопки
selectFolderBtn.disabled = false;
startClusteringBtn.disabled = false;
startClusteringBtn.innerHTML = '🚀 Запустить кластеризацию';

// Активируем кнопку экспорта
exportBtn.disabled = false;

// Отображаем кластеры
displayClusters(results);

showStatus('Кластеризация завершена успешно!', 'success');

} catch (error) {
console.error('Error getting results:', error);
showStatus('Ошибка получения результатов: ' + error.message, 'error');

// Все равно разблокируем UI при ошибке
selectFolderBtn.disabled = false;
startClusteringBtn.disabled = false;
startClusteringBtn.innerHTML = '🚀 Запустить кластеризацию';
clearInterval(timerInterval);
}
}

// Функция для отображения кластеров в дереве
function displayClusters(clustersData) {
console.log('Displaying clusters:', clustersData); // Отладочная информация

clusterTree.innerHTML = '';

if (!clustersData || !clustersData.data || !clustersData.data.children || clustersData.data.children.length === 0) {
clusterTree.innerHTML = '<li class="cluster-item">Кластеры не найдены</li>';
showStatus('Кластеры не найдены в результатах', 'warning');
return;
}

// Отображаем основные кластеры (первый уровень вложенности)
clustersData.data.children.forEach((cluster, index) => {
const clusterItem = createClusterItem(cluster, index, 0);
clusterTree.appendChild(clusterItem);
});

// Активируем первый кластер по умолчанию
if (clusterTree.firstChild) {
clusterTree.firstChild.click();
}
}

// Вспомогательная функция для создания элемента кластера
function createClusterItem(cluster, index, level) {
const clusterItem = document.createElement('li');
clusterItem.className = 'cluster-item';
clusterItem.dataset.clusterId = cluster.id || index;
clusterItem.style.paddingLeft = (level * 20) + 'px'; // Отступ для вложенности

const clusterName = document.createElement('span');
clusterName.textContent = cluster.name || `Кластер ${index + 1}`;

const clusterSize = document.createElement('span');
clusterSize.className = 'cluster-size';
clusterSize.textContent = cluster.fileCount || 0;

clusterItem.appendChild(clusterName);
clusterItem.appendChild(clusterSize);

// Обработчик клика по кластеру
clusterItem.addEventListener('click', (e) => {
e.stopPropagation(); // Предотвращаем всплытие

// Убираем активный класс у всех элементов
document.querySelectorAll('.cluster-item').forEach(item => {
item.classList.remove('active');
});

// Добавляем активный класс текущему элементу
clusterItem.classList.add('active');

// Сохраняем текущий кластер
currentClusterId = cluster.id || index;

// Отображаем информацию о кластере
displayClusterInfo(cluster, index);

// Отображаем документы кластера
displayClusterDocuments(cluster.files || []);
});

// Если есть подкластеры, добавляем их
if (cluster.children && cluster.children.length > 0) {
const subClusterList = document.createElement('ul');
subClusterList.className = 'cluster-tree';
subClusterList.style.marginLeft = '15px';

cluster.children.forEach((subCluster, subIndex) => {
const subClusterItem = createClusterItem(subCluster, subIndex, level + 1);
subClusterList.appendChild(subClusterItem);
});

clusterItem.appendChild(subClusterList);
}

return clusterItem;
}


function displayClusterInfo(cluster, clusterId) {
const similarityText = cluster.avgSimilarity !== undefined ? 
`, Средняя схожесть: ${(cluster.avgSimilarity * 100).toFixed(2)}%` : '';

clusterInfo.textContent = `${cluster.name || `Кластер ${clusterId + 1}`}: ${cluster.fileCount || 0} документов${similarityText}`;

// Здесь можно добавить отображение графика распределения схожести
if (cluster.similarityDistribution) {
updateSimilarityChart(cluster.similarityDistribution);
}
}
// Функция для отображения визуализаций
function displayVisualizations(visualizationData) {
const visualizationsContainer = document.getElementById('visualizationsContainer');
if (!visualizationsContainer) return;

// Проверяем, есть ли хотя бы одна визуализация
const hasVisualizations = visualizationData.graphic_representation || 
                visualizationData.planetar_representation || 
                visualizationData.drill_down_representation;

if (hasVisualizations) {
visualizationsContainer.style.display = 'block';

let html = '<h4 style="margin-bottom: 15px; color: #2c3e50;">🌐 Визуализации кластеризации</h4>';
html += '<div style="display: flex; flex-wrap: wrap; gap: 15px;">';

// Графическая визуализация
if (visualizationData.graphic_representation) {
html += `
    <div class="visualization-item">
        <h4>📊 Графическая визуализация</h4>
        <a href="${visualizationData.graphic_representation}" target="_blank" rel="noopener noreferrer">
            ${visualizationData.graphic_representation}
        </a>
    </div>
`;
} else {
html += `
    <div class="visualization-item disabled">
        <h4>📊 Графическая визуализация</h4>
        <span>Недоступна</span>
    </div>
`;
}

// Планетарная визуализация
if (visualizationData.planetar_representation) {
html += `
    <div class="visualization-item">
        <h4>🪐 Планетарная модель</h4>
        <a href="${visualizationData.planetar_representation}" target="_blank" rel="noopener noreferrer">
            ${visualizationData.planetar_representation}
        </a>
    </div>
`;
} else {
html += `
    <div class="visualization-item disabled">
        <h4>🪐 Планетарная модель</h4>
        <span>Недоступна</span>
    </div>
`;
}

// Drill-down визуализация
if (visualizationData['drill-down_representation']) {
html += `
    <div class="visualization-item">
        <h4>🔍 Drill-down модель</h4>
        <a href="${visualizationData['drill-down_representation']}" target="_blank" rel="noopener noreferrer">
            ${visualizationData['drill-down_representation']}
        </a>
    </div>
`;
} else {
html += `
    <div class="visualization-item disabled">
        <h4>🔍 Drill-down модель</h4>
        <span>Недоступна</span>
    </div>
`;
}

html += '</div>';
visualizationsContainer.innerHTML = html;
} else {
visualizationsContainer.style.display = 'none';
}
}

// Обновим функцию getClusteringResults для отображения визуализаций
async function getClusteringResults(resultUrl) {
try {
showStatus('Получение результатов...', 'info');

const response = await fetch("/api/result", {
method: "GET",
headers: {
    "Content-Type": "application/json",
    "x-result-url": resultUrl
},
});

if (!response.ok) {
const errorText = await response.text();
throw new Error(`HTTP ${response.status}: ${errorText}`);
}

const results = await response.json();

// Сохраняем данные кластеров
clustersData = results;

// Останавливаем таймер
clearInterval(timerInterval);

// Разблокируем кнопки
selectFolderBtn.disabled = false;
startClusteringBtn.disabled = false;
startClusteringBtn.innerHTML = '🚀 Запустить кластеризацию';

// Активируем кнопку экспорта
exportBtn.disabled = false;

// Отображаем кластеры
displayClusters(results);

// Отображаем визуализации
displayVisualizations(results);

showStatus('Кластеризация завершена успешно!', 'success');

} catch (error) {
console.error('Error getting results:', error);
showStatus('Ошибка получения результатов: ' + error.message, 'error');

// Все равно разблокируем UI при ошибке
selectFolderBtn.disabled = false;
startClusteringBtn.disabled = false;
startClusteringBtn.innerHTML = '🚀 Запустить кластеризацию';
clearInterval(timerInterval);
}
}

// Функция для обновления графика схожести
function updateSimilarityChart(distribution) {
// Заглушка для графика - в реальности нужно использовать Chart.js или другую библиотеку
const chartContainer = document.querySelector('.chart-container');
chartContainer.innerHTML = `
<div style="padding: 10px;">
<h4>Распределение схожести в кластере</h4>
<div style="display: flex; height: 100px; align-items: flex-end; gap: 5px;">
    ${distribution.map((value, index) => `
        <div style="display: flex; flex-direction: column; align-items: center; flex: 1;">
            <div style="background: #3498db; width: 80%; height: ${value * 80}px; border-radius: 3px 3px 0 0;"></div>
            <div style="font-size: 10px; margin-top: 5px;">${['0-0.2', '0.2-0.4', '0.4-0.6', '0.6-0.8', '0.8-1.0'][index]}</div>
            <div style="font-size: 10px;">${(value * 100).toFixed(1)}%</div>
        </div>
    `).join('')}
</div>
</div>
`;
}

// Функция для отображения документов в кластере
function displayClusterDocuments(documents) {
if (!documents || documents.length === 0) {
filesTableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 30px;">Документы не найдены</td></tr>';
return;
}

filesTableBody.innerHTML = '';

documents.forEach((doc, index) => {
const row = document.createElement('tr');

const fileNameCell = document.createElement('td');
fileNameCell.textContent = doc.name || doc.filename || `Документ ${index + 1}`;

const similarityCell = document.createElement('td');
similarityCell.textContent = doc.similarity !== undefined ? 
`${(doc.similarity * 100).toFixed(2)}%` : 'N/A';

const sizeCell = document.createElement('td');
sizeCell.textContent = doc.size ? formatFileSize(doc.size) : 'N/A';

const actionsCell = document.createElement('td');
const previewBtn = document.createElement('button');
previewBtn.className = 'btn btn-primary';
previewBtn.textContent = 'Просмотр';
previewBtn.addEventListener('click', () => {
previewDocument(doc);
});
actionsCell.appendChild(previewBtn);

row.appendChild(fileNameCell);
row.appendChild(similarityCell);
row.appendChild(sizeCell);
row.appendChild(actionsCell);

filesTableBody.appendChild(row);
});
}

// Функция для предпросмотра документа
async function previewDocument(documentInfo) {
try {
previewContent.textContent = 'Загрузка содержимого...';

// Если у документа есть контент, показываем его
if (documentInfo.content) {
previewContent.textContent = documentInfo.content;
} 
// Если есть только имя файла, можем попробовать загрузить содержимое
else if (documentInfo.name) {
// Здесь можно добавить запрос к API для получения содержимого файла
previewContent.textContent = `Содержимое файла "${documentInfo.name}" недоступно для предпросмотра.`;
} 
else {
previewContent.textContent = 'Содержимое документа недоступно для предпросмотра';
}

} catch (error) {
console.error('Error previewing document:', error);
previewContent.textContent = 'Ошибка загрузки содержимого: ' + error.message;
}
}
// Функция экспорта результатов
async function exportResults() {
if (!clustersData) {
showStatus('Нет данных для экспорта', 'warning');
return;
}

try {
showStatus('Подготовка экспорта...', 'info');

// Создаем JSON для экспорта с новой структурой
const exportData = {
timestamp: new Date().toISOString(),
folder: currentFolder,
model: modelSelect.value,
clusters: clustersData.data.children || [] // Используем data.children вместо clusters
};

// Создаем blob и скачиваем
const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
type: 'application/json' 
});

const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = `clustering_results_${new Date().toISOString().slice(0, 10)}.json`;
document.body.appendChild(a);
a.click();
document.body.removeChild(a);
URL.revokeObjectURL(url);

showStatus('Результаты экспортированы', 'success');

} catch (error) {
console.error('Export error:', error);
showStatus('Ошибка экспорта: ' + error.message, 'error');
}
}

document.addEventListener('DOMContentLoaded', async () => {
await loadModels();
setupFolderSelector();

startClusteringBtn.addEventListener('click', startClustering);

// Обработчик для кнопки экспорта
exportBtn.addEventListener('click', exportResults);
});

function displayClusters(clustersData) {
console.log('Displaying clusters:', clustersData);

clusterTree.innerHTML = '';

if (!clustersData || !clustersData.data || !clustersData.data.children || clustersData.data.children.length === 0) {
clusterTree.innerHTML = '<div class="empty-folder">Папка пуста</div>';
showStatus('Кластеры не найдены в результатах', 'warning');
return;
}

// Отображаем основные кластеры
clustersData.data.children.forEach((cluster, index) => {
const clusterElement = createClusterElement(cluster, index, 0);
clusterTree.appendChild(clusterElement);
});

// Активируем первый кластер по умолчанию
if (clusterTree.firstChild) {
const firstItem = clusterTree.querySelector('.cluster-item');
if (firstItem) {
firstItem.click();
}
}
}

// Вспомогательная функция для создания элемента кластера
function createClusterElement(cluster, index, level) {
const container = document.createElement('div');

// Основной элемент кластера
const clusterItem = document.createElement('div');
clusterItem.className = 'cluster-item';
clusterItem.dataset.clusterId = cluster.id || index;

// Иконка раскрытия (если есть подкластеры)
const expandIcon = document.createElement('span');
expandIcon.className = 'expand-icon';

// Иконка папки
const folderIcon = document.createElement('span');
folderIcon.className = 'cluster-icon';
folderIcon.innerHTML = '📁';

// Название кластера
const clusterName = document.createElement('span');
clusterName.className = 'cluster-name';
clusterName.textContent = cluster.name || `Кластер ${index + 1}`;

// Количество файлов
const clusterSize = document.createElement('span');
clusterSize.className = 'cluster-size';
clusterSize.textContent = cluster.fileCount || '0';

// Собираем элемент
clusterItem.appendChild(expandIcon);
clusterItem.appendChild(folderIcon);
clusterItem.appendChild(clusterName);
clusterItem.appendChild(clusterSize);

// Контейнер для подкластеров
const subClustersContainer = document.createElement('div');
subClustersContainer.className = 'sub-clusters';

// Обработчик клика по кластеру
clusterItem.addEventListener('click', (e) => {
if (e.target !== expandIcon) {
// Убираем активный класс у всех элементов
document.querySelectorAll('.cluster-item').forEach(item => {
    item.classList.remove('active');
});

// Добавляем активный класс текущему элементу
clusterItem.classList.add('active');

// Сохраняем текущий кластер
currentClusterId = cluster.id || index;

// Отображаем информацию о кластере
displayClusterInfo(cluster, index);

// Отображаем документы кластера
displayClusterDocuments(cluster.files || []);
}
});

// Обработчик для раскрытия/сворачивания
expandIcon.addEventListener('click', (e) => {
e.stopPropagation();

if (cluster.children && cluster.children.length > 0) {
expandIcon.classList.toggle('expanded');
subClustersContainer.classList.toggle('expanded');
}
});

// Если есть подкластеры, добавляем их
if (cluster.children && cluster.children.length > 0) {
// Показываем иконку раскрытия
expandIcon.style.visibility = 'visible';

cluster.children.forEach((subCluster, subIndex) => {
const subClusterElement = createClusterElement(subCluster, subIndex, level + 1);
subClustersContainer.appendChild(subClusterElement);
});
} else {
// Скрываем иконку раскрытия если нет подкластеров
expandIcon.style.visibility = 'hidden';
}

// Собираем контейнер
container.appendChild(clusterItem);
if (cluster.children && cluster.children.length > 0) {
container.appendChild(subClustersContainer);
}

return container;
}

// Функция для отображения информации о кластере
function displayClusterInfo(cluster, clusterId) {
const similarityText = cluster.avgSimilarity !== undefined ? 
`, Средняя схожесть: ${(cluster.avgSimilarity * 100).toFixed(2)}%` : '';

const sizeText = cluster.totalSize ? `, Размер: ${formatFileSize(cluster.totalSize)}` : '';

clusterInfo.textContent = 
`${cluster.name || `Кластер ${clusterId + 1}`}: ${cluster.fileCount || 0} документов${similarityText}${sizeText}`;

// Обновляем график схожести
if (cluster.similarityDistribution) {
updateSimilarityChart(cluster.similarityDistribution);
}
}

// Функция для отображения документов в кластере
function displayClusterDocuments(documents) {
if (!documents || documents.length === 0) {
filesTableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 30px;">Документы не найдены</td></tr>';
return;
}

filesTableBody.innerHTML = '';

// Сортируем документы по схожести
const sortedDocuments = [...documents].sort((a, b) => {
if (sortDirection === 'asc') {
return (a.similarity || 0) - (b.similarity || 0);
} else {
return (b.similarity || 0) - (a.similarity || 0);
}
});

sortedDocuments.forEach((doc, index) => {
const row = document.createElement('tr');

const fileNameCell = document.createElement('td');
fileNameCell.textContent = doc.name || doc.filename || `Документ ${index + 1}`;
fileNameCell.style.maxWidth = '300px';
fileNameCell.style.overflow = 'hidden';
fileNameCell.style.textOverflow = 'ellipsis';
fileNameCell.style.whiteSpace = 'nowrap';

const similarityCell = document.createElement('td');
similarityCell.textContent = doc.similarity !== undefined ? 
`${(doc.similarity * 100).toFixed(2)}%` : 'N/A';
similarityCell.style.textAlign = 'center';

const sizeCell = document.createElement('td');
sizeCell.textContent = doc.size ? formatFileSize(doc.size) : 'N/A';
sizeCell.style.textAlign = 'right';

const actionsCell = document.createElement('td');
actionsCell.style.textAlign = 'center';

const previewBtn = document.createElement('button');
previewBtn.className = 'btn btn-primary';
previewBtn.textContent = '👁️';
previewBtn.title = 'Просмотреть документ';
previewBtn.style.padding = '2px 8px';
previewBtn.style.fontSize = '12px';

previewBtn.addEventListener('click', () => {
previewDocument(doc);
});

actionsCell.appendChild(previewBtn);

row.appendChild(fileNameCell);
row.appendChild(similarityCell);
row.appendChild(sizeCell);
row.appendChild(actionsCell);

filesTableBody.appendChild(row);
});
}

function displayClusters(clustersData) {
    const treeContainer = document.getElementById('clusterTree');
    treeContainer.innerHTML = '';
    maxDepth = 0;
    
    if (!clustersData || !clustersData.data || !clustersData.data.children || clustersData.data.children.length === 0) {
        treeContainer.innerHTML = '<div class="empty-folder">Папка пуста</div>';
        showStatus('Кластеры не найдены в результатах', 'warning');
        return;
    }
    
    // Отображаем основные кластеры
    clustersData.data.children.forEach((cluster, index) => {
        const clusterElement = createClusterElement(cluster, index, 0);
        treeContainer.appendChild(clusterElement);
    });
    
    // Показываем максимальную глубину
    updateScrollIndicator();
    
    // Активируем первый кластер
    setTimeout(() => {
        const firstItem = treeContainer.querySelector('.cluster-item');
        if (firstItem) {
            firstItem.click();
            // Прокручиваем к началу
            treeContainer.parentElement.scrollLeft = 0;
        }
    }, 100);
}

// Создание элемента кластера с учетом вложенности
function createClusterElement(cluster, index, level) {
    maxDepth = Math.max(maxDepth, level);
    
    const container = document.createElement('div');
    container.className = `cluster-level level-${Math.min(level, 10)}`;
    
    const clusterItem = document.createElement('div');
    clusterItem.className = 'cluster-item';
    if (isCompactMode) {
        clusterItem.classList.add('compact');
    }
    clusterItem.dataset.clusterId = cluster.id || index;
    clusterItem.dataset.level = level;
    
    // Отступ в зависимости от уровня
    clusterItem.style.paddingLeft = (level * 20) + 'px';
    
    // Иконка раскрытия
    const expandIcon = document.createElement('span');
    expandIcon.className = 'expand-icon';
    
    // Иконка папки
    const folderIcon = document.createElement('span');
    folderIcon.className = 'cluster-icon';
    folderIcon.innerHTML = '📁';
    
    // Название кластера
    const clusterName = document.createElement('span');
    clusterName.className = 'cluster-name';
    clusterName.textContent = cluster.name || `Кластер ${index + 1}`;
    clusterName.title = cluster.name || `Кластер ${index + 1}`;
    
    // Количество файлов
    const clusterSize = document.createElement('span');
    clusterSize.className = 'cluster-size';
    clusterSize.textContent = cluster.fileCount || '0';
    
    // Сборка элемента
    clusterItem.appendChild(expandIcon);
    clusterItem.appendChild(folderIcon);
    clusterItem.appendChild(clusterName);
    clusterItem.appendChild(clusterSize);
    
    // Контейнер для подкластеров
    const subClustersContainer = document.createElement('div');
    subClustersContainer.className = 'sub-clusters';
    
    // Обработчики событий
    setupClusterEventHandlers(clusterItem, cluster, index, subClustersContainer, expandIcon);
    
    // Добавление подкластеров
    if (cluster.children && cluster.children.length > 0) {
        expandIcon.style.visibility = 'visible';
        
        cluster.children.forEach((subCluster, subIndex) => {
            const subClusterElement = createClusterElement(subCluster, subIndex, level + 1);
            subClustersContainer.appendChild(subClusterElement);
        });
    } else {
        expandIcon.style.visibility = 'hidden';
    }
    
    container.appendChild(clusterItem);
    container.appendChild(subClustersContainer);
    
    return container;
}

// Настройка обработчиков событий
function setupClusterEventHandlers(item, cluster, index, subContainer, expandIcon) {
    // Клик по кластеру
    item.addEventListener('click', (e) => {
        if (e.target !== expandIcon) {
            document.querySelectorAll('.cluster-item').forEach(i => {
                i.classList.remove('active');
            });
            item.classList.add('active');
            currentClusterId = cluster.id || index;
            displayClusterInfo(cluster, index);
            displayClusterDocuments(cluster.files || []);
        }
    });
    
    // Раскрытие/сворачивание
    expandIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        if (cluster.children && cluster.children.length > 0) {
            expandIcon.classList.toggle('expanded');
            subContainer.classList.toggle('expanded');
            updateScrollIndicator();
        }
    });
}

// Управление деревом
function expandAll() {
    document.querySelectorAll('.expand-icon').forEach(icon => {
        if (icon.style.visibility !== 'hidden') {
            icon.classList.add('expanded');
            const subContainer = icon.parentElement.nextElementSibling;
            if (subContainer) {
                subContainer.classList.add('expanded');
            }
        }
    });
    updateScrollIndicator();
}

function collapseAll() {
    document.querySelectorAll('.expand-icon').forEach(icon => {
        icon.classList.remove('expanded');
        const subContainer = icon.parentElement.nextElementSibling;
        if (subContainer) {
            subContainer.classList.remove('expanded');
        }
    });
    updateScrollIndicator();
}

function toggleCompactMode() {
    isCompactMode = !isCompactMode;
    document.querySelectorAll('.cluster-item').forEach(item => {
        item.classList.toggle('compact', isCompactMode);
    });
    document.querySelector('.tree-controls .tree-btn:nth-child(3)').textContent = 
        isCompactMode ? '🔍 Обычный режим' : '🔍 Компактно';
}

// Индикатор прокрутки
function updateScrollIndicator() {
    const container = document.querySelector('.cluster-tree-container');
    const indicator = document.getElementById('scrollIndicator');
    
    if (container.scrollWidth > container.clientWidth) {
        indicator.style.display = 'block';
        indicator.textContent = `→ ${maxDepth}+ уровней`;
    } else {
        indicator.style.display = 'none';
    }
}

// Отслеживание прокрутки
document.querySelector('.cluster-tree-container').addEventListener('scroll', function() {
    const indicator = document.getElementById('scrollIndicator');
    if (this.scrollLeft > 0) {
        indicator.textContent = `→ Прокрутка: ${this.scrollLeft}px`;
    } else {
        indicator.textContent = `→ ${maxDepth}+ уровней`;
    }
});

// Автоматическая прокрутка к активному элементу
function scrollToActiveCluster() {
    const activeItem = document.querySelector('.cluster-item.active');
    if (activeItem) {
        const container = document.querySelector('.cluster-tree-container');
        const itemRect = activeItem.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        
        if (itemRect.left < containerRect.left || itemRect.right > containerRect.right) {
            container.scrollLeft = activeItem.offsetLeft - 100;
        }
    }
}