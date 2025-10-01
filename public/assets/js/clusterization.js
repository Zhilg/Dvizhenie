let currentFolder = null;
let clustersData = null;
let currentClusterId = null;
let timerInterval = null;
let startTime = null;
let currentJobId = null;
let availableModels = [];

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
const modelSelect = document.getElementById('modelSelect');
const startClusteringBtn = document.getElementById('startClusteringBtn');

const API_BASE_URL = '/api';

document.addEventListener('DOMContentLoaded', async () => {
    await loadModels();
    setupFolderSelector();
    startClusteringBtn.addEventListener('click', startClustering);
    exportBtn.addEventListener('click', exportResults);
});

async function loadModels() {
    try {
        const response = await fetch(`${API_BASE_URL}/models`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        availableModels = await response.json();
        modelSelect.innerHTML = '<option value="">Выберите модель</option>';
        availableModels.forEach(model => {
            const option = document.createElement('option');
            option.value = model.model_id;
            option.textContent = model.model_name || model.model_id;
            modelSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading models:', error);
        showStatus('Ошибка загрузки моделей', 'error');
    }
}

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
            const filePath = files[0].webkitRelativePath;
            currentFolder = filePath.split('/')[0];
            const folderDisplay = document.getElementById('selectedFolder');
            if (folderDisplay) {
                folderDisplay.textContent = `Выбрана папка: ${currentFolder}`;
            }
            showStatus(`Выбрана папка: ${currentFolder}`, 'success');
        }
    });

    document.body.appendChild(folderInput);

    selectFolderBtn.addEventListener('click', () => {
        if (window.showDirectoryPicker) {
            openModernFolderPicker();
        } else {
            folderInput.click();
        }
    });
}

async function openModernFolderPicker() {
    try {
        const directoryHandle = await window.showDirectoryPicker();
        const folderName = directoryHandle.name;
        currentFolder = folderName;
        
        const folderDisplay = document.getElementById('selectedFolder');
        if (folderDisplay) {
            folderDisplay.textContent = `Выбрана папка: ${folderName}`;
        }
        showStatus(`Выбрана папка: ${folderName}`, 'success');
        
        await scanDirectory(directoryHandle);
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('Folder picker error:', error);
            showStatus('Ошибка выбора папки', 'error');
        }
    }
}

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

    clusterTree.innerHTML = '';
    filesTableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 30px;">Запуск кластеризации...</td></tr>';
    previewContent.textContent = 'Запуск кластеризации...';

    startTimer();

    try {
        const formData = new FormData();
        
        // Добавляем файлы из currentFolder (предполагается, что это массив файлов или FileList)
        if (currentFolder.files) {
            for (let i = 0; i < currentFolder.files.length; i++) {
                formData.append('files', currentFolder.files[i]);
            }
        }

        const response = await fetch(`${API_BASE_URL}/clusterization`, {
            method: 'POST',
            headers: {
                'x-model-id': modelSelect.value,
                'x-ttl-hours': '0'
            },
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        currentJobId = data.job_id;
        showStatus(`Кластеризация запущена. ID задачи: ${currentJobId}`, 'info');
        checkClusteringStatus();
    } catch (error) {
        console.error('Clustering error:', error);
        showStatus('Ошибка при запуске кластеризации: ' + error.message, 'error');
        resetUI();
    }
}

async function checkClusteringStatus() {
    if (!currentJobId) return;

    try {
        if (currentJobId.startsWith('/')) {
            currentJobId = currentJobId.substring(1);
        }
        const response = await fetch(`${API_BASE_URL}/jobs/${currentJobId}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const status = await response.json();
        
        if (status.status === 'processing') {
            const progress = status.progress || 0;
            updateProgress(progress, `Обработка: ${progress.toFixed(1)}%`);
            
            if (status.details) {
                const details = `Файлов обработано: ${status.details.files_processed || 0}, Данных: ${formatFileSize(status.details.bytes_processed || 0)}`;
                showStatus(details, 'info');
            }
            setTimeout(checkClusteringStatus, 3000);
        } else if (status.status === 'completed') {
            updateProgress(100, 'Кластеризация завершена!');
            await getClusteringResults(status.result_url);
        } else {
            throw new Error(`Неизвестный статус: ${status.status}`);
        }
    } catch (error) {
        console.error('Status check error:', error);
        showStatus('Ошибка проверки статуса: ' + error.message, 'error');
        resetUI();
    }
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
        clustersData = results;

        clearInterval(timerInterval);
        selectFolderBtn.disabled = false;
        startClusteringBtn.disabled = false;
        startClusteringBtn.innerHTML = '🚀 Запустить кластеризацию';
        exportBtn.disabled = false;

        displayClusters(results);
        displayVisualizations(results);
        showStatus('Кластеризация завершена успешно!', 'success');
    } catch (error) {
        console.error('Error getting results:', error);
        showStatus('Ошибка получения результатов: ' + error.message, 'error');
        resetUI();
    }
}

function displayClusters(clustersData) {
    clusterTree.innerHTML = '';

    if (!clustersData || !clustersData.data || !clustersData.data.children || clustersData.data.children.length === 0) {
        clusterTree.innerHTML = '<div class="empty-folder">Папка пуста</div>';
        showStatus('Кластеры не найдены в результатах', 'warning');
        return;
    }

    clustersData.data.children.forEach((cluster, index) => {
        const clusterElement = createClusterElement(cluster, index, 0);
        clusterTree.appendChild(clusterElement);
    });

    setTimeout(() => {
        const firstItem = clusterTree.querySelector('.cluster-item');
        if (firstItem) firstItem.click();
    }, 100);
}

function createClusterElement(cluster, index, level) {
    const container = document.createElement('div');
    const clusterItem = document.createElement('div');
    clusterItem.className = 'cluster-item';
    clusterItem.dataset.clusterId = cluster.id || index;
    clusterItem.style.paddingLeft = (level * 20) + 'px';

    const expandIcon = document.createElement('span');
    expandIcon.className = 'expand-icon';

    const folderIcon = document.createElement('span');
    folderIcon.className = 'cluster-icon';
    folderIcon.innerHTML = '📁';

    const clusterName = document.createElement('span');
    clusterName.className = 'cluster-name';
    clusterName.textContent = cluster.name || `Кластер ${index + 1}`;

    const clusterSize = document.createElement('span');
    clusterSize.className = 'cluster-size';
    clusterSize.textContent = cluster.fileCount || '0';

    clusterItem.appendChild(expandIcon);
    clusterItem.appendChild(folderIcon);
    clusterItem.appendChild(clusterName);
    clusterItem.appendChild(clusterSize);

    const subClustersContainer = document.createElement('div');
    subClustersContainer.className = 'sub-clusters';

    clusterItem.addEventListener('click', (e) => {
        if (e.target !== expandIcon) {
            document.querySelectorAll('.cluster-item').forEach(item => {
                item.classList.remove('active');
            });
            clusterItem.classList.add('active');
            currentClusterId = cluster.id || index;
            displayClusterInfo(cluster, index);
            displayClusterDocuments(cluster.files || []);
        }
    });

    expandIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        if (cluster.children && cluster.children.length > 0) {
            expandIcon.classList.toggle('expanded');
            subClustersContainer.classList.toggle('expanded');
        }
    });

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

function displayClusterInfo(cluster, clusterId) {
    const similarityText = cluster.avgSimilarity !== undefined ? 
    `, Средняя схожесть: ${(cluster.avgSimilarity * 100).toFixed(2)}%` : '';

    clusterInfo.textContent = `${cluster.name || `Кластер ${clusterId + 1}`}: ${cluster.fileCount || 0} документов${similarityText}`;

    if (cluster.similarityDistribution) {
        updateSimilarityChart(cluster.similarityDistribution);
    }
}

function updateSimilarityChart(distribution) {
    const chartContainer = document.querySelector('.chart-container');
    
    // Проверка входных данных
    if (!distribution || !Array.isArray(distribution) || distribution.length === 0) {
        chartContainer.innerHTML = `
            <div style="padding: 20px; text-align: center; color: #666;">
                <p>Данные для графика не доступны</p>
            </div>
        `;
        return;
    }
    
    // Нормализация данных
    const sum = distribution.reduce((acc, val) => acc + val, 0);
    const normalizedDistribution = sum > 0 ? 
        distribution.map(val => val / sum) : 
        distribution.map(() => 1 / distribution.length);
    
    // Подписи для интервалов
    const intervalLabels = ['0-0.2', '0.2-0.4', '0.4-0.6', '0.6-0.8', '0.8-1.0'];
    
    chartContainer.innerHTML = `
    <div style="
        padding: 15px; 
        background: #f8f9fa; 
        border-radius: 8px; 
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        overflow: visible;
        min-height: 200px;
        box-sizing: border-box;
    ">
        <h4 style="margin: 0 0 20px 0; color: #2c3e50; text-align: center;">Распределение схожести в кластере</h4>
        
        <!-- Горизонтальные столбцы -->
        <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 15px;">
            ${normalizedDistribution.map((value, index) => {
                const percentage = (value * 100).toFixed(1);
                const barWidth = value * 100; // Ширина в процентах
                
                return `
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="
                        font-size: 12px; 
                        color: #555; 
                        font-weight: 500;
                        min-width: 50px;
                        text-align: right;
                    ">${intervalLabels[index]}</div>
                    
                    <div style="
                        flex: 1;
                        background: #e0e0e0;
                        border-radius: 4px;
                        height: 25px;
                        min-width: 50px;
                        position: relative;
                        overflow: visible;
                    ">
                        <div style="
                            background: ${getColorByIndex(index)};
                            width: ${barWidth}%;
                            height: 100%;
                            border-radius: 4px;
                            transition: width 0.3s ease;
                            display: flex;
                            align-items: center;
                            justify-content: flex-end;
                            padding: 0 10px;
                            box-sizing: border-box;
                            min-width: fit-content;
                            position: relative;
                        " 
                        title="Интервал: ${intervalLabels[index]}, Доля: ${percentage}%"
                        onmouseover="this.style.filter='brightness(1.1)'"
                        onmouseout="this.style.filter='brightness(1)'"
                        >
                            <span style="
                                color: ${value > 0.15 ? 'white' : '#333'};
                                font-size: 11px;
                                font-weight: 500;
                                text-shadow: ${value > 0.15 ? '1px 1px 2px rgba(0,0,0,0.3)' : 'none'};
                                white-space: nowrap;
                            ">${percentage}%</span>
                        </div>
                    </div>
                    
                    <div style="
                        font-size: 11px; 
                        color: #777; 
                        min-width: 40px;
                        text-align: left;
                    ">${percentage}%</div>
                </div>
                `;
            }).join('')}
        </div>
        
        <!-- Статистика -->
        <div style="
            text-align: center; 
            margin-top: 15px; 
            padding: 10px; 
            background: white; 
            border-radius: 4px; 
            font-size: 12px;
            border: 1px solid #e0e0e0;
        ">
            <strong>Статистика:</strong> 
            Всего элементов: ${distribution.reduce((acc, val) => acc + val, 0).toFixed(0)} |
            Макс. группа: ${(Math.max(...normalizedDistribution) * 100).toFixed(1)}%
        </div>
    </div>
    `;
}

function getColorByIndex(index) {
    const colors = [
        '#3498db', // синий (низкая схожесть)
        '#2980b9', 
        '#f39c12', // оранжевый (средняя)
        '#e74c3c', 
        '#c0392b'  // красный (высокая схожесть)
    ];
    return colors[index] || '#3498db';
}


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
        similarityCell.textContent = doc.similarity !== undefined ? `${(doc.similarity * 100).toFixed(2)}%` : 'N/A';

        const sizeCell = document.createElement('td');
        sizeCell.textContent = doc.size ? formatFileSize(doc.size) : 'N/A';

        const actionsCell = document.createElement('td');
        const previewBtn = document.createElement('button');
        previewBtn.className = 'btn btn-primary';
        previewBtn.textContent = 'Просмотр';
        previewBtn.addEventListener('click', () => previewDocument(doc));
        actionsCell.appendChild(previewBtn);

        row.appendChild(fileNameCell);
        row.appendChild(similarityCell);
        row.appendChild(sizeCell);
        row.appendChild(actionsCell);
        filesTableBody.appendChild(row);
    });
}

function displayVisualizations(visualizationData) {
    const visualizationsContainer = document.getElementById('visualizationsContainer');
    if (!visualizationsContainer) return;

    const hasVisualizations = visualizationData.graphic_representation || 
                            visualizationData.planetar_representation || 
                            visualizationData.drill_down_representation;

    if (hasVisualizations) {
        visualizationsContainer.style.display = 'block';
        let html = '<h4 style="margin-bottom: 15px; color: #2c3e50;">🌐 Визуализации кластеризации</h4><div style="display: flex; flex-wrap: wrap; gap: 15px;">';

        if (visualizationData.graphic_representation) {
            html += `<div class="visualization-item"><h4>📊 Графическая визуализация</h4><a href="${visualizationData.graphic_representation}" target="_blank">${visualizationData.graphic_representation}</a></div>`;
        }
        if (visualizationData.planetar_representation) {
            html += `<div class="visualization-item"><h4>🪐 Планетарная модель</h4><a href="${visualizationData.planetar_representation}" target="_blank">${visualizationData.planetar_representation}</a></div>`;
        }
        if (visualizationData['drill-down_representation']) {
            html += `<div class="visualization-item"><h4>🔍 Drill-down модель</h4><a href="${visualizationData['drill-down_representation']}" target="_blank">${visualizationData['drill-down_representation']}</a></div>`;
        }

        html += '</div>';
        visualizationsContainer.innerHTML = html;
    } else {
        visualizationsContainer.style.display = 'none';
    }
}

async function previewDocument(documentInfo) {
    try {
        previewContent.textContent = 'Загрузка содержимого...';
        if (documentInfo.content) {
            previewContent.textContent = documentInfo.content;
        } else if (documentInfo.name) {
            previewContent.textContent = `Содержимое файла "${documentInfo.name}" недоступно для предпросмотра.`;
        } else {
            previewContent.textContent = 'Содержимое документа недоступно для предпросмотра';
        }
    } catch (error) {
        console.error('Error previewing document:', error);
        previewContent.textContent = 'Ошибка загрузки содержимого: ' + error.message;
    }
}

async function exportResults() {
    if (!clustersData) {
        showStatus('Нет данных для экспорта', 'warning');
        return;
    }

    try {
        showStatus('Подготовка экспорта...', 'info');
        const exportData = {
            timestamp: new Date().toISOString(),
            folder: currentFolder,
            model: modelSelect.value,
            clusters: clustersData.data.children || []
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
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

function showStatus(message, type) {
    statusText.textContent = message;
    statusMessage.className = 'status-message status-' + type;
}

function updateProgress(percent, message) {
    progressBar.style.width = percent + '%';
    if (message) statusText.textContent = message;
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
    timerElement.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
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