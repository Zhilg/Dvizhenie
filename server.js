const express = require('express');
const path = require('path');
const cors = require('cors');
const axios = require('axios');
const morgan = require('morgan');
const multer = require('multer');
const FormData = require('form-data');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const cosineSimilarity = require('cosine-similarity');
const router = express.Router();

const app = express();
const PORT = 4000;

// Configuration
// const EMBEDDING_SERVICE_URL = 'http://embedding-service:8000';
// const NORMALIZATION_SERVICE_URL = 'http://normalize-service:5001';
// const SEMANTIC_SERVICE_URL = 'http://vbd-service:8080'; 
const EMBEDDING_SERVICE_URL = 'http://dvizhenie-task_1-3-1:3000/api';
const NORMALIZATION_SERVICE_URL = 'http://dvizhenie-task_1-3-1:3000/api';
const SEMANTIC_SERVICE_URL = 'http://dvizhenie-task_1-3-1:3000/api'; 


// Middleware
app.use(cors());
app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.text({ type: 'text/plain' })); 
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

app.get('/clusterization', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'views', 'clusterization.html'))
});

// API Proxy Routes

// 1. Нормализация, подогнанная под новое апи
app.post('/api/normalize', async (req, res) => {
  try {
    console.log('Получен запрос на /api/normalize');  // <-- Добавьте это
    console.log('Headers:', req.headers);              // <-- И это
    console.log('Body:', req.body);                   // <-- И это
    
    const response = await axios.post(NORMALIZATION_SERVICE_URL+"/normalize", req.body, {
      headers: {
        'Content-Type': 'text/plain',
        'Accept': 'text/plain'
      },
      timeout: 5000,
      responseType: 'text'
    });
    
    console.log('Normalization successful:', { 
      language: response.headers['language'],
      normalized: response.data.substring(0, 100) + '...' 
    });
    
    res
      .set('Content-Type', 'text/plain')
      .set('Language', response.headers['language'])
      .send(response.data);
  } catch (error) {
    handleProxyError(error, 'Normalization', res);
  }
});

// Здесь отправляются 2 текста на векторизацию и считается их близость
app.post('/api/similarity', express.json(), async (req, res) => {
  try {
    const { text1, text2, modelId = 'default-model' } = req.body;
    
    if (!text1 || !text2) {
      return res.status(400).json({ error: 'Both texts are required' });
    }

    console.log('Similarity request:', { 
      modelId,
      length1: text1.length,
      length2: text2.length
    });

    // Параллельно получаем эмбеддинги
    const [embedding1, embedding2] = await Promise.all([
      getEmbedding(text1, modelId),
      getEmbedding(text2, modelId)
    ]);

    // Рассчитываем метрики
    const cosSim = cosineSimilarity(embedding1, embedding2);
    const angularDist = Math.acos(Math.min(Math.max(cosSim, -1), 1));

    res.json({
      cosine_similarity: cosSim,
      angular_similarity_radians: angularDist,
      model_used: modelId,
      embeddings: [embedding1, embedding2] // Опционально, если нужны клиенту
    });

  } catch (error) {
    handleProxyError(error, 'Similarity', res);
  }
});

// Отправка текста на эмбеддинг
async function getEmbedding(text, modelId) {
  const response = await axios.post(`${EMBEDDING_SERVICE_URL}/embedding`, text, {
    headers: {
      'Content-Type': 'text/plain',
      'x-model-id': modelId
    },
    timeout: 10000
  });
  return response.data.embedding;
}
// Загрузка документов
router.post('/api/semantic/upload', upload.array('files'), async (req, res) => {
  try {
    const modelId = req.headers['x-model-id'] || 'default-model';
    const ttlHours = req.headers['x-ttl-hours'] || 0;
    
    // Создаем уникальную папку для обработки
    const processingId = uuidv4();
    const processingPath = path.join(SHARED_DATA_PATH, processingId);
    fs.mkdirSync(processingPath, { recursive: true });

    // Переносим файлы
    req.files.forEach(file => {
      const targetPath = path.join(processingPath, file.originalname);
      fs.renameSync(file.path, targetPath);
    });

    // Отправляем запрос в сервис семантики
    const response = await axios.post(`${SEMANTIC_SERVICE_URL}/semantic/upload`, {}, {
      headers: {
        'x-corpus-path': processingId,
        'x-model-id': modelId,
        'x-ttl-hours': ttlHours
      }
    });

    res.status(202).json(response.data);

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      error: 'Upload failed',
      message: error.message
    });
  }
});

// Проверка статуса задачи
router.get('/api/jobs/:jobId', async (req, res) => {
  try {
    const response = await axios.get(`${SEMANTIC_SERVICE_URL}/api/jobs/${req.params.jobId}`);
    res.json(response.data);
  } catch (error) {
    console.error('Job status error:', error);
    res.status(500).json({
      error: 'Failed to get job status',
      message: error.message
    });
  }
});

// Получение результатов
router.get('/api/results/:resultUrl', async (req, res) => {
  try {
    const response = await axios.get(`${SEMANTIC_SERVICE_URL}${req.params.resultUrl}`);
    res.json(response.data);
  } catch (error) {
    console.error('Results error:', error);
    res.status(500).json({
      error: 'Failed to get results',
      message: error.message
    });
  }
});

// Поиск по корпусу
router.post('/api/semantic/search', express.text(), async (req, res) => {
  try {
    const response = await axios.post(`${SEMANTIC_SERVICE_URL}/semantic/search`, req.body, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'x-corpus-id': req.headers['x-corpus-id'],
        'x-result-amount': req.headers['x-result-amount'] || 5,
        'x-model-id': req.headers['x-model-id']
      }
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

// Управление корпусами
router.get('/api/semantic/corpora', async (req, res) => {
  try {
    const response = await axios.get(`${SEMANTIC_SERVICE_URL}/semantic/corpora`);
    res.json(response.data);
  } catch (error) {
    console.error('Corpora list error:', error);
    res.status(500).json({
      error: 'Failed to get corpora list',
      message: error.message
    });
  }
});

router.delete('/api/semantic/corpora/:corpusId', async (req, res) => {
  try {
    const response = await axios.delete(`${SEMANTIC_SERVICE_URL}/semantic/corpora/${req.params.corpusId}`);
    res.json(response.data);
  } catch (error) {
    console.error('Delete corpus error:', error);
    res.status(500).json({
      error: 'Failed to delete corpus',
      message: error.message
    });
  }
});

module.exports = router;
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

// const AVAILABLE_MODELS = [
//   {
//     model_id: '8a7d3f02-3a7c-4b5d-b8e9-0c1f2a6d4e8f',
//     model_name: 'bert-multilingual',
//     dimension: 768
//   },
//   {
//     model_id: '5b2c1e8d-9f3a-4c7d-b6e1-0f8a3d2e5c7b',
//     model_name: 'rubert-tiny',
//     dimension: 312
//   }
// ];

// Получение списка моделей
app.get('/api/models', async (req, res) => {
  try {
    // В реальном приложении:
    const models = await axios.get(`${EMBEDDING_SERVICE_URL}/models`);
    res.json(models.data);
    
    // res.json(AVAILABLE_MODELS);
  } catch (error) {
    handleProxyError(error, 'Models list', res);
  }
});
// До всех роутов!
// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Configured services:');
  console.log(`- Embedding: ${EMBEDDING_SERVICE_URL}/embedding`);
  console.log(`- Similarity: ${EMBEDDING_SERVICE_URL}/similarity`);
  console.log(`- Normalization: ${NORMALIZATION_SERVICE_URL}/normalize`);
});