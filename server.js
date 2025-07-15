const express = require('express');
const path = require('path');
const cors = require('cors');
const axios = require('axios');
const morgan = require('morgan');
const multer = require('multer');
const FormData = require('form-data');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Configuration
const EMBEDDING_SERVICE_URL = 'http://embedding-service:8000';
const NORMALIZATION_SERVICE_URL = 'http://normalize-service:5001';
const SEMANTIC_SERVICE_URL = 'http://vbd-service:8080'; 

// Middleware
app.use(cors());
app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
const upload = multer({ dest: '/app/shared_data' });

// Request validation middleware
const validateEmbeddingRequest = (req, res, next) => {
  if (!req.body.text1 || !req.body.text2) {
    return res.status(400).json({
      error: 'Validation failed',
      message: 'Both text1 and text2 are required'
    });
  }
  next();
};

// Proxy error handler
const handleProxyError = (error, serviceName, res) => {
  console.error(`Proxy error for ${serviceName}:`, error);
  
  if (error.response) {
    return res.status(error.response.status).json({
      error: `${serviceName} service error`,
      status: error.response.status,
      message: error.response.data.message || error.response.statusText
    });
  } else if (error.request) {
    return res.status(503).json({
      error: 'Service unavailable',
      message: `${serviceName} service did not respond`
    });
  } else {
    return res.status(500).json({
      error: 'Proxy configuration error',
      message: error.message
    });
  }
};

// Static routes (без изменений)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/normalize', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'views', 'normalise.html'));
});

app.get('/embedding', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'views', 'embedding.html'));
});

app.get('/semantic', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'views', 'semantic.html'));
});


// API Proxy Routes

// 1. Нормализация (оставляем без изменений)
app.post('/api/normalize', async (req, res) => {
  try {
    console.log('Normalization request:', { text: req.body.text });
    
    const response = await axios.post(`${NORMALIZATION_SERVICE_URL}/normalize`, {
      text: req.body.text
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      timeout: 5000
    });
    
    console.log('Normalization successful:', { normalized: response.data.normalized });
    res.json(response.data);
  } catch (error) {
    handleProxyError(error, 'Normalization', res);
  }
});

// 2. Векторизация (аналогично normalize)
app.post('/api/embedding', validateEmbeddingRequest, async (req, res) => {
  try {
    console.log('Embedding request:', { 
      text1: req.body.text1.substring(0, 50) + '...',
      text2: req.body.text2.substring(0, 50) + '...'
    });
    
    const response = await axios.post(`${EMBEDDING_SERVICE_URL}/similarity`, {
      text1: req.body.text1,
      text2: req.body.text2
    }, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 10000
    });
    
    console.log('Embedding successful:', { 
      similarity: response.data.similarity 
    });
    res.json(response.data);
  } catch (error) {
    handleProxyError(error, 'Embedding', res);
  }
});

app.post('/api/semantic/semantic_search', async (req, res) => {
    try {
        const response = await axios.post(`${SEMANTIC_SERVICE_URL}/semantic_search`, {
            querry: req.body.querry,
            collection_name: req.body.collection_name,
            top_k: req.body.top_k || 5
        });
        
        res.json(response.data);
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({
            error: 'Search failed',
            message: error.message
        });
    }
});

app.post('/api/semantic/collections', async (req, res) => {
    try {
        const response = await axios.post(`${SEMANTIC_SERVICE_URL}/list_collections_names`);
        res.json(response.data);
    } catch (error) {
        console.error('Collections list error:', error);
        res.status(500).json({
            error: 'Failed to get collections',
            message: error.message
        });
    }
});

app.post('/api/semantic/delete_collection', async (req, res) => {
    try {
        const response = await axios.post(`${SEMANTIC_SERVICE_URL}/delete_collection`, {
            name: req.body.name
        });
        
        res.json(response.data);
    } catch (error) {
        console.error('Delete collection error:', error);
        res.status(500).json({
            error: 'Failed to delete collection',
            message: error.message
        });
    }
});

app.post('/api/semantic/delete_all_collections', async (req, res) => {
    try {
        const response = await axios.post(`${SEMANTIC_SERVICE_URL}/delete_all_collections`);
        res.json(response.data);
    } catch (error) {
        console.error('Delete all collections error:', error);
        res.status(500).json({
            error: 'Failed to delete all collections',
            message: error.message
        });
    }
});
// Middleware для обработки multipart/form-data
app.post('/api/process-folder', upload.array('files'), async (req, res) => {
    const PROCESSING_DIR = '/app/shared_data'; // путь в dvizhenie
    
    try {
        // 1. Создаем уникальную папку для обработки
        const timeStamp =  Date.now().toString();
        const processingPath = path.join(PROCESSING_DIR, timeStamp);
        const sendPath = "/vbd/shared_data/"+timeStamp // путь в vbd
        fs.mkdirSync(processingPath, { recursive: true });

        // 2. Переносим все файлы в папку обработки
        req.files.forEach(file => {
            const targetPath = path.join(processingPath, file.originalname);
            fs.renameSync(file.path, targetPath);
        });


        console.log(sendPath);
        const apiResponse = await axios.post('http://vbd-service:8080/sematic_upload', {
            folder_path: sendPath, 
            collection_name: req.body.collection_name,
            processes: 2
        }, {
            headers: { 'Content-Type': 'application/json' }
        });

        // 4. Запланировать очистку через 1 минуту
        // setTimeout(() => {
        //     fs.rmSync(processingPath, { recursive: true, force: true });
        // }, 60000);

        res.json({
            status: 'success',
            processed_files: req.files.length,
            collection: req.body.collection_name,
            processing_path: processingPath
        });

    } catch (error) {
        console.error('FINAL ERROR:', {
            message: error.message,
            response: error.response?.data,
            stack: error.stack
        });
        
        res.status(500).json({
            status: 'error',
            error: 'PROCESSING_FAILED',
            details: error.response?.data || error.message
        });
    }
});
// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    services: {
      embedding: `${EMBEDDING_SERVICE_URL}/embedding`,
      similarity: `${EMBEDDING_SERVICE_URL}/similarity`,
      normalization: `${NORMALIZATION_SERVICE_URL}/normalize`
    },
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Configured services:');
  console.log(`- Embedding: ${EMBEDDING_SERVICE_URL}/embedding`);
  console.log(`- Similarity: ${EMBEDDING_SERVICE_URL}/similarity`);
  console.log(`- Normalization: ${NORMALIZATION_SERVICE_URL}/normalize`);
});