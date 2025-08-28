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
const { promisify } = require('util');
const stream = require('stream');
const pipeline = promisify(stream.pipeline);
const { decode } = require('iconv-lite'); // Добавляем библиотеку для работы с кодировками

const app = express();
const PORT = 4000;
const SHARED_DATA_PATH = "/app/shared_data";

const EMBEDDING_SERVICE_URL = 'http://back-service:3000/api';
const NORMALIZATION_SERVICE_URL = 'http://back-service:3000/api';
const SEMANTIC_SERVICE_URL = 'http://back-service:3000/api'; 

// Middleware
app.use(cors());
app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.text({ type: 'text/plain' })); 

let jobsDB = {
  jobs: []
};

function saveJobToDB(jobData) {
  try {
    // Добавляем timestamp если его нет
    if (!jobData.created_at) {
      jobData.created_at = new Date().toISOString();
    }
    
    // Добавляем job в базу
    jobsDB.jobs.push(jobData);
    
    console.log(`Job saved to DB: ${jobData.job_id} (type: ${jobData.type})`);
    return true;
  } catch (error) {
    console.error('Error saving job to DB:', error);
    return false;
  }
}

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

app.get('/semantic/search/unstructured', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'views', 'semantic.html'))
});

app.get('/classification', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'views', 'classification.html'))
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
  // console.log(text);
  const response = await axios.post(`${EMBEDDING_SERVICE_URL}/embedding`, text, {
    headers: {
      'Content-Type': 'text/plain',
      'x-model-id': modelId
    },
  });
  return response.data.embeddings;
}

const storage = multer.diskStorage({
destination: (req, file, cb) =>{
    if (!fs.existsSync(SHARED_DATA_PATH)) {
      fs.mkdirSync(SHARED_DATA_PATH, { recursive: true });
    }
    
    // Создаем папку с UUID внутри shared_data
    const corpusId = req.corpusId || uuidv4();
    req.corpusId = corpusId; // Сохраняем ID для использования в основном обработчике
    const corpusPath = path.join(SHARED_DATA_PATH, corpusId);
    
    if (!fs.existsSync(corpusPath)) {
      fs.mkdirSync(corpusPath);
    }
    
    cb(null, corpusPath);
},
filename: (req, file, cb) =>{
    file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8')
    cb(null, file.originalname);
}
});

const upload = multer({ storage });

app.post('/api/semantic/upload', upload.array('files'), async (req, res) => {
  try {
    const modelId = req.headers['x-model-id'] || 'default-model';
    const ttlHours = req.headers['x-ttl-hours'] || 0;
    const corpusId = req.corpusId;

    // Отправляем запрос в VBD сервис
    const response = await axios.post(`${SEMANTIC_SERVICE_URL}/semantic/upload`, {}, {
      headers: {
        'x-corpus-path': `/shared_data/${corpusId}`,
        'x-model-id': modelId,
        'x-ttl-hours': ttlHours
      }
    });

    res.status(202).json({
      ...response.data,
      corpus_id: corpusId // Возвращаем ID созданной папки
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      error: 'Upload failed',
      message: error.message
    });
  }
});



// Проверка статуса задачи
app.get('/api/jobs/:jobId', async (req, res) => {
  try {
    const response = await axios.get(`${SEMANTIC_SERVICE_URL}/jobs/${req.params.jobId}`);
    // ОБНОВЛЯЕМ СТАТУС JOB В БАЗЕ ДАННЫХ    
    res.json(response.data);
  } catch (error) {
    console.error('Job status error:', error);
    res.status(500).json({
      error: 'Failed to get job status',
      message: error.message
    });
  }
});

app.get('/api/result', async (req, res) => {
  try {  
    const response = await axios.get(req.headers['x-result-url']);
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
app.post('/api/semantic/search', express.text(), async (req, res) => {
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
app.get('/api/semantic/corpora', async (req, res) => {
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

app.delete('/api/semantic/corpora/:corpusId', async (req, res) => {
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

// Получение списка моделей
app.get('/api/models', async (req, res) => {
  try {

    const models = await axios.get(`${EMBEDDING_SERVICE_URL}/models`);
    res.json(models.data);

  } catch (error) {
    handleProxyError(error, 'Models list', res);
  }
});

app.post('/api/clusterization', async (req, res) => {
  try {
    const modelId = req.headers['x-model-id'] || 'default-model';
    const ttlHours = req.headers['x-ttl-hours'] || 0;
    const corpusPath = req.headers['x-corpus-path'];

    if (!corpusPath) {
      return res.status(400).json({
        error: 'Missing required header',
        message: 'x-corpus-path header is required'
      });
    }

    const response = await axios.post(`${SEMANTIC_SERVICE_URL}/clusterization`, req.body, {
      headers: {
        'Content-Type': 'application/json',
        'x-corpus-path': corpusPath,
        'x-model-id': modelId,
        'x-ttl-hours': ttlHours
      }
    });

    const jobData = {
      job_id: response.data.job_id,
      type: 'clusterization',
      model_id: modelId,
      corpus_path: corpusPath,
      status: 'completed',
      created_at: new Date().toISOString(),
      estimated_time_min: response.data.estimated_time_min || null
    };
    
    saveJobToDB(jobData);

    res.status(202).json(response.data);


  } catch (error) {
    console.error('Clusterization error:', error);
    
    if (error.response) {
      res.status(error.response.status).json({
        error: 'Clusterization failed',
        message: error.response.data?.message || error.message
      });
    } else {
      res.status(500).json({
        error: 'Clusterization failed',
        message: error.message
      });
    }
  }
});

app.get('/api/clusterization/history', (req, res) => {
  try {
    console.log('GET /api/clusterization/history called');
    
    const { limit } = req.query;
    
    // Фильтруем только задачи кластеризации
    let clusterJobs = jobsDB.jobs.filter(job => job.type === 'clusterization');
    
    // Сортируем по дате (новые сначала)
    clusterJobs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    // Лимитируем результаты
    if (limit) {
      const limitNum = parseInt(limit);
      clusterJobs = clusterJobs.slice(0, limitNum);
    }
    
    console.log(`Returning ${clusterJobs.length} clusterization jobs`);
    res.json(clusterJobs);
    
  } catch (error) {
    console.error('Error in /api/clusterization/history:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message
    });
  }
});

app.post('/api/classification', upload.array('files'), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const modelId = req.headers['x-model-id'] || 'default-model';
    const clusteringJobId = req.headers['x-clustering-job-id'];
    const ttlHours = req.headers['x-ttl-hours'] || 0;
    const corpusPath = `/shared_data/${req.corpusId}`;

    if (!clusteringJobId) {
      return res.status(400).json({ error: 'x-clustering-job-id header is required' });
    }

    // Отправляем запрос в бэкенд разработчика
    const response = await axios.post(`${SEMANTIC_SERVICE_URL}/classification`, {}, {
      headers: {
        'x-corpus-path': corpusPath,
        'x-model-id': modelId,
        'x-clustering-job-id': clusteringJobId,
        'x-ttl-hours': ttlHours,
        'Content-Type': 'application/json'
      }
    });

    res.status(202).json(response.data);

  } catch (error) {
    console.error('Classification proxy error:', error);
    
    if (error.response?.status === 404) {
      return res.status(404).json({
        error: 'Not found',
        message: error.response.data?.message || 'Resource not found'
      });
    }
    
    res.status(500).json({
      error: 'Classification failed',
      message: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Configured services:');
  console.log(`- Embedding: ${EMBEDDING_SERVICE_URL}/embedding`);
  console.log(`- Similarity: ${EMBEDDING_SERVICE_URL}/similarity`);
  console.log(`- Normalization: ${NORMALIZATION_SERVICE_URL}/normalize`);
});