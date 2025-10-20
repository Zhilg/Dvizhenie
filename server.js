const express = require('express');
const path = require('path');
const cors = require('cors');
const axios = require('axios');
const morgan = require('morgan');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const cosineSimilarity = require('cosine-similarity');
const fs = require('fs');

const app = express();
const PORT = 4000;
const SHARED_DATA_PATH = "/app/shared_data";
const BACKEND_SERVICE_URL = 'http://back-service:3000/api';

app.use(cors());
app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: 'Infinity' }));
app.use(express.text({ type: 'text/plain', limit: 'Infinity' }));


let jobsDB = { jobs: [] };
let corporaDB = { corpora: []};

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

const saveJobToDB = (jobData) => {
  try {
    if (!jobData.created_at) {
      jobData.created_at = new Date().toISOString();
    }
    
    jobsDB.jobs.push(jobData);
    console.log(`Job saved to DB: ${jobData.job_id} (type: ${jobData.type})`);
    return true;
  } catch (error) {
    console.error('Error saving job to DB:', error);
    return false;
  }
};

const saveCorporaToDB = (corporaData) => {
  try {
    if (!corporaData.created_at) {
      corporaData.created_at = new Date().toISOString();
    }
    
    corporaDB.corpora.push(corporaData); 
    console.log(`Корпус сохранен в БД: ${corporaData.id}`);
    return true;
  } catch (error) {
    console.error('Ошибка добавления корпуса в БД:', error);
    return false;
  }
};

const getEmbedding = async (text, modelId) => {
  const response = await axios.post(`${BACKEND_SERVICE_URL}/embedding`, text, {
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
  res.sendFile(path.join(__dirname, 'public', 'views', 'classification.html'));
});

app.get('/classification/grnti', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'views', 'classification_grnti.html'));
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
    const response = await axios.post(`${BACKEND_SERVICE_URL}/normalize`, req.body, {
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
    const { text1, text2, modelId = 'default-model' } = req.body;
    
    if (!text1 || !text2) {
      return res.status(400).json({ error: 'Both texts are required' });
    }

    const [result1, result2] = await Promise.all([
      getEmbedding(text1, modelId),
      getEmbedding(text2, modelId)
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

// Загрузка файлов
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(SHARED_DATA_PATH)) {
      fs.mkdirSync(SHARED_DATA_PATH, { recursive: true });
    }
    
    const corpusId = req.corpusId || uuidv4();
    req.corpusId = corpusId;
    const corpusPath = path.join(SHARED_DATA_PATH, corpusId);
    
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
    const modelId = req.headers['x-model-id'] || 'default-model';
    const ttlHours = req.headers['x-ttl-hours'] || 0;
    const corpusId = req.corpusId;

    const response = await axios.post(`${BACKEND_SERVICE_URL}/semantic/upload`, {}, {
      headers: {
        'x-corpus-path': `/${corpusId}`,
        'x-model-id': modelId,
        'x-ttl-hours': ttlHours
      }
    });

    res.status(202).json({
      ...response.data,
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
    const modelId = req.headers['x-model-id'] || 'default-model';
    const ttlHours = req.headers['x-ttl-hours'] || 0;
    const corpusId = req.headers['x-corpus-id'];

    const response = await axios.post(`${BACKEND_SERVICE_URL}/clusterization`, {}, {
      headers: {
        'x-corpus-path': corpusId,
        'x-corpus-id': corpusId, // для старых версий
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
    
    saveJobToDB(jobData);

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
        res.json(corporaDB.corpora);
    } catch (error) {
        console.error('Error reading corpus history:', error);
        res.status(500).json({ error: 'Ошибка чтения истории' });
    }
});

// Добавить корпус в историю
app.post('/corpus-history', async (req, res) => {
    try {
        const newCorpus = req.body;
        
        try {
            saveCorporaToDB(newCorpus);
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

    const modelId = req.headers['x-model-id'] || 'default-model';
    const clusteringJobId = req.headers['x-clustering-job-id'];
    const ttlHours = req.headers['x-ttl-hours'] || 0;
    const corpusPath = `/shared_data/${req.corpusId}`;

    if (!clusteringJobId) {
      return res.status(400).json({ error: 'x-clustering-job-id header is required' });
    }

    const response = await axios.post(`${BACKEND_SERVICE_URL}/classification`, {}, {
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
      clustering_job_id: clusteringJobId,
      status: 'processing',
      created_at: new Date().toISOString(),
      estimated_time_min: response.data.estimated_time_min || null
    };
    
    saveJobToDB(jobData);

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

    const modelId = req.headers['x-model-id'] || 'default-model';
    const clusteringJobId = req.headers['x-clustering-job-id'];
    const ttlHours = req.headers['x-ttl-hours'] || 0;
    const corpusPath = `/shared_data/${req.corpusId}`;

    if (!clusteringJobId) {
      return res.status(400).json({ error: 'x-clustering-job-id header is required' });
    }

    const response = await axios.post(`${BACKEND_SERVICE_URL}/classification/grnti`, {}, {
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
    
    saveJobToDB(jobData);

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

    const backendResponse = await fetch(`${BACKEND_SERVICE_URL}/fine-tuning/start`, {
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
    
    const response = await axios.post(`${BACKEND_SERVICE_URL}/evaluation/precision`, {}, {
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
    
    const response = await axios.post(`${BACKEND_SERVICE_URL}/evaluation/recall`, {}, {
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
    const response = await axios.post(`${BACKEND_SERVICE_URL}/semantic/search`, req.body, {
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

// Асинхрон
app.get('/api/jobs/:jobId', async (req, res) => {
  try {
    const response = await axios.get(`${BACKEND_SERVICE_URL}/jobs/${req.params.jobId}`);
    
    const jobIndex = jobsDB.jobs.findIndex(job => job.job_id === req.params.jobId);
    if (jobIndex !== -1) {
      jobsDB.jobs[jobIndex].status = response.data.status;
      if (response.data.result_url) {
        jobsDB.jobs[jobIndex].result_url = response.data.result_url;
      }
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
        
        if (!resultUrl) {
            return res.status(400).json({ error: 'Missing x-result-url header' });
        }

        console.log("Processing result URL:", resultUrl);

        let response;
        
        try {
            // Первая попытка - прямой запрос
            response = await axios.get(resultUrl, { 
                timeout: 10000,
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
                const fallbackUrl = await buildFallbackUrl(resultUrl);
                console.log("Fallback URL:", fallbackUrl);
                
                response = await axios.get(fallbackUrl, {
                    timeout: 10000,
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

        // Успешный ответ
        res.json(response.data);
        
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

// Функция построения фоллбэк URL
async function buildFallbackUrl(originalUrl) {
    try {
        if (!originalUrl || typeof originalUrl !== 'string') {
            throw new Error('Invalid resultUrl provided');
        }
        
        console.log("Building fallback URL from:", originalUrl);
        
        // Если это HTTP ссылка, заменяем домен
        if (originalUrl.startsWith('http')) {
            try {
                const urlObj = new URL(originalUrl);
                const fallbackUrl = `http://back-service:3000${urlObj.pathname}${urlObj.search}${urlObj.hash}`;
                console.log("Built HTTP fallback URL:", fallbackUrl);
                return fallbackUrl;
            } catch (e) {
                console.error('URL parsing error:', e);
                // Если URL невалидный, считаем что это endpoint
                const fallbackUrl = `http://back-service:3000${originalUrl.startsWith('/') ? '' : '/'}${originalUrl}`;
                console.log("Built fallback from invalid URL:", fallbackUrl);
                return fallbackUrl;
            }
        }
        
        // Если это относительный путь
        const fallbackUrl = `http://back-service:3000${originalUrl.startsWith('/') ? '' : '/'}${originalUrl}`;
        console.log("Built relative path fallback URL:", fallbackUrl);
        return fallbackUrl;
        
    } catch (error) {
        console.error('Error in buildFallbackUrl:', error);
        throw error;
    }
}

// History routes
app.get('/api/clusterization/history', (req, res) => {
  try {
    const { limit } = req.query;
    
    let clusterJobs = jobsDB.jobs.filter(job => job.type === 'clusterization');
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
    
    let classificationJobs = jobsDB.jobs.filter(job => 
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

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    services: {
      embedding: `${BACKEND_SERVICE_URL}/embedding`,
      similarity: `${BACKEND_SERVICE_URL}/similarity`,
      normalization: `${BACKEND_SERVICE_URL}/normalize`
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

    const filePath = path.join(__dirname, 'shared_data', corpus_id, document_id);
    console.log('Constructed filePath:', filePath);
    console.log('File exists:', fs.existsSync(filePath));

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const content = fs.readFileSync(filePath, 'utf8');
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send(content);
  } catch (error) {
    console.error('Error reading document:', error);
    res.status(500).json({ error: 'Failed to read document', message: error.message });
  }
});

app.get('/api/models', async (req, res) => {
  try {
    const models = await axios.get(`${BACKEND_SERVICE_URL}/models`);
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});