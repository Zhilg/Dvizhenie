const express = require('express');
const path = require('path');
const cors = require('cors');
const axios = require('axios');
const morgan = require('morgan');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const cosineSimilarity = require('cosine-similarity');
const fs = require('fs');
const CorpusDatabase = require('./modules/database');
const JobManager = require('./modules/jobs');
const config = require('./config');

const app = express();

// Инициализируем модули
const corpusDB = new CorpusDatabase(config.SHARED_DATA_PATH);
// JobManager теперь будет получать URL динамически
const jobManager = new JobManager(null, corpusDB, config.SHARED_DATA_PATH);

app.use(cors());
app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: config.express.jsonLimit }));
app.use(express.text({ type: 'text/plain', limit: config.express.textLimit }));

// Middleware для установки текущего бекэнда из заголовка
app.use((req, res, next) => {
  const backendHeader = req.headers['x-backend-company'];
  if (backendHeader && config.BACKENDS[backendHeader]) {
    req.currentBackend = backendHeader;
  } else {
    req.currentBackend = config.DEFAULT_BACKEND;
  }
  console.log(`[DEBUG] Backend selected: ${req.currentBackend} (from header: ${backendHeader || 'none'})`);
  next();
});

// Функция для получения URL бекэнда
const getBackendURL = (req) => {
  const backend = req.currentBackend || config.DEFAULT_BACKEND;
  const backendHeader = req.headers['x-backend-company'];
  console.log(`[DEBUG] Backend selected: ${req.currentBackend} (from header: ${backendHeader || 'none'})`);
  return config.BACKENDS[backend];
};

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

const getEmbedding = async (text, modelId, backendUrl) => {
  const response = await axios.post(`${backendUrl}/embedding`, text, {
    headers: {
      'Content-Type': 'text/plain',
      'x-model-id': modelId
    },
  });
  return response.data;
};


// Статика
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
  res.sendFile(path.join(__dirname, 'public', 'views', 'search.html'));
});

app.get('/upload', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'views', 'upload.html'));
});

app.get('/clusterization', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'views', 'clusterization.html'));
});

app.get('/semantic/search/unstructured', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'views', 'semantic.html'));
});

app.get('/classification', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'views', 'classification_select.html'));
});

app.get('/classification/cluster', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'views', 'classification.html'));
});

app.get('/classification/grnti', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'views', 'classification_grnti.html'));
});

app.get('/evaluation', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'views', 'evaluation.html'));
});

app.get('/evaluation/precision', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'views', 'evaluation_precision.html'));
});


app.get('/evaluation/recall', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'views', 'evaluation_recall.html'));
});

app.get('/fine-tuning', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'views', 'fine-tuning.html'));
});

// API 

// Обработка текста
app.post('/api/normalize', async (req, res) => {
  try {
    const backendUrl = getBackendURL(req);
    const response = await axios.post(`${backendUrl}/normalize`, req.body, {
      headers: {
        'Content-Type': 'text/plain',
        'Accept': 'text/plain'
      },
      responseType: 'text'
    });

    res
      .set('Content-Type', 'text/plain')
      .set('Language', response.headers['language'])
      .send(response.data);
  } catch (error) {
    handleProxyError(error, 'Normalization', res);
  }
});

app.post('/api/similarity', express.json(), async (req, res) => {
  try {
    const { text1, text2, modelId = config.defaults.modelId } = req.body;

    if (!text1 || !text2) {
      return res.status(400).json({ error: 'Both texts are required' });
    }

    const backendUrl = getBackendURL(req);
    const [result1, result2] = await Promise.all([
      getEmbedding(text1, modelId, backendUrl),
      getEmbedding(text2, modelId, backendUrl)
    ]);

    const cosSim = cosineSimilarity(result1.embeddings, result2.embeddings);
    const angularDist = Math.acos(Math.min(Math.max(cosSim, -1), 1));

    res.json({
      cosine_similarity: cosSim,
      angular_similarity_radians: angularDist,
      model_used: modelId,
      embeddings: [result1.embeddings, result2.embeddings],
      dimension: result1.dimension
    });

  } catch (error) {
    handleProxyError(error, 'Similarity', res);
  }
});

const getReferenceEmbedding = async (text, modelId, backendUrl) => {
  const response = await axios.post(`${backendUrl}/embedding`, text, {
    headers: {
      'Content-Type': 'text/plain',
      'x-model-id': modelId
    },
  });
  return response.data;
};

app.post('/reference/similarity', express.json(), async (req, res) => {
  try {
    const { text1, text2, modelId = config.defaults.modelId } = req.body;

    if (!text1 || !text2) {
      return res.status(400).json({ error: 'Both texts are required' });
    }

    const backendUrl = 'http://back-service-cnii:5038/api';
    const [result1, result2] = await Promise.all([
      getEmbedding(text1, modelId, backendUrl),
      getEmbedding(text2, modelId, backendUrl)
    ]);

    const cosSim = cosineSimilarity(result1.embeddings, result2.embeddings);
    const angularDist = Math.acos(Math.min(Math.max(cosSim, -1), 1));

    res.json({
      cosine_similarity: cosSim,
      angular_similarity_radians: angularDist,
    });

  } catch (error) {
    handleProxyError(error, 'Similarity', res);
  }
});


// Загрузка файлов
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(config.SHARED_DATA_PATH)) {
      fs.mkdirSync(config.SHARED_DATA_PATH, { recursive: true });
    }
    
    const corpusId = req.corpusId || uuidv4();
    req.corpusId = corpusId;
    const corpusPath = path.join(config.SHARED_DATA_PATH, corpusId);
    
    if (!fs.existsSync(corpusPath)) {
      fs.mkdirSync(corpusPath);
    }
    
    cb(null, corpusPath);
  },
  filename: (req, file, cb) => {
    file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
    cb(null, file.originalname);
  }
});

const upload = multer({ storage });
app.post('/api/semantic/upload', upload.array('files'), async (req, res) => {
  try {
    const modelId = req.headers['x-model-id'] || config.defaults.modelId;
    const ttlHours = req.headers['x-ttl-hours'] || config.defaults.ttlHours;
    const corpusId = req.corpusId;
    let corpusName = req.headers['x-corpus-name'];
    
    // Кодировка
    if (corpusName) {
      try {
        corpusName = decodeURIComponent(corpusName);
        console.log('=== DEBUG: Decoded corpus name ===');
        console.log('Original header:', req.headers['x-corpus-name']);
        console.log('Decoded corpus name:', corpusName);
        console.log('=== END DEBUG ===');
      } catch (decodeError) {
        console.log('=== DEBUG: URL decode failed, using original ===');
        console.log('Decode error:', decodeError.message);
        console.log('Using original value:', corpusName);
        console.log('=== END DEBUG ===');
      }
    }
    
    console.log('=== DEBUG: Upload Request Headers ===');
    console.log('All headers:', JSON.stringify(req.headers, null, 2));
    console.log('x-corpus-name header (original):', req.headers['x-corpus-name']);
    console.log('corpusName variable (decoded):', corpusName);
    console.log('=== END DEBUG ===');
    
    console.log(`Upload request received - Corpus name: "${corpusName}", Model: ${modelId}, Corpus ID: ${corpusId}`);

    const response = await axios.post(`${getBackendURL(req)}/semantic/upload`, {}, {
      headers: {
        'x-corpus-path': `/${corpusId}`,
        'x-model-id': modelId,
        'x-ttl-hours': ttlHours
      }
    });

    // Сохраняем информацию о задаче в JobManager
    const jobData = {
      job_id: response.data.job_id,
      type: 'upload',
      model_id: modelId,
      corpus_path: `/${corpusId}`,
      corpus_name: corpusName, 
      status: 'processing',
      created_at: new Date().toISOString(),
      estimated_time_min: response.data.estimated_time_min || null
    };
    
    console.log('=== DEBUG: Данные задачи для сохранения ===');
    console.log('Данные задачи:', JSON.stringify(jobData, null, 2));
    console.log('Имя корпуса в задаче:', jobData.corpus_name);
    console.log('=== КОНЕЦ DEBUG ===');
    
    await jobManager.addJob(jobData);

    // Сохраняем корпус в БД немедленно с правильным путем
    const corpusInfo = {
      id: corpusId, // Используем локальный ID корпуса (имя папки)
      name: corpusName,
      model: modelId,
      files: null, // Будет обновлено позже
      corpus_path: `/${corpusId}`, // Путь к папке в shared_data
      date: new Date().toISOString()
    };
    
    await corpusDB.saveCorpus(corpusInfo);

    // Запускаем опрос задачи загрузки
    jobManager.startUploadJobPolling(response.data.job_id, corpusName, modelId, corpusId);

    // Return job info for immediate response
    res.status(202).json({
      ...response.data,
      name: corpusName,
      corpus_path: `/${corpusId}`
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      error: 'Upload failed',
      message: error.message
    });
  }
});

app.post('/api/clusterization', async (req, res) => {
  try {
    const modelId = req.headers['x-model-id'] || config.defaults.modelId;
    const ttlHours = req.headers['x-ttl-hours'] || config.defaults.ttlHours;
    const corpusId = req.headers['x-corpus-id'];

    const response = await axios.post(`${getBackendURL(req)}/clusterization`, {}, {
      headers: {
        'x-corpus-path': corpusId, // для старых версий
        'x-corpus-id': corpusId, 
        'x-model-id': modelId,
        'x-ttl-hours': ttlHours
      }
    });

    const jobData = {
      job_id: response.data.job_id,
      type: 'clusterization',
      model_id: modelId,
      corpus_path: `/${corpusId}`,
      status: 'processing', 
      created_at: new Date().toISOString(),
      estimated_time_min: response.data.estimated_time_min || null
    };
    
    await jobManager.addJob(jobData);

    res.status(202).json({
      ...response.data,
      corpus_id: corpusId
    });

  } catch (error) {
    console.error('Clusterization error:', error);
    
    if (error.response?.status === 404) {
      return res.status(404).json({
        error: 'Not found',
        message: error.response.data?.message || 'Resource not found'
      });
    }
    
    res.status(500).json({
      error: 'Clusterization failed',
      message: error.message
    });
  }
});

app.get('/corpus-history', async (req, res) => {
    try {
        res.json(corpusDB.getAllCorpora());
    } catch (error) {
        console.error('Ошибка чтения истории корпусов:', error);
        res.status(500).json({ error: 'Ошибка чтения истории' });
    }
});

// Добавить корпус в историю
app.post('/corpus-history', async (req, res) => {
    try {
        const newCorpus = req.body;
        
        try {
            await corpusDB.saveCorpus(newCorpus);
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }
        res.status(200).json({ message: 'Корпус сохранен в истории' });
    } catch (error) {
        res.status(500).json({ error: 'Ошибка сохранения истории' });
    }
});

app.post('/api/classification', upload.array('files'), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const modelId = req.headers['x-model-id'] || config.defaults.modelId;
    const clusteringJobId = req.headers['x-clustering-job-id'];
    const ttlHours = req.headers['x-ttl-hours'] || config.defaults.ttlHours;
    const corpusPath = `/shared_data/${req.corpusId}`;

    if (!clusteringJobId) {
      return res.status(400).json({ error: 'x-clustering-job-id header is required' });
    }

    const response = await axios.post(`${getBackendURL(req)}/classification`, {}, {
      headers: {
        'x-corpus-path': corpusPath,
        'x-model-id': modelId,
        'x-clustering-job-id': clusteringJobId,
        'x-ttl-hours': ttlHours,
        'Content-Type': 'application/json'
      }
    });

    const jobData = {
      job_id: response.data.job_id,
      type: 'classification',
      model_id: modelId,
      corpus_path: corpusPath,
      corpus_id: req.corpusId,
      clustering_job_id: clusteringJobId,
      status: 'processing',
      created_at: new Date().toISOString(),
      estimated_time_min: response.data.estimated_time_min || null
    };
    
    await jobManager.addJob(jobData);

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

app.post('/api/classification/grnti', upload.array('files'), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const modelId = req.headers['x-model-id'] || config.defaults.modelId;
    const clusteringJobId = req.headers['x-clustering-job-id'];
    const ttlHours = req.headers['x-ttl-hours'] || config.defaults.ttlHours;
    const corpusPath = `/shared_data/${req.corpusId}`;

    if (!clusteringJobId) {
      return res.status(400).json({ error: 'x-clustering-job-id header is required' });
    }

    const response = await axios.post(`${getBackendURL(req)}/classification/grnti`, {}, {
      headers: {
        'x-corpus-path': corpusPath,
        'x-model-id': modelId,
        'x-clustering-job-id': clusteringJobId,
        'x-ttl-hours': ttlHours,
        'Content-Type': 'application/json'
      }
    });

    const jobData = {
      job_id: response.data.job_id,
      type: 'classification/grnti',
      model_id: modelId,
      corpus_path: corpusPath,
      clustering_job_id: clusteringJobId,
      status: 'processing',
      created_at: new Date().toISOString(),
      estimated_time_min: response.data.estimated_time_min || null
    };
    
    await jobManager.addJob(jobData);

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

app.post('/api/fine-tuning/start', upload.array('files'), async (req, res) => {
  try {
    const baseModelId = req.headers['x-base-model-id'];
    const newModelName = req.headers['x-new-model-name'];
    const corpusId = req.corpusId;

    const backendResponse = await fetch(`${getBackendURL(req)}/fine-tuning/start`, {
      method: 'POST',
      headers: {
        'X-Base-Model-ID': baseModelId,
        'X-New-Model-Name': newModelName,
        'x-corpus-path': corpusId
      },
    });
    
    if (!backendResponse.ok) {
      throw new Error(`Backend error: ${backendResponse.statusText}`);
    }
    
    const result = await backendResponse.json();
    res.json({
      ...result,
      corpus_id: corpusId
    });
    
  } catch (error) {
    console.error('Fine-tuning proxy error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Evaluation routes
app.post('/api/evaluation/precision', async (req, res) => {
  try {
    const { 'x-classification-job-id': jobId, 'x-evaluation-type': evalType } = req.headers;
    
    if (!jobId || !evalType) {
      return res.status(400).json({ error: 'Missing required headers' });
    }
    
    const response = await axios.post(`${getBackendURL(req)}/evaluation/precision`, {}, {
      headers: {
        'x-classification-job-id': jobId,
        'x-evaluation-type': evalType,
        'Content-Type': 'application/json'
      }
    });
    
    res.json(response.data);
    
  } catch (error) {
    console.error('Precision evaluation proxy error:', error);
    
    if (error.response?.status === 404) {
      return res.status(404).json({ error: 'Classification job not found' });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/evaluation/recall', async (req, res) => {
  try {
    const { 'x-classification-job-id': jobId, 'x-evaluation-type': evalType } = req.headers;
    
    if (!jobId || !evalType) {
      return res.status(400).json({ error: 'Missing required headers' });
    }
    
    const response = await axios.post(`${getBackendURL(req)}/evaluation/recall`, {}, {
      headers: {
        'x-classification-job-id': jobId,
        'x-evaluation-type': evalType,
        'Content-Type': 'application/json'
      }
    });
    
    res.json(response.data);
    
  } catch (error) {
    console.error('Recall evaluation proxy error:', error);
    
    if (error.response?.status === 404) {
      return res.status(404).json({ error: 'Classification job not found' });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Поиск
app.post('/api/semantic/search', express.text(), async (req, res) => {
  try {
    const response = await axios.post(`${getBackendURL(req)}/semantic/search`, req.body, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'x-corpus-id': req.headers['x-corpus-id'],
        'x-result-amount': req.headers['x-result-amount'] || config.defaults.resultAmount,
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

// Асинхрон
app.get('/api/jobs/:jobId', async (req, res) => {
  try {
    const response = await axios.get(`${getBackendURL(req)}/jobs/${req.params.jobId}`);

    const job = jobManager.getJob(req.params.jobId);
    if (job) {
      job.status = response.data.status;
      if (response.data.result_url) {
        job.result_url = response.data.result_url;
      }
      await jobManager.updateJob(job);
    }

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
        let resultUrl = req.headers['x-result-url'];
        const jobId = req.headers['x-job-id'];

        if (!resultUrl) {
            return res.status(400).json({ error: 'Missing x-result-url header' });
        }

        console.log("Processing result URL:", resultUrl);
        console.log("Job ID:", jobId);

        let response;
        
        try {
            // Первая попытка - прямой запрос
            response = await axios.get(resultUrl, { 
                timeout: config.timeouts.default,
                validateStatus: () => true
            });
            console.log("Primary request status:", response.status);
        } catch (primaryError) {
            console.log("Primary request failed with error:", primaryError.message);
            // Если это сетевая ошибка (DNS, таймаут и т.д.), пробуем фоллбэк
            if (primaryError.code === 'ENOTFOUND' || primaryError.code === 'ECONNREFUSED' || 
                primaryError.code === 'ECONNABORTED' || primaryError.code === 'ETIMEDOUT' || 
                primaryError.code === 'ERR_INVALID_URL' || primaryError.code === 'EAI_AGAIN') {
                
                console.log("Network error detected, trying fallback...");
                const fallbackUrl = await buildFallbackUrl(resultUrl, req);
                console.log("Fallback URL:", fallbackUrl);
                
                response = await axios.get(fallbackUrl, {
                    timeout: config.timeouts.default,
                    validateStatus: () => true
                });
                console.log("Fallback request status:", response.status);
            } else {
                // Если это не сетевая ошибка, пробрасываем дальше
                throw primaryError;
            }
        }

        // Если после всех попыток получили HTTP ошибку
        if (response.status >= 400) {
            return res.status(response.status).json({
                error: 'Failed to get results',
                message: response.statusText,
                details: response.data
            });
        }

        // Успешный ответ - добавляем corpus_id из информации о задании
        const resultData = response.data;

        // Если передан job_id, получаем corpus_id из базы данных
        if (jobId) {
            const jobInfo = jobManager.getJobById(jobId);
            if (jobInfo && jobInfo.corpus_id) {
                resultData.corpus_id = jobInfo.corpus_id;
                console.log("Added corpus_id to results:", jobInfo.corpus_id);
            } else {
                console.warn("Job not found or missing corpus_id for job:", jobId);
            }
        }

        res.json(resultData);

    } catch (error) {
        console.error('Results error:', error);
        
        // Если это таймаут
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            return res.status(504).json({ 
                error: 'Gateway Timeout',
                message: 'Result service unavailable'
            });
        }
        
        res.status(500).json({
            error: 'Failed to get results',
            message: error.message
        });
    }
});

// Функция для получения corpus_path из базы данных корпусов
const getCorpusPath = (corpusId) => {
  try {
    return corpusDB.getCorpusPath(corpusId);
  } catch (error) {
    console.error(`Ошибка получения corpus_path для ${corpusId}:`, error);
    return null;
  }
};

// Функция построения фоллбэк URL
async function buildFallbackUrl(originalUrl, req) {
    try {
        if (!originalUrl || typeof originalUrl !== 'string') {
            throw new Error('Invalid resultUrl provided');
        }

        console.log("Building fallback URL from:", originalUrl);

        const backendUrl = getBackendURL(req);

        // Если это HTTP ссылка, заменяем домен
        if (originalUrl.startsWith('http')) {
            try {
                const urlObj = new URL(originalUrl);
                const fallbackUrl = `${backendUrl.replace('/api', '')}${urlObj.pathname}${urlObj.search}${urlObj.hash}`;
                console.log("Built HTTP fallback URL:", fallbackUrl);
                return fallbackUrl;
            } catch (e) {
                console.error('URL parsing error:', e);
                // Если URL невалидный, считаем что это endpoint
                const fallbackUrl = `${backendUrl.replace('/api', '')}${originalUrl.startsWith('/') ? '' : '/'}${originalUrl}`;
                console.log("Built fallback from invalid URL:", fallbackUrl);
                return fallbackUrl;
            }
        }

        // Если это относительный путь
        const fallbackUrl = `${backendUrl.replace('/api', '')}${originalUrl.startsWith('/') ? '' : '/'}${originalUrl}`;
        console.log("Built relative path fallback URL:", fallbackUrl);
        return fallbackUrl;
        
    } catch (error) {
        console.error('Error in buildFallbackUrl:', error);
        throw error;
    }
}

// Test endpoint for Russian corpus names
app.post('/api/test/russian-name', (req, res) => {
  try {
    const testName = req.headers['x-test-name'];
    console.log('=== DEBUG: Test Russian name handling ===');
    console.log('Original header:', testName);
    
    let decodedName = testName;
    if (testName) {
      try {
        decodedName = decodeURIComponent(testName);
        console.log('Decoded name:', decodedName);
      } catch (e) {
        console.log('Decode failed:', e.message);
      }
    }
    
    console.log('=== END DEBUG ===');
    
    res.json({
      original: testName,
      decoded: decodedName,
      success: !!decodedName && decodedName !== 'undefined'
    });
  } catch (error) {
    console.error('Test error:', error);
    res.status(500).json({ error: 'Test failed', message: error.message });
  }
});

// Отладочный эндпоинт для проверки текущего состояния
app.get('/api/debug/state', (req, res) => {
  try {
    const debugInfo = {
      timestamp: new Date().toISOString(),
      corporaDB: {
        total_corpora: corpusDB.getAllCorpora().length,
        corpora: corpusDB.getAllCorpora().map(c => ({
          id: c.id,
          name: c.name,
          model: c.model,
          files: c.files,
          corpus_path: c.corpus_path,
          created_at: c.created_at
        }))
      },
      jobsDB: {
        total_jobs: jobManager.getAllJobs().length,
        recent_jobs: jobManager.getAllJobs().slice(-5).map(j => ({
          job_id: j.job_id,
          type: j.type,
          corpus_name: j.corpus_name,
          model_id: j.model_id,
          status: j.status,
          created_at: j.created_at
        }))
      }
    };
    
    console.log('=== DEBUG: Текущее состояние системы ===');
    console.log(JSON.stringify(debugInfo, null, 2));
    console.log('=== КОНЕЦ DEBUG ===');
    
    res.json(debugInfo);
  } catch (error) {
    console.error('Ошибка в отладочном эндпоинте:', error);
    res.status(500).json({ error: 'Ошибка отладочного эндпоинта', message: error.message });
  }
});

// History routes
app.get('/api/clusterization/history', (req, res) => {
  try {
    const { limit } = req.query;
    
    let clusterJobs = jobManager.getAllJobs().filter(job => job.type === 'clusterization');
    clusterJobs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    if (limit) {
      const limitNum = parseInt(limit);
      clusterJobs = clusterJobs.slice(0, limitNum);
    }
    
    res.json(clusterJobs);
    
  } catch (error) {
    console.error('Error in /api/clusterization/history:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message
    });
  }
});

app.get('/api/classification/history', (req, res) => {
  try {
    const { limit } = req.query;
    
    let classificationJobs = jobManager.getAllJobs().filter(job => 
      job.type === 'classification' || job.type === 'classification/grnti'
    );
    
    classificationJobs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    if (limit) {
      const limitNum = parseInt(limit);
      classificationJobs = classificationJobs.slice(0, limitNum);
    }
    
    res.json(classificationJobs);
    
  } catch (error) {
    console.error('Error in /api/classification/history:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Simple GET routes

// Backend management endpoints
app.get('/api/backends', (req, res) => {
  try {
    res.json({
      backends: Object.keys(config.BACKENDS).map(key => ({
        id: key,
        name: key.charAt(0).toUpperCase() + key.slice(1),
        url: config.BACKENDS[key]
      })),
      current: config.DEFAULT_BACKEND
    });
  } catch (error) {
    console.error('Error getting backends:', error);
    res.status(500).json({ error: 'Failed to get backends', message: error.message });
  }
});

app.get('/api/health', (req, res) => {
  const backendUrl = getBackendURL(req);
  res.json({
    status: 'OK',
    currentBackend: req.currentBackend,
    services: {
      embedding: `${backendUrl}/embedding`,
      similarity: `${backendUrl}/similarity`,
      normalization: `${backendUrl}/normalize`
    },
    timestamp: new Date().toISOString()
  });
});

app.get('/api/document', (req, res) => {
  try {
    const { corpus_id, document_id } = req.query;
    console.log('Received corpus_id:', corpus_id);
    console.log('Received document_id:', document_id);

    if (!corpus_id || !document_id) {
      return res.status(400).json({ error: 'Missing corpus_id or document_id' });
    }

    // Получаем corpus_path из базы данных корпусов
    const corpusPath = getCorpusPath(corpus_id);
    if (!corpusPath) {
      return res.status(404).json({ error: 'Corpus not found in database' });
    }

    console.log(`Using corpus_path for ${corpus_id}: ${corpusPath}`);

    // Строим полный путь: /shared_data + corpus_path + document_id
    // corpus_path интерпретируется как относительный путь от точки монтирования /shared_data
    let fullPath;
    if (corpusPath.startsWith('/')) {
      // Если corpus_path начинается с '/', убираем его для корректной конкатенации
      const relativePath = corpusPath.substring(1);
      fullPath = path.join(config.SHARED_DATA_PATH, relativePath, document_id);
    } else {
      // Если corpus_path не начинается с '/', используем как есть
      fullPath = path.join(config.SHARED_DATA_PATH, corpusPath, document_id);
    }
    
    console.log('Constructed full filePath:', fullPath);
    console.log('File exists:', fs.existsSync(fullPath));

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const content = fs.readFileSync(fullPath, 'utf8');
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send(content);
  } catch (error) {
    console.error('Error reading document:', error);
    res.status(500).json({ error: 'Failed to read document', message: error.message });
  }
});

app.get('/api/models', async (req, res) => {
  try {
    console.log(getBackendURL(req));
    const models = await axios.get(`${getBackendURL(req)}/models`);
    res.json(models.data);
  } catch (error) {
    handleProxyError(error, 'Models list', res);
  }
});

app.get('/api/grnti-codes', async (req, res) => {
  try {
    const grntiCodes = {
      "76.01.00": {
        "name": "Общие вопросы военной науки и техники",
        "description": "Общие вопросы военной науки, военной техники, военного дела"
      },
      "76.03.00": {
        "name": "Военное искусство",
        "description": "Военное искусство, стратегия, тактика, оперативное искусство"
      },
    };
    
    res.json(grntiCodes);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load GRNTI codes' });
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// Инициализация баз данных и запуск сервера
const startServer = async () => {
  try {
    // Инициализируем базы данных из файлов
    await corpusDB.initialize();
    await jobManager.initialize();

    app.listen(config.PORT, () => {
      console.log(`Сервер запущен на http://localhost:${config.PORT}`);
      console.log('Постоянное хранилище базы данных корпусов включено');
      console.log('Постоянное хранилище базы данных job\'ов включено');
    });
  } catch (error) {
    console.error('Не удалось запустить сервер:', error);
    process.exit(1);
  }
};

startServer();
