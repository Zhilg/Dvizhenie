let currentCorpusId = null;
let clustersData = null;
let currentClusterId = null;
let timerInterval = null;
let startTime = null;
let currentJobId = null;
let availableModels = [];
let corpusHistory = [];
let modelSelect = null;

const corpusSelect = document.getElementById('corpusSelect');
const exportBtn = document.getElementById('exportBtn');
const timerElement = document.getElementById('timer');
const progressBar = document.getElementById('progressBar');
const clusterTree = document.getElementById('clusterTree');
const clusterInfo = document.getElementById('clusterInfo');
const filesTableBody = document.getElementById('filesTableBody');
const previewContent = document.getElementById('previewContent');
const statusMessage = document.getElementById('statusMessage');
const statusText = document.getElementById('statusText');
const startClusteringBtn = document.getElementById('startClusteringBtn');

const API_BASE_URL = '/api';
const BASE_URL = '/api';

document.addEventListener('DOMContentLoaded', async () => {
    await loadModels();
    await loadCorpusHistory();
    startClusteringBtn.addEventListener('click', startClustering);
    exportBtn.addEventListener('click', exportResults);

    // Setup JSON upload functionality
    setupJsonUpload();

    // Обработчик изменения лимита кластеров
    const clusterLimitSelect = document.getElementById('clusterLimit');
    const clusterLimitCustom = document.getElementById('clusterLimitCustom');

    if (clusterLimitSelect) {
        clusterLimitSelect.addEventListener('change', () => {
            if (clusterLimitSelect.value === 'custom') {
                clusterLimitCustom.style.display = 'block';
                clusterLimitCustom.focus();
            } else {
                clusterLimitCustom.style.display = 'none';
                if (clustersData) {
                    displayClusters(clustersData);
                }
            }
        });
    }

    if (clusterLimitCustom) {
        clusterLimitCustom.addEventListener('change', () => {
            if (clustersData && clusterLimitCustom.value) {
                displayClusters(clustersData);
            }
        });

        clusterLimitCustom.addEventListener('keyup', (e) => {
            if (e.key === 'Enter' && clustersData && clusterLimitCustom.value) {
                displayClusters(clustersData);
            }
        });
    }

    // Инициализация resizable сайдбара
    initResizableSidebar();

    // Инициализация поиска файлов
    initFileSearch();
});

async function loadModels() {
    try {
        const response = await apiFetch(`${BASE_URL}/models`);
        if (response.ok) {
            availableModels = await response.json();
        }
    } catch (error) {
        console.error("Error loading models:", error);
    }
}

function getModelNameById(modelId) {
    const model = availableModels.find(m => m.model_id === modelId);
    return model ? (model.model_name || model.model_id) : modelId;
}

async function loadCorpusHistory() {
    try {
        const response = await apiFetch('/corpus-history');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        corpusHistory = await response.json();
        const corpusSelect = document.getElementById('corpusSelect');
        const noCorpusMessage = document.getElementById('noCorpusMessage');
        const mainContent = document.getElementById('mainContent');

        corpusSelect.innerHTML = '';

        if (!corpusHistory || corpusHistory.length === 0) {
            // If no corpora, show full-page message and hide everything else
            corpusSelect.style.display = 'none';
            noCorpusMessage.style.display = 'block';
            noCorpusMessage.style.textAlign = 'center';
            noCorpusMessage.style.padding = '50px';
            noCorpusMessage.style.fontSize = '1.5em';

            // Hide all other content
            if (mainContent) mainContent.style.display = 'none';

            showStatus('Корпусы не найдены', 'warning');
            return;
        } else {
            // If corpora exist, show normal interface
            corpusSelect.style.display = 'block';
            noCorpusMessage.style.display = 'none';
            if (mainContent) mainContent.style.display = 'block';

            corpusSelect.innerHTML = '<option value="">Выберите корпус</option>';
            corpusHistory.forEach(corpus => {
                console.log(corpus);
                const option = document.createElement('option');
                option.value = corpus.id;

                // Format date consistently
                const formattedDate = formatDate(corpus.date);

                // Build comprehensive display text with name first
                const displayParts = [];
                if (corpus.name) {
                    const displayName = decodeURIComponent(corpus.name);
                    displayParts.push(`${displayName}`);
                }
                displayParts.push(`ID: ${corpus.id}`);
                displayParts.push(`Путь: ${corpus.corpus_path || 'Неизвестен'}`);
                displayParts.push(`Модель: ${getModelNameById(corpus.model)}`);
                displayParts.push(`Дата: ${formattedDate}`);
                displayParts.push(`Файлов: ${corpus.files || 0}`);

                option.textContent = displayParts.join(' | ');
                option.dataset.corpusId = corpus.id;
                option.dataset.modelId = corpus.model;
                option.dataset.timestamp = corpus.date;
                corpusSelect.appendChild(option);
            });
        }
        
        corpusSelect.addEventListener('change', (event) => {
            const selectedOption = event.target.options[event.target.selectedIndex];
            currentCorpusId = selectedOption.dataset.corpusId;
            modelSelect = selectedOption.dataset.modelId; // This preserves the selected model
            
            if (currentCorpusId && modelSelect) {
                showStatus(`Выбран корпус: ${selectedOption.textContent}, модель установлена`, 'success');
            } else if (currentCorpusId) {
                showStatus(`Выбран корпус: ${selectedOption.textContent}`, 'success');
            }
        });
        
    } catch (error) {
        console.error('Error loading corpus history:', error);
        showStatus('Ошибка загрузки истории корпусов', 'error');
    }
}

async function startClustering() {
    if (!currentCorpusId) {
        showStatus('Сначала выберите корпус', 'error');
        return;
    }
    if (!modelSelect) {
        showStatus('Выберите модель для кластеризации', 'error');
        return;
    }

    showStatus('Запуск кластеризации...', 'info');
    corpusSelect.disabled = true;
    startClusteringBtn.disabled = true;
    startClusteringBtn.innerHTML = '<span class="loading"></span> Обработка...';

    clusterTree.innerHTML = '';
    filesTableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 30px;">Запуск кластеризации...</td></tr>';
    previewContent.textContent = 'Запуск кластеризации...';

    startTimer();

    try {
        
        const response = await apiFetch(`${API_BASE_URL}/clusterization`, {
            method: 'POST',
            headers: {
                'x-model-id': modelSelect,
                'x-ttl-hours': '0',
                'x-corpus-id': currentCorpusId
            }
        });
        console.log(modelSelect, currentCorpusId);
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
        const response = await apiFetch(`${API_BASE_URL}/jobs/${currentJobId}`);
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

        const response = await apiFetch("/api/result", {
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
        corpusSelect.disabled = false;
        startClusteringBtn.disabled = false;
        startClusteringBtn.innerHTML = 'Запустить кластеризацию';
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
        clusterTree.innerHTML = '<div class="empty-folder">Кластеры не найдены</div>';
        showStatus('Кластеры не найдены в результатах', 'warning');
        return;
    }

    // Сортируем кластеры по количеству файлов (от большего к меньшему)
    const sortedClusters = [...clustersData.data.children].sort((a, b) => {
        const countA = a.fileCount || 0;
        const countB = b.fileCount || 0;
        return countB - countA;
    });

    // Получаем количество кластеров из селектора или custom input
    const clusterLimitSelect = document.getElementById('clusterLimit');
    const clusterLimitCustom = document.getElementById('clusterLimitCustom');

    let limit = 10; // значение по умолчанию

    if (clusterLimitSelect) {
        if (clusterLimitSelect.value === 'custom' && clusterLimitCustom && clusterLimitCustom.value) {
            limit = parseInt(clusterLimitCustom.value) || 10;
        } else if (clusterLimitSelect.value !== 'custom') {
            limit = parseInt(clusterLimitSelect.value) || 10;
        }
    }

    // Ограничиваем до выбранного количества
    const topClusters = sortedClusters.slice(0, limit);
    const totalClusters = sortedClusters.length;

    topClusters.forEach((cluster, index) => {
        const clusterElement = createClusterElement(cluster, index, 0);
        clusterTree.appendChild(clusterElement);
    });

    // Добавляем индикатор, если кластеров больше выбранного лимита
    if (totalClusters > limit) {
        const indicator = document.createElement('div');
        indicator.className = 'cluster-limit-indicator';
        indicator.textContent = `Показано ${limit} из ${totalClusters} кластеров`;
        clusterTree.appendChild(indicator);
    }

    setTimeout(() => {
        const firstItem = clusterTree.querySelector('.cluster-item');
        if (firstItem) firstItem.click();
    }, 100);
}

function createClusterElement(cluster, index, level) {
    if (!cluster) return document.createElement('div'); // Return empty div for null clusters

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
    clusterSize.textContent = (cluster && typeof cluster.fileCount === 'number') ? cluster.fileCount.toString() : '0';

    clusterItem.appendChild(expandIcon);
    clusterItem.appendChild(folderIcon);
    clusterItem.appendChild(clusterName);
    clusterItem.appendChild(clusterSize);

    // Получаем количество кластеров из селектора или custom input
    const clusterLimitSelect = document.getElementById('clusterLimit');
    const clusterLimitCustom = document.getElementById('clusterLimitCustom');

    let limit = 10; // значение по умолчанию

    if (clusterLimitSelect) {
        if (clusterLimitSelect.value === 'custom' && clusterLimitCustom && clusterLimitCustom.value) {
            limit = parseInt(clusterLimitCustom.value) || 10;
        } else if (clusterLimitSelect.value !== 'custom') {
            limit = parseInt(clusterLimitSelect.value) || 10;
        }
    }

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

        // Сортируем подкластеры по количеству файлов (от большего к меньшему)
        const sortedChildren = [...cluster.children].sort((a, b) => {
            const countA = a.fileCount || 0;
            const countB = b.fileCount || 0;
            return countB - countA;
        });

        // Ограничиваем до топ-10
        const topChildren = sortedChildren.slice(0, limit);
        const totalChildren = sortedChildren.length;

        topChildren.forEach((subCluster, subIndex) => {
            const subClusterElement = createClusterElement(subCluster, subIndex, level + 1);
            subClustersContainer.appendChild(subClusterElement);
        });

        // Добавляем индикатор, если подкластеров больше 10
        if (totalChildren > limit) {
            const indicator = document.createElement('div');
            indicator.className = 'cluster-limit-indicator';
            indicator.style.paddingLeft = ((level + 1) * 20) + 'px';
            indicator.textContent = `Показано топ-${limit} из ${totalChildren} подкластеров`;
            subClustersContainer.appendChild(indicator);
        }
    } else {
        expandIcon.style.visibility = 'hidden';
    }

    container.appendChild(clusterItem);
    container.appendChild(subClustersContainer);
    return container;
}

function displayClusterInfo(cluster, clusterId) {
    const fileCount = (cluster && typeof cluster.fileCount === 'number') ? cluster.fileCount : 0;
    const clusterName = (cluster && cluster.name) ? cluster.name : `Кластер ${clusterId + 1}`;
    const similarityText = (cluster && cluster.avgSimilarity !== undefined) ?
    ` | Средняя схожесть: ${(cluster.avgSimilarity * 100).toFixed(2)}%` : '';

    // Добавляем информацию о подкластерах
    const childrenCount = (cluster && cluster.children) ? cluster.children.length : 0;
    const childrenText = childrenCount > 0 ? ` | Подкластеров: ${Math.min(childrenCount, 10)}${childrenCount > 10 ? ' (из ' + childrenCount + ')' : ''}` : '';

    clusterInfo.textContent = `${clusterName}: ${fileCount} документов${similarityText}${childrenText}`;

    // Add small delay to ensure DOM is ready
    setTimeout(() => {
        if (cluster && cluster.similarityDistribution) {
            updateSimilarityChart(cluster.similarityDistribution);
        } else {
            // Fallback for clusters without distribution data
            const fallbackContainer = document.getElementById('chartContainer');
            if (fallbackContainer) {
                fallbackContainer.innerHTML = `
                    <div style="padding: 20px; text-align: center; color: #666;">
                        <p>График схожести недоступен для этого кластера</p>
                    </div>
                `;
            }
        }
    }, 50);
}

function updateSimilarityChart(distribution) {
    const chartContainer = document.getElementById('chartContainer');

    try {
        if (!distribution || !Array.isArray(distribution) || distribution.length === 0) {
            chartContainer.innerHTML = `
                <div style="padding: 20px; text-align: center; color: #666;">
                    <p>Данные для графика не доступны</p>
                </div>
            `;
            return;
        }

        const sum = distribution.reduce((acc, val) => acc + val, 0);
        const normalizedDistribution = sum > 0 ?
            distribution.map(val => val / sum) :
            distribution.map(() => 1 / distribution.length);

        const intervalLabels = ['0-0.2', '0.2-0.4', '0.4-0.6', '0.6-0.8', '0.8-1.0'];

        // Use table-based layout for better cross-browser compatibility
        const chartHTML = `
        <div style="
            padding: 15px;
            background: #f8f9fa;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            overflow: visible;
            height: auto;
            width: 100%;
            box-sizing: border-box;
        ">
            <h4 style="margin: 0 0 20px 0; color: #2c3e50; text-align: center;">Распределение схожести в кластере</h4>

            <!-- Table-based layout for cross-browser compatibility -->
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px;">
                <tbody>
                    ${normalizedDistribution.map((value, index) => {
                        const percentage = (value * 100).toFixed(1);
                        const barWidth = Math.max(value * 100, 5); // Minimum 5% width

                        return `
                        <tr>
                            <td style="
                                font-size: 12px;
                                color: #555;
                                font-weight: 500;
                                width: 50px;
                                text-align: right;
                                padding-right: 10px;
                                vertical-align: middle;
                            ">${intervalLabels[index]}</td>

                            <td style="
                                background: #e0e0e0;
                                border-radius: 4px;
                                height: 25px;
                                position: relative;
                                overflow: visible;
                                vertical-align: middle;
                            ">
                                <div style="
                                    background: ${getColorByIndex(index)};
                                    width: ${barWidth}%;
                                    height: 100%;
                                    border-radius: 4px;
                                    position: relative;
                                    text-align: right;
                                    padding-right: 10px;
                                    box-sizing: border-box;
                                    min-width: 30px;
                                "
                                title="Интервал: ${intervalLabels[index]}, Доля: ${percentage}%"
                                onmouseover="this.style.opacity='0.8'"
                                onmouseout="this.style.opacity='1'"
                                >
                                    <span style="
                                        color: ${value > 0.15 ? 'white' : '#333'};
                                        font-size: 11px;
                                        font-weight: 500;
                                        line-height: 25px;
                                        text-shadow: ${value > 0.15 ? '1px 1px 2px rgba(0,0,0,0.3)' : 'none'};
                                        white-space: nowrap;
                                    ">${percentage}%</span>
                                </div>
                            </td>

                            <td style="
                                font-size: 11px;
                                color: #777;
                                width: 40px;
                                text-align: left;
                                padding-left: 10px;
                                vertical-align: middle;
                            ">${percentage}%</td>
                        </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>

            <!-- Статистика -->
            <div style="
                text-align: center;
                margin-top: 15px;
                padding: 10px;
                background: white;
                border-radius: 4px;
                font-size: 12px;
                border: 1px solid #e6dedeff;
                width: 100%;
                box-sizing: border-box;
            ">
                <strong>Статистика:</strong>
                Всего элементов: ${distribution.reduce((acc, val) => acc + val, 0).toFixed(0)} |
                Макс. группа: ${(Math.max(...normalizedDistribution) * 100).toFixed(1)}%
            </div>
        </div>
        `;

        chartContainer.innerHTML = chartHTML;

    } catch (error) {
        console.error('Error rendering similarity chart:', error);
        chartContainer.innerHTML = `
            <div style="padding: 20px; text-align: center; color: #666; border: 1px solid #ddd; border-radius: 4px;">
                <p>Ошибка отображения графика</p>
                <p style="font-size: 12px; color: #999;">${error.message}</p>
            </div>
        `;
    }
}

function getColorByIndex(index) {
    const colors = [
        '#c0392b',
        '#e74c3c', 
        '#f39c12',
        '#abf000', 
        '#00cc00'
    ];
    return colors[index] || '#3498db';
}

function displayClusterDocuments(documents) {
    if (!documents || documents.length === 0) {
        filesTableBody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 30px;">Документы не найдены</td></tr>';

        // Обновляем заголовок панели
        const panelHeader = document.querySelector('.panel_documents .panel-header');
        if (panelHeader) {
            panelHeader.querySelector('span').textContent = 'Документы в кластере';
        }
        return;
    }

    // Сортируем документы по схожести (от большей к меньшей)
    const sortedDocuments = [...documents].sort((a, b) => {
        const simA = (a && a.similarity !== undefined) ? a.similarity : 0;
        const simB = (b && b.similarity !== undefined) ? b.similarity : 0;
        return simB - simA;
    });

    // Обновляем заголовок панели
    const panelHeader = document.querySelector('.panel_documents .panel-header');
    if (panelHeader) {
        panelHeader.innerHTML = `<span>Документы в кластере: ${sortedDocuments.length} шт.</span>`;
    }

    filesTableBody.innerHTML = '';
    sortedDocuments.forEach((doc, index) => {
        if (!doc) return; // Skip null/undefined documents

        const row = document.createElement('tr');

        const fileNameCell = document.createElement('td');
        fileNameCell.textContent = (doc && (doc.name || doc.filename)) ? (doc.name || doc.filename) : `Документ ${index + 1}`;
        fileNameCell.style.wordBreak = 'break-word';

        const sizeCell = document.createElement('td');
        sizeCell.textContent = (doc && doc.size) ? formatFileSize(doc.size) : 'N/A';

        const actionsCell = document.createElement('td');
        const previewBtn = document.createElement('button');
        previewBtn.className = 'btn btn-primary';
        previewBtn.textContent = 'Просмотр';
        previewBtn.addEventListener('click', () => previewDocument(doc));
        actionsCell.appendChild(previewBtn);

        row.appendChild(fileNameCell);
        row.appendChild(sizeCell);
        row.appendChild(actionsCell);
        filesTableBody.appendChild(row);
    });
}

// Отображение ссылок на визуализации кластеризации
function displayVisualizations(visualizationData) {
    const visualizationsContainer = document.getElementById('visualizationsContainer');
    if (!visualizationsContainer) return;

    const hasVisualizations = visualizationData.graphic_representation ||
                              visualizationData.planetar_representation ||
                              visualizationData.drill_down_representation;

    if (hasVisualizations) {
        visualizationsContainer.style.display = 'block';

        // Формируем URL фронтенда с портом 3000
        const currentLocation = window.location;
        const frontendUrl = `${currentLocation.protocol}//${currentLocation.hostname}:3000`;

        const getFullUrl = (url) => {
            if (/^https?:\/\//i.test(url) || /^ftp:\/\//i.test(url)) {
                return url; 
            } else if (url.startsWith('/')) {
                return frontendUrl + url; 
            } else {
                return frontendUrl + '/' + url; 
            }
        };

        let html = '<h4 style="margin-bottom: 15px; color: #2c3e50;">Визуализации кластеризации</h4><div style="display: flex; flex-wrap: wrap; gap: 15px;">';

        if (visualizationData.graphic_representation) {
            const fullUrl = getFullUrl(visualizationData.graphic_representation);
            html += `<div class="visualization-item"><h4>Графическая визуализация</h4><a href="${fullUrl}" target="_blank">${fullUrl}</a></div>`;
        }
        
        if (visualizationData.planetar_representation) {
            const fullUrl = getFullUrl(visualizationData.planetar_representation);
            html += `<div class="visualization-item"><h4>Планетарная модель</h4><a href="${fullUrl}" target="_blank">${fullUrl}</a></div>`;
        }
        
        if (visualizationData['drill-down_representation']) {
            const fullUrl = getFullUrl(visualizationData['drill-down_representation']);
            html += `<div class="visualization-item"><h4>Drill-down модель</h4><a href="${fullUrl}" target="_blank">${fullUrl}</a></div>`;
        }

        html += '</div>';
        visualizationsContainer.innerHTML = html;
    } else {
        visualizationsContainer.style.display = 'none';
    }
}

// Просмотр содержимого документа из кластера
async function previewDocument(documentInfo) {
    try {
        previewContent.textContent = 'Загрузка содержимого...';
        const previewTitle = document.getElementById('previewTitle');
        previewTitle.textContent = 'Предпросмотр документа';
        previewTitle.classList.remove('highlight-file');

        if (!documentInfo.name || !currentCorpusId) {
            previewContent.textContent = 'Недостаточно информации для загрузки документа';
            return;
        }

        const response = await apiFetch(`${BASE_URL}/document?corpus_id=${currentCorpusId}&document_id=${documentInfo.name}`);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        const content = await response.text();
        previewContent.textContent = content;

        // Обновление заголовка с именем файла и подсветка
        const fileName = documentInfo.name || documentInfo.filename || 'Неизвестный файл';
        previewTitle.textContent = `Предпросмотр: ${fileName}`;
        previewTitle.classList.add('highlight-file');
    } catch (error) {
        console.error('Error previewing document:', error);
        previewContent.textContent = 'Ошибка загрузки содержимого: ' + error.message;
        const previewTitle = document.getElementById('previewTitle');
        previewTitle.textContent = 'Предпросмотр документа';
        previewTitle.classList.remove('highlight-file');
    }
}

let uploadedCorpusMetadata = null; // Global variable to store uploaded corpus metadata
let uploadedCorpusName = null;     // Global variable to store corpus name
let uploadedModelInfo = null;      // Global variable to store model information

// Setup JSON upload event listeners
function setupJsonUpload() {
    const uploadBtn = document.getElementById('uploadBtn');
    const fileInput = document.getElementById('jsonUpload');
    
    if (uploadBtn && fileInput) {
        uploadBtn.addEventListener('click', () => {
            fileInput.click();
        });
        
        fileInput.addEventListener('change', handleFileUpload);
    }
}

// Handle JSON file upload and processing
async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Validate file type
    if (!file.name.toLowerCase().endsWith('.json')) {
        showStatus('Пожалуйста, выберите файл с расширением .json', 'error');
        return;
    }
    
    // Validate file size (max 50MB)
    if (file.size > 50 * 1024 * 1024) {
        showStatus('Размер файла не должен превышать 50 МБ', 'error');
        return;
    }
    
    try {
        showStatus('Загрузка файла...', 'info');
        const fileContent = await readFileAsText(file);
        showStatus('Парсинг JSON...', 'info');
        
        let jsonData;
        try {
            jsonData = JSON.parse(fileContent);
        } catch (parseError) {
            throw new Error('Некорректный JSON файл: ' + parseError.message);
        }
        
        showStatus('Валидация данных...', 'info');
        
        // Validate clustering result schema
        const validationResult = validateClusteringSchema(jsonData);
        if (!validationResult.isValid) {
            throw new Error('Неверный формат данных: ' + validationResult.errors.join(', '));
        }
        
        showStatus('Загрузка результатов...', 'info');
        
        // Process and display the uploaded data
        await processUploadedClusteringResults(jsonData);
        
        const fileCount = calculateTotalFileCount(clustersData.data.children);
        const corpusName = uploadedCorpusName || `Корпус_${currentCorpusId}`;
        const model = uploadedModelInfo || 'Неизвестная модель';
        const corpusId = currentCorpusId || 'неизвестный';
        
        const successMessage = `✅ Файл успешно загружен!
Корпус: ${corpusName}
Файлов: ${fileCount}
Модель: ${model}
ID: ${corpusId}`;
        
        showStatus(successMessage, 'success');
        
    } catch (error) {
        console.error('JSON upload error:', error);
        showStatus('❌ Ошибка: ' + error.message, 'error');
    } finally {
        // Clear file input
        event.target.value = '';
    }
}

// Validate clustering result schema
function validateClusteringSchema(data) {
    const errors = [];
    
    // Check if data is an object
    if (!data || typeof data !== 'object') {
        errors.push('Данные должны быть объектом');
        return { isValid: false, errors };
    }
    
    // Check for required data structure - support both legacy and API formats
    let clustersArray = null;
    
    if (data.timestamp && data.corpus_id && data.clusters) {
        // Legacy format
        clustersArray = data.clusters;
    } else if (data.data && data.data.children) {
        // API format
        clustersArray = data.data.children;
    } else {
        errors.push('Отсутствует обязательная структура данных (timestamp+corpus_id+clusters или data+children)');
        return { isValid: false, errors };
    }
    
    // Validate clusters array
    if (!clustersArray || !Array.isArray(clustersArray)) {
        errors.push('Clusters должно быть массивом');
        return { isValid: false, errors };
    }
    
    // Validate each cluster
    clustersArray.forEach((cluster, index) => {
        if (!cluster || typeof cluster !== 'object') {
            errors.push(`Кластер ${index + 1} должен быть объектом`);
            return;
        }
        
        // Check required fields
        if (cluster.id === undefined) {
            errors.push(`Кластер ${index + 1} должен иметь поле "id"`);
        }
        
        if (cluster.name === undefined) {
            errors.push(`Кластер ${index + 1} должен иметь поле "name"`);
        }
        
        if (cluster.fileCount === undefined) {
            errors.push(`Кластер ${index + 1} должен иметь поле "fileCount"`);
        }
        
        // Validate nested structures if present
        if (cluster.children && !Array.isArray(cluster.children)) {
            errors.push(`Поле "children" в кластере ${index + 1} должно быть массивом`);
        }
        
        if (cluster.files && !Array.isArray(cluster.files)) {
            errors.push(`Поле "files" в кластере ${index + 1} должно быть массивом`);
        }
    });
    
    return {
        isValid: errors.length === 0,
        errors
    };
}

// Process uploaded clustering results
async function processUploadedClusteringResults(jsonData) {
    try {
        // Determine format and convert if needed
        if (jsonData.timestamp && jsonData.corpus_id && jsonData.clusters) {
            // Legacy format - convert to API format
            clustersData = {
                folder: `shared_data/corpus_${jsonData.corpus_id}`,
                data: {
                    id: "root",
                    name: "Все кластеры",
                    children: jsonData.clusters
                }
            };
            
            // Store ALL metadata from uploaded file
            uploadedCorpusMetadata = { ...jsonData }; // Preserves ALL fields including visualization links
            
            // Store individual components for convenience
            uploadedCorpusName = jsonData.corpus_name || getCorpusNameFromClusters(jsonData.clusters) || `Корпус_${jsonData.corpus_id}`;
            uploadedModelInfo = jsonData.model || 'Неизвестная модель';
            currentCorpusId = jsonData.corpus_id;
            
        } else if (jsonData.data && jsonData.data.children) {
            // API format - use as is
            clustersData = jsonData;
        } else {
            throw new Error('Неверный формат данных кластеризации');
        }

        // Display clusters and visualizations using existing functions
        displayClusters(clustersData);
        displayVisualizations(clustersData);
        
        // Enable export button
        exportBtn.disabled = false;
        
    } catch (error) {
        console.error('Error processing uploaded data:', error);
        throw new Error('Ошибка обработки загруженных данных: ' + error.message);
    }
}

// Calculate total file count from cluster hierarchy
function calculateTotalFileCount(clusters) {
    if (!clusters || !Array.isArray(clusters)) return 0;
    
    let total = 0;
    clusters.forEach(cluster => {
        if (cluster.fileCount) {
            total += cluster.fileCount;
        }
        if (cluster.children && Array.isArray(cluster.children)) {
            total += calculateTotalFileCount(cluster.children);
        }
    });
    return total;
}

// Extract corpus name from cluster names if not provided
function getCorpusNameFromClusters(clusters) {
    if (!clusters || !Array.isArray(clusters) || clusters.length === 0) return null;
    
    // Try to get a meaningful name from the root clusters
    const rootClusterNames = clusters.map(c => c.name).filter(name => name);
    if (rootClusterNames.length > 0) {
        return rootClusterNames.join(', ');
    }
    
    return null;
}

// Чтение файла как текст
function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => reject(new Error('Ошибка чтения файла'));
        reader.readAsText(file);
    });
}

// Экспорт результатов кластеризации в JSON файл
async function exportResults() {
    if (!clustersData) {
        showStatus('Нет данных для экспорта', 'warning');
        return;
    }

    try {
        showStatus('Подготовка экспорта...', 'info');
        
        // Create deep copy to avoid modifying original data
        const clustersToExport = JSON.parse(JSON.stringify(clustersData.data.children || []));
        
        // Use preserved metadata if available (from uploaded file), otherwise create new
        let exportData;
        if (uploadedCorpusMetadata && uploadedCorpusMetadata.timestamp && uploadedCorpusMetadata.corpus_id) {
            // PRESERVE ALL ORIGINAL FIELDS from uploaded file using spread operator
            exportData = { ...uploadedCorpusMetadata };  // ALL original fields including visualization links, model, etc.
            exportData.clusters = clustersToExport;       // Updated clusters with preserved similarityDistribution
            
            // Update file_count with calculated value (in case clusters changed)
            exportData.file_count = calculateTotalFileCount(clustersToExport);
            
            console.log('Exporting with ALL preserved fields:', {
                hasGraphicRep: !!exportData.graphic_representation,
                hasPlanetarRep: !!exportData.planetar_representation,
                hasModel: !!exportData.model,
                fileCount: exportData.file_count,
                corpusName: exportData.corpus_name
            });
            
        } else {
            // Create new metadata for data generated in current session
            const totalFileCount = calculateTotalFileCount(clustersToExport);
            
            exportData = {
                timestamp: new Date().toISOString(),
                corpus_id: currentCorpusId || 'exported_corpus',
                corpus_name: uploadedCorpusName || `Экспортированный_корпус_${new Date().toISOString().slice(0, 10)}`,
                file_count: totalFileCount,
                model: uploadedModelInfo || 'Неизвестная модель',
                clusters: clustersToExport
            };
            
            console.log('Exporting with new metadata:', {
                corpusName: exportData.corpus_name,
                fileCount: exportData.file_count,
                model: exportData.model
            });
        }

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

// Отображение статуса операции в интерфейсе
function showStatus(message, type) {
    statusText.textContent = message;
    statusMessage.className = 'status-message status-' + type;
}

// Обновление индикатора прогресса
function updateProgress(percent, message) {
    progressBar.style.width = percent + '%';
    if (message) statusText.textContent = message;
}

// Запуск таймера выполнения кластеризации
function startTimer() {
    startTime = new Date();
    clearInterval(timerInterval);
    timerInterval = setInterval(updateTimer, 1000);
}

// Обновление отображения таймера
function updateTimer() {
    const now = new Date();
    const diff = now - startTime;
    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    timerElement.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Форматирование размера файла в человеко-читаемый вид
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / 1048576).toFixed(2) + ' MB';
}

// Форматирование даты в человеко-читаемый вид
function formatDate(dateString) {
    if (!dateString) return 'Неизвестно';

    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'Некорректная дата';

        // Format as DD.MM.YYYY HH:MM
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');

        return `${day}.${month}.${year} ${hours}:${minutes}`;
    } catch (error) {
        console.error('Error formatting date:', error);
        return 'Ошибка формата';
    }
}

// Сброс интерфейса в исходное состояние
function resetUI() {
    corpusSelect.disabled = false;
    startClusteringBtn.disabled = false;
    startClusteringBtn.innerHTML = 'Запустить кластеризацию';
    clearInterval(timerInterval);
}

// Инициализация изменяемого размера сайдбара
function initResizableSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const container = document.querySelector('.container');

    if (!sidebar || !container) return;

    // Создаём handle для изменения размера
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'resize-handle';
    sidebar.appendChild(resizeHandle);

    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    resizeHandle.addEventListener('mousedown', (e) => {
        isResizing = true;
        startX = e.clientX;
        startWidth = sidebar.offsetWidth;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        const delta = e.clientX - startX;
        const newWidth = startWidth + delta;

        // Ограничиваем ширину от 300px до 900px
        if (newWidth >= 300 && newWidth <= 900) {
            container.style.gridTemplateColumns = `${newWidth}px 1fr`;
        }
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });
}

// Инициализация функциональности поиска файлов
function initFileSearch() {
    const fileSearchInput = document.getElementById('fileSearch');
    const clearSearchBtn = document.getElementById('clearSearchBtn');

    if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', clearFileSearch);
    }

    if (fileSearchInput) {
        // Поиск в реальном времени при вводе
        fileSearchInput.addEventListener('input', () => {
            performFileSearch();
        });

        // Поиск по нажатию Enter
        fileSearchInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') {
                performFileSearch();
            }
        });
    }
}

// Выполнение поиска файла в кластерах
function performFileSearch() {
    const fileSearchInput = document.getElementById('fileSearch');
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    const searchInfo = document.getElementById('searchInfo');
    const clustersLabel = document.getElementById('clustersLabel');
    const searchQuery = fileSearchInput.value.trim();

    if (!clustersData || !clustersData.data || !clustersData.data.children) {
        return;
    }

    if (!searchQuery) {
        // Если поисковый запрос пустой, показываем все кластеры
        clearFileSearch();
        return;
    }

    // Фильтруем кластеры, оставляя только те, в которых есть искомый файл
    const filteredData = {
        ...clustersData,
        data: {
            ...clustersData.data,
            children: filterClustersWithFile(clustersData.data.children, searchQuery)
        }
    };

    // Подсчитываем количество найденных файлов и кластеров
    const stats = countFilesAndClusters(filteredData.data.children, searchQuery);

    if (stats.filesCount > 0) {
        // Отображаем отфильтрованное дерево
        displayFilteredClusters(filteredData, searchQuery);

        // Показываем информацию о результатах
        searchInfo.style.display = 'block';
        searchInfo.innerHTML = `
            🔍 Найдено: <strong>${stats.filesCount}</strong> файл(ов) в <strong>${stats.clustersCount}</strong> кластере(ах)
        `;

        clearSearchBtn.style.display = 'inline-block';
        clustersLabel.textContent = `Кластеры (фильтр: "${searchQuery}"):`;
        showStatus(`Найдено ${stats.filesCount} файл(ов) в ${stats.clustersCount} кластере(ах)`, 'success');
    } else {
        // Если ничего не найдено
        clusterTree.innerHTML = `
            <div class="search-no-results" style="padding: 20px; text-align: center; color: #999;">
                Файлы, содержащие "${searchQuery}", не найдены
            </div>
        `;

        searchInfo.style.display = 'block';
        searchInfo.innerHTML = `🔍 Файлы, содержащие "${searchQuery}", не найдены`;
        searchInfo.style.background = '#fff3cd';
        searchInfo.style.color = '#856404';

        clearSearchBtn.style.display = 'inline-block';
        clustersLabel.textContent = `Кластеры (фильтр: "${searchQuery}"):`;
        showStatus(`Файл "${searchQuery}" не найден`, 'warning');
    }
}

// Рекурсивная фильтрация кластеров - оставляем только те, в которых есть искомый файл
function filterClustersWithFile(clusters, searchQuery) {
    if (!clusters || !Array.isArray(clusters)) return [];

    const filtered = [];

    clusters.forEach(cluster => {
        if (!cluster) return;

        // Проверяем, есть ли искомый файл в текущем кластере
        let hasMatchingFile = false;
        if (cluster.files && Array.isArray(cluster.files)) {
            hasMatchingFile = cluster.files.some(file => {
                const fileName = file.name || file.filename || '';
                return fileName.toLowerCase().includes(searchQuery.toLowerCase());
            });
        }

        // Рекурсивно фильтруем подкластеры
        let filteredChildren = [];
        if (cluster.children && Array.isArray(cluster.children)) {
            filteredChildren = filterClustersWithFile(cluster.children, searchQuery);
        }

        // Если в кластере есть совпадающий файл или есть подкластеры с совпадениями - добавляем его
        if (hasMatchingFile || filteredChildren.length > 0) {
            filtered.push({
                ...cluster,
                children: filteredChildren
            });
        }
    });

    return filtered;
}

// Подсчет количества найденных файлов и кластеров
function countFilesAndClusters(clusters, searchQuery) {
    let filesCount = 0;
    let clustersCount = 0;

    function count(clusters) {
        if (!clusters || !Array.isArray(clusters)) return;

        clusters.forEach(cluster => {
            if (!cluster) return;

            let hasMatchingFiles = false;

            // Подсчитываем файлы в текущем кластере
            if (cluster.files && Array.isArray(cluster.files)) {
                const matchingFiles = cluster.files.filter(file => {
                    const fileName = file.name || file.filename || '';
                    return fileName.toLowerCase().includes(searchQuery.toLowerCase());
                });

                if (matchingFiles.length > 0) {
                    filesCount += matchingFiles.length;
                    hasMatchingFiles = true;
                }
            }

            // Рекурсивно подсчитываем в подкластерах
            if (cluster.children && Array.isArray(cluster.children)) {
                count(cluster.children);
            }

            if (hasMatchingFiles) {
                clustersCount++;
            }
        });
    }

    count(clusters);
    return { filesCount, clustersCount };
}

// Отображение отфильтрованного дерева кластеров
function displayFilteredClusters(filteredData, searchQuery) {
    clusterTree.innerHTML = '';

    if (!filteredData || !filteredData.data || !filteredData.data.children || filteredData.data.children.length === 0) {
        clusterTree.innerHTML = '<div class="empty-folder">Кластеры не найдены</div>';
        return;
    }

    // Сортируем кластеры по количеству файлов (от большего к меньшему)
    const sortedClusters = [...filteredData.data.children].sort((a, b) => {
        const countA = a.fileCount || 0;
        const countB = b.fileCount || 0;
        return countB - countA;
    });

    sortedClusters.forEach((cluster, index) => {
        const clusterElement = createFilteredClusterElement(cluster, index, 0, searchQuery);
        clusterTree.appendChild(clusterElement);
    });

    // Автоматически раскрываем все кластеры
    setTimeout(() => {
        expandAll();
    }, 100);
}

// Создание элемента кластера с подсветкой найденных файлов
function createFilteredClusterElement(cluster, index, level, searchQuery) {
    if (!cluster) return document.createElement('div');

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

    // Подсчитываем только совпадающие файлы
    let matchingFilesCount = 0;
    if (cluster.files && Array.isArray(cluster.files)) {
        matchingFilesCount = cluster.files.filter(file => {
            const fileName = file.name || file.filename || '';
            return fileName.toLowerCase().includes(searchQuery.toLowerCase());
        }).length;
    }

    const clusterSize = document.createElement('span');
    clusterSize.className = 'cluster-size';
    clusterSize.style.backgroundColor = matchingFilesCount > 0 ? '#ffc107' : '#3498db';
    clusterSize.textContent = matchingFilesCount > 0 ? matchingFilesCount.toString() : (cluster.fileCount || 0).toString();

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
            displayFilteredClusterDocuments(cluster.files || [], searchQuery);
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
            const subClusterElement = createFilteredClusterElement(subCluster, subIndex, level + 1, searchQuery);
            subClustersContainer.appendChild(subClusterElement);
        });
    } else {
        expandIcon.style.visibility = 'hidden';
    }

    container.appendChild(clusterItem);
    container.appendChild(subClustersContainer);
    return container;
}

// Отображение документов кластера с подсветкой найденных файлов
function displayFilteredClusterDocuments(documents, searchQuery) {
    if (!documents || documents.length === 0) {
        filesTableBody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 30px;">Документы не найдены</td></tr>';
        return;
    }

    // Подсчитываем количество совпадающих документов
    const matchingCount = documents.filter(doc => {
        const fileName = (doc && (doc.name || doc.filename)) || '';
        return fileName.toLowerCase().includes(searchQuery.toLowerCase());
    }).length;

    // Сортируем ВСЕ документы по схожести (от большей к меньшей)
    const sortedDocuments = [...documents].sort((a, b) => {
        const simA = (a && a.similarity !== undefined) ? a.similarity : 0;
        const simB = (b && b.similarity !== undefined) ? b.similarity : 0;
        return simB - simA;
    });

    // Обновляем заголовок панели
    const panelHeader = document.querySelector('.panel_documents .panel-header');
    if (panelHeader) {
        panelHeader.innerHTML = `<span>Документы в кластере: ${sortedDocuments.length} шт. (найдено: ${matchingCount})</span>`;
    }

    filesTableBody.innerHTML = '';
    sortedDocuments.forEach((doc, index) => {
        if (!doc) return;

        const fileName = (doc && (doc.name || doc.filename)) ? (doc.name || doc.filename) : `Документ ${index + 1}`;
        const isMatching = fileName.toLowerCase().includes(searchQuery.toLowerCase());

        const row = document.createElement('tr');

        // Подсвечиваем найденные файлы желтым фоном
        if (isMatching) {
            row.style.backgroundColor = '#fff3cd';
        }

        const fileNameCell = document.createElement('td');

        // Подсвечиваем совпадающую часть в имени файла для найденных
        if (isMatching) {
            const highlightedName = highlightSearchQuery(fileName, searchQuery);
            fileNameCell.innerHTML = highlightedName;
            fileNameCell.style.fontWeight = 'bold';
        } else {
            fileNameCell.textContent = fileName;
        }
        fileNameCell.style.wordBreak = 'break-word';

        const sizeCell = document.createElement('td');
        sizeCell.textContent = (doc && doc.size) ? formatFileSize(doc.size) : 'N/A';

        const actionsCell = document.createElement('td');
        const previewBtn = document.createElement('button');
        previewBtn.className = 'btn btn-primary';
        previewBtn.textContent = 'Просмотр';
        previewBtn.addEventListener('click', () => previewDocument(doc));
        actionsCell.appendChild(previewBtn);

        row.appendChild(fileNameCell);
        row.appendChild(sizeCell);
        row.appendChild(actionsCell);
        filesTableBody.appendChild(row);
    });
}

// Функция для подсветки совпадающей части в имени файла
function highlightSearchQuery(text, query) {
    if (!query) return text;

    // Экранируем специальные символы регулярных выражений
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    return text.replace(regex, '<mark style="background-color: #ffeb3b; padding: 2px 4px; border-radius: 2px;">$1</mark>');
}

// Очистка фильтра поиска и восстановление полного дерева кластеров
function clearFileSearch() {
    const fileSearchInput = document.getElementById('fileSearch');
    const searchInfo = document.getElementById('searchInfo');
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    const clustersLabel = document.getElementById('clustersLabel');

    fileSearchInput.value = '';
    searchInfo.style.display = 'none';
    searchInfo.style.background = '#e7f3ff';
    searchInfo.style.color = '#0066cc';
    clearSearchBtn.style.display = 'none';
    clustersLabel.textContent = 'Кластеры:';

    // Восстанавливаем полное дерево кластеров
    if (clustersData) {
        displayClusters(clustersData);
        showStatus('Фильтр поиска сброшен', 'info');
    }
}

// Раскрыть все кластеры
function expandAll() {
    document.querySelectorAll('.expand-icon').forEach(icon => {
        icon.classList.add('expanded');
    });
    document.querySelectorAll('.sub-clusters').forEach(container => {
        container.classList.add('expanded');
    });
}

// Свернуть все кластеры
function collapseAll() {
    document.querySelectorAll('.expand-icon').forEach(icon => {
        icon.classList.remove('expanded');
    });
    document.querySelectorAll('.sub-clusters').forEach(container => {
        container.classList.remove('expanded');
    });
}

// Переключение компактного режима
function toggleCompactMode() {
    const clusterTree = document.getElementById('clusterTree');
    if (clusterTree) {
        clusterTree.classList.toggle('compact');
    }
}