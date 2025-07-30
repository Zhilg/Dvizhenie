document.addEventListener('DOMContentLoaded', () => {
    const DOCKER_SERVICE_URL = 'http://localhost:3000/api/normalize';
    const fileInput = document.getElementById('fileInput');
    const fileLabel = document.getElementById('fileLabel');
    const sourceText = document.getElementById('sourceText');
    const processBtn = document.getElementById('processBtn');
    const resultDiv = document.getElementById('result');
    const errorDiv = document.getElementById('error');
    const comparisonDiv = document.getElementById('comparison');
    
    // Обработка выбора файла
    fileInput.addEventListener('change', handleFileSelect);
    
    // Обработка перетаскивания файла
    document.addEventListener('dragover', (e) => {
        e.preventDefault();
        fileLabel.style.background = '#e9e9e9';
    });
    
    document.addEventListener('dragleave', () => {
        fileLabel.style.background = '#eee';
    });
    
    document.addEventListener('drop', (e) => {
        e.preventDefault();
        fileLabel.style.background = '#eee';
        if (e.dataTransfer.files.length) {
            fileInput.files = e.dataTransfer.files;
            handleFileSelect();
        }
    });
    
    // Обработка клика на кнопку
    processBtn.addEventListener('click', processText);
    
    function handleFileSelect() {
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            fileLabel.innerHTML = `Выбран файл: <strong>${file.name}</strong> <small class="text-muted">(${(file.size/1024).toFixed(2)} KB)</small>`;
            
            // Чтение содержимого файла
            const reader = new FileReader();
            reader.onload = (e) => {
                sourceText.value = e.target.result;
            };
            reader.onerror = (e) => {
                showError('Ошибка чтения файла');
            };
            
            if (file.type.includes('text') || file.name.endsWith('.txt')) {
                reader.readAsText(file);
            } else {
                showError('Можно загружать только текстовые файлы (.txt)');
                fileInput.value = '';
                fileLabel.innerHTML = 'Выберите файл или перетащите сюда<br><small class="text-muted">Поддерживаются .txt</small>';
            }
        }
    }
    
    async function processText() {
        const text = sourceText.value.trim();
        
        if (!text) {
            showError('Пожалуйста, введите текст или загрузите файл');
            return;
        }
        
        try {
            processBtn.disabled = true;
            processBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Обработка...';
            
            console.log('Отправляемый текст:', text.substring(0, 100) + '...');
            
            const response = await fetch('/api/normalize', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'text/plain',
                    'Accept': 'text/plain'
                },
                body: text
            });
            
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            const language = response.headers.get('language');
            const normalizedText = await response.text();
            console.log('Полученные данные:', {
                language,
                normalized: normalizedText.substring(0, 100) + '...'
            });
            
            resultDiv.innerHTML = normalizedText.replace(/\n/g, '<br>');
            
            const dmp = new diff_match_patch();
            const diffs = dmp.diff_main(text, normalizedText);
            dmp.diff_cleanupSemantic(diffs);

            let htmlOutput = '';
            for (let i = 0; i < diffs.length; i++) {
                const op = diffs[i][0];
                let text = diffs[i][1]
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;');

                if (op === -1) {
                    text = text
                        .replace(/ /g, '<span class="deleted-space">__</span>')
                        .replace(/\n/g, '<span class="deleted-newline">¶</span>');
                    htmlOutput += `<span class="deletion">${text}</span>`;
                } else if (op === 1) {
                    text = text
                        .replace(/ /g, '<span class="inserted-space">__</span>')
                        .replace(/\n/g, '<span class="inserted-newline">¶</span>');
                    htmlOutput += `<span class="insertion">${text}</span>`;
                } else {
                    text = text.replace(/\n/g, '<br>');
                    htmlOutput += text;
                }
            }

            comparisonDiv.innerHTML = htmlOutput;
            errorDiv.classList.add('d-none');
        } catch (error) {
            console.error('Ошибка:', error);
            showError(`Ошибка: ${error.message}`);
        } finally {
            processBtn.disabled = false;
            processBtn.textContent = 'Нормализовать';
        }
    }

});
