class TextCleaner {
    constructor() {
        this.state = {
            originalText: '',
            filename: ''
        };
        
        this.initEvents();
    }
    
    initEvents() {
        document.getElementById('analyzeBtn').addEventListener('click', () => this.analyze());
        document.getElementById('fileInput').addEventListener('change', (e) => this.handleFile(e));
    }
    
    async analyze() {
        const formData = new FormData();
        formData.append('original_text', this.state.originalText);
        
        if (this.state.file) {
            formData.append('file', this.state.file);
        }
        
        try {
            const response = await fetch('/api/clean_text.php', {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.renderResults(data.data);
            } else {
                this.showError(data.error);
            }
        } catch (error) {
            this.showError(error.message);
        }
    }
    
    renderResults(data) {
        document.getElementById('cleanedText').textContent = data.cleaned_text;
        document.getElementById('diffContainer').innerHTML = data.html;
        document.getElementById('stats').innerHTML = `
            Добавлений: ${data.stats.additions}<br>
            Удалений: ${data.stats.deletions}
        `;
    }
    
    // ... остальные методы
}

new TextCleaner();