from flask import Flask, request, jsonify, send_file
from mock_data import *
import uuid
import time
import os
import datetime

app = Flask(__name__)

# База данных для хранения заданий
jobs_db = {}
# Время создания заданий
job_creation_time = {}

# Фиксированные mock-данные

# Статические эндпоинты для визуализации
@app.route('/api/visualization/graphic', methods=['GET'])
def graphic_visualization():
    return VISUALIZATION_HTML["graphic"], 200, {'Content-Type': 'text/html'}

@app.route('/api/visualization/planetar', methods=['GET'])
def planetar_visualization():
    return VISUALIZATION_HTML["planetar"], 200, {'Content-Type': 'text/html'}

@app.route('/api/visualization/drilldown', methods=['GET'])
def drilldown_visualization():
    return VISUALIZATION_HTML["drilldown"], 200, {'Content-Type': 'text/html'}

# Основные API эндпоинты
@app.route('/api/normalize', methods=['POST'])
def normalize_text():
    if not request.content_type or 'text/plain' not in request.content_type:
        return jsonify(error="INVALID_ENCODING"), 400
    
    if request.content_length and request.content_length > 10 * 1024 * 1024:
        return jsonify(error="PAYLOAD_TOO_LARGE"), 413
    
    response_text = "Нормализованный текст пример"
    response = app.response_class(
        response=response_text,
        status=200,
        mimetype='text/plain'
    )
    response.headers['language'] = 'ru'
    return response

@app.route('/api/embedding', methods=['POST'])
def get_embedding():
    if not request.content_type or 'text/plain' not in request.content_type:
        return jsonify(error="INVALID_ENCODING"), 400
    
    if request.content_length and request.content_length > 10 * 1024 * 1024:
        return jsonify(error="PAYLOAD_TOO_LARGE"), 413
    
    model_id = request.headers.get('x-model-id')
    if not model_id:
        return jsonify(error="Model ID required"), 400
    
    model_exists = any(m['model_id'] == model_id for m in MOCK_MODELS)
    if not model_exists:
        return jsonify(error="Model not found"), 404
    
    dimension = next((m['dimension'] for m in MOCK_MODELS if m['model_id'] == model_id), 512)
    embeddings = MOCK_EMBEDDINGS[:dimension] if dimension <= len(MOCK_EMBEDDINGS) else MOCK_EMBEDDINGS * (dimension // len(MOCK_EMBEDDINGS) + 1)
    embeddings = embeddings[:dimension]
    
    return jsonify({
        "embeddings": embeddings,
        "dimension": dimension
    })

@app.route('/api/models', methods=['GET'])
def get_models():
    return jsonify(MOCK_MODELS)

@app.route('/api/semantic/upload', methods=['POST'])
def upload_corpus():
    if not request.content_type or 'application/json' not in request.content_type:
        return jsonify(error="Invalid content type"), 400
    
    corpus_path = request.headers.get('x-corpus-path')
    model_id = request.headers.get('x-model-id')
    
    if not corpus_path or not model_id:
        return jsonify(error="Missing required headers"), 400
    
    model_exists = any(m['model_id'] == model_id for m in MOCK_MODELS)
    if not model_exists:
        return jsonify(error="Model not found"), 404
    
    job_id = str(uuid.uuid4())
    jobs_db[job_id] = {
        'status': 'processing',
        'type': 'upload',
        'progress': 0,
        'corpus_path': corpus_path,
        'model_id': model_id,
        'result': MOCK_UPLOAD_RESULT
    }
    job_creation_time[job_id] = time.time()
    
    return jsonify({
        "job_id": job_id,
        "estimated_time_min": 120
    }), 202

@app.route('/api/jobs/<job_id>', methods=['GET'])
def get_job_status(job_id):
    job = jobs_db.get(job_id)
    if not job:
        return jsonify(error="Job not found"), 404
    
    current_time = time.time()
    job_start_time = job_creation_time.get(job_id, current_time)
    elapsed_time = current_time - job_start_time
    
    if elapsed_time < 3:
        progress = min(int((elapsed_time / 3) * 100), 100)
        return jsonify({
            "status": "processing",
            "progress": progress,
            "details": {
                "bytes_processed": progress * 1000000,
                "files_processed": progress * 50
            }
        })
    else:
        jobs_db[job_id]['status'] = 'completed'
        

        return jsonify({
            "status": "completed",
            "result_url": f"/api/jobs/{job_id}/result"
        })


@app.route('/api/jobs/<job_id>/result', methods=['GET'])
def get_job_result(job_id):
    job = jobs_db.get(job_id)
    if not job or job['status'] != 'completed':
        return jsonify(error="Result not ready"), 404
    
    # Возвращаем результат в зависимости от типа задачи

    return jsonify(job['result'])



@app.route('/api/semantic/search', methods=['POST'])
def semantic_search():
    return perform_search()

@app.route('/api/semantic/search/unstructured', methods=['POST'])
def semantic_search_unstructured():
    return perform_search()

def perform_search():
    if not request.content_type or 'text/plain' not in request.content_type:
        return jsonify(error="Invalid content type"), 400
    
    corpus_id = request.headers.get('x-corpus-id')
    model_id = request.headers.get('x-model-id')
    
    if not corpus_id or not model_id:
        return jsonify(error="Missing required headers"), 400
    
    model_exists = any(m['model_id'] == model_id for m in MOCK_MODELS)
    if not model_exists:
        return jsonify(error="Model not found"), 404
    
    return jsonify({"results": MOCK_SEARCH_RESULTS})

@app.route('/api/clusterization', methods=['POST'])
def clusterisation():
    if not request.content_type or 'application/json' not in request.content_type:
        return jsonify(error="Invalid content type"), 400
    
    corpus_path = request.headers.get('x-corpus-path')
    model_id = request.headers.get('x-model-id')
    
    if not corpus_path or not model_id:
        return jsonify(error="Missing required headers"), 400
    
    model_exists = any(m['model_id'] == model_id for m in MOCK_MODELS)
    if not model_exists:
        return jsonify(error="Model not found"), 404
    
    job_id = str(uuid.uuid4())
    jobs_db[job_id] = {
        'status': 'processing',
        'type': 'clusterisation',
        'progress': 0,
        'corpus_path': corpus_path,
        'model_id': model_id,
        'result': MOCK_CLUSTER_RESULT
    }
    job_creation_time[job_id] = time.time()
    
    return jsonify({
        "job_id": job_id,
        "estimated_time_min": 120
    }), 202

@app.route('/api/classification', methods=['POST'])
def classification():
    """Эндпоинт для классификации документов по существующим кластерам"""
    if not request.content_type or 'application/json' not in request.content_type:
        return jsonify(error="Invalid content type"), 400
    
    # Получаем параметры из запроса
    corpus_path = request.headers.get('x-corpus-path')
    model_id = request.headers.get('x-model-id')
    
    if not corpus_path or not model_id:
        return jsonify(error="Missing required headers"), 400
    
    # Проверяем существование модели
    model_exists = any(m['model_id'] == model_id for m in MOCK_MODELS)
    if not model_exists:
        return jsonify(error="Model not found"), 404
    
    # Создаем задание на классификацию
    job_id = str(uuid.uuid4())
    jobs_db[job_id] = {
        'status': 'processing',
        'type': 'classification',
        'progress': 0,
        'corpus_path': corpus_path,
        'model_id': model_id,
        'result': {
            "folder": "C:/documents/new_documents",
            "data": {
                "id": "root",
                "name": "Все кластеры",
                "fileCount": 150,
                "avgSimilarity": 0.78,
                "children": [
                    {
                        "id": "cluster1",
                        "name": "Технологии",
                        "fileCount": 65,
                        "avgSimilarity": 0.85,
                        "similarityDistribution": [0.1, 0.15, 0.25, 0.3, 0.2],
                        "files": [
                            {"name": "new_ai_research.txt"},
                            {"name": "tech_report.pdf"}
                        ],
                        "children": []
                    },
                    {
                        "id": "cluster2", 
                        "name": "Наука",
                        "fileCount": 45,
                        "avgSimilarity": 0.72,
                        "similarityDistribution": [0.2, 0.25, 0.3, 0.15, 0.1],
                        "files": [
                            {"name": "physics_paper.txt"},
                            {"name": "biology_study.pdf"}
                        ],
                        "children": []
                    },
                    {
                        "id": "cluster3",
                        "name": "Бизнес",
                        "fileCount": 40,
                        "avgSimilarity": 0.81,
                        "similarityDistribution": [0.05, 0.1, 0.2, 0.3, 0.35],
                        "files": [
                            {"name": "market_analysis.docx"},
                            {"name": "financial_report.pdf"}
                        ],
                        "children": []
                    }
                ]
            },
            "correspondence_table": {
                "files": [
                    {
                        "f": "new_ai_research.txt",
                        "d": [
                            ["cluster1", 0.92],
                            ["cluster2", 0.68],
                            ["cluster3", 0.45],
                            ["cluster4", 0.32],
                            ["cluster5", 0.21]
                        ]
                    },
                    {
                        "f": "tech_report.pdf", 
                        "d": [
                            ["cluster1", 0.88],
                            ["cluster3", 0.72],
                            ["cluster2", 0.61],
                            ["cluster6", 0.38],
                            ["cluster7", 0.29]
                        ]
                    },
                    {
                        "f": "physics_paper.txt",
                        "d": [
                            ["cluster2", 0.95],
                            ["cluster1", 0.63],
                            ["cluster8", 0.42],
                            ["cluster9", 0.31],
                            ["cluster10", 0.24]
                        ]
                    }
                ],
                "cluster_names": {
                    "cluster1": "Технологии",
                    "cluster2": "Наука", 
                    "cluster3": "Бизнес",
                    "cluster4": "Искусство",
                    "cluster5": "Спорт",
                    "cluster6": "Медицина",
                    "cluster7": "Образование",
                    "cluster8": "Политика",
                    "cluster9": "Экономика",
                    "cluster10": "Путешествия"
                }
            },
            "graphic_representation": "http://localhost:3000/api/visualization/graphic"
        }
    }
    job_creation_time[job_id] = time.time()
    
    return jsonify({
        "job_id": job_id,
        "estimated_time_min": 45
    }), 202

@app.route('/api/classification/grnti', methods=['POST'])
def start_grnti_classification():
    # Проверяем обязательные заголовки
    corpus_path = request.headers.get('x-corpus-path')
    model_id = request.headers.get('x-model-id')
    clustering_job_id = request.headers.get('x-clustering-job-id')
    
    if not all([corpus_path, model_id, clustering_job_id]):
        return jsonify(error="Missing required headers: x-corpus-path, x-model-id, x-clustering-job-id"), 400
    
    # Проверяем существование предыдущего задания кластеризации
    if clustering_job_id not in jobs_db:
        return jsonify(error="Clustering job not found"), 404
    
    # Проверяем существование модели
    model_exists = any(m['model_id'] == model_id for m in MOCK_MODELS)
    if not model_exists:
        return jsonify(error="Model not found"), 404
    
    # Создаем задание на классификацию по ГРНТИ с готовым результатом
    job_id = str(uuid.uuid4())
    jobs_db[job_id] = {
        'status': 'processing',
        'type': 'grnti_classification',
        'progress': 0,
        'corpus_path': corpus_path,
        'model_id': model_id,
        'clustering_job_id': clustering_job_id,
        'result': generate_grnti_mock_result({
            'corpus_path': corpus_path,
            'model_id': model_id,
            'clustering_job_id': clustering_job_id,
            'ttl_hours': request.headers.get('x-ttl-hours', 0)
        })
    }
    job_creation_time[job_id] = time.time()
    
    return jsonify({
        "job_id": job_id,
        "estimated_time_min": 2  # Короткое время для демонстрации
    }), 202

def generate_grnti_mock_result(params):
    """Генерация мок-результата классификации по ГРНТИ"""
    return {
        "folder": params['corpus_path'],
        "model_id": params['model_id'],
        "grnti_branch": "военное дело",
        "classification_results": {
            "summary": {
                "total_files": 1000,
                "files_classified": 1000,
                "agreement_with_expert": 0.87,
                "accuracy_top_3": 0.95
            },
            "detailed_stats": {
                "76.01.00": {
                    "code": "76.01.00",
                    "name": "Общие вопросы военной науки и техники",
                    "expert_count": 150,
                    "system_count": 145,
                    "true_positive": 142,
                    "false_positive": 3,
                    "false_negative": 8,
                    "precision": 0.979,
                    "recall": 0.947
                },
                "76.03.00": {
                    "code": "76.03.00",
                    "name": "Военное искусство",
                    "expert_count": 220,
                    "system_count": 215,
                    "true_positive": 210,
                    "false_positive": 5,
                    "false_negative": 10,
                    "precision": 0.977,
                    "recall": 0.955
                },
                "76.29.05": {
                    "code": "76.29.05",
                    "name": "Авиационное вооружение",
                    "expert_count": 80,
                    "system_count": 85,
                    "true_positive": 78,
                    "false_positive": 7,
                    "false_negative": 2,
                    "precision": 0.918,
                    "recall": 0.975
                }
            }
        },
        "files": [
            {
                "file": "document_0012.txt",
                "expert_grnti_code": "76.03.01",
                "expert_grnti_name": "Стратегия и оперативное искусство",
                "predicted_grnti_code": "76.03.01",
                "predicted_grnti_name": "Стратегия и оперативное искусство",
                "similarity": 0.94,
                "top_5_predictions": [
                    ["76.03.01", 0.94],
                    ["76.03.03", 0.12],
                    ["76.01.07", 0.08],
                    ["76.05.01", 0.05],
                    ["76.29.05", 0.02]
                ]
            },
            {
                "file": "document_0457.txt",
                "expert_grnti_code": "76.01.07",
                "expert_grnti_name": "Системный анализ, управление и обработка информации в военном деле",
                "predicted_grnti_code": "76.29.05",
                "predicted_grnti_name": "Авиационное вооружение",
                "similarity": 0.89,
                "top_5_predictions": [
                    ["76.29.05", 0.89],
                    ["76.01.07", 0.85],
                    ["76.03.03", 0.07],
                    ["76.15.11", 0.04],
                    ["76.17.01", 0.03]
                ]
            },
            {
                "file": "document_0789.txt",
                "expert_grnti_code": "76.01.00",
                "expert_grnti_name": "Общие вопросы военной науки и техники",
                "predicted_grnti_code": "76.01.00",
                "predicted_grnti_name": "Общие вопросы военной науки и техники",
                "similarity": 0.96,
                "top_5_predictions": [
                    ["76.01.00", 0.96],
                    ["76.01.07", 0.15],
                    ["76.03.00", 0.08],
                    ["76.29.01", 0.04],
                    ["76.15.05", 0.02]
                ]
            }
        ],
        "confusion_matrix_url": "/api/grnti-classification/results/mock/confusion_matrix.png",
        "report_url": "/api/grnti-classification/results/mock/detailed_report.pdf"
    }

@app.route('/api/evaluation/precision', methods=['POST'])
def evaluate_precision():
    """Задача 13: Синхронная оценка точности классификации"""
    
    # Получаем параметры из заголовков
    classification_job_id = request.headers.get('x-classification-job-id')
    eval_type = request.headers.get('x-evaluation-type')  # cluster или grnti
    
    # Валидация параметров
    if not classification_job_id or not eval_type:
        return jsonify(error="Missing required headers: x-classification-job-id, x-evaluation-type"), 400
    
    if classification_job_id not in jobs_db:
        return jsonify(error="Classification job not found"), 404
    
    classification_job = jobs_db[classification_job_id]
    if classification_job.get('status') != 'completed':
        return jsonify(error="Classification job not completed"), 400
    
    # Вычисляем метрики precision
    classification_result = classification_job['result']
    
    if eval_type == 'grnti':
        result = calculate_grnti_precision(classification_result)
    else:
        result = calculate_cluster_precision(classification_result)
    
    # Добавляем информацию о задании
    result['classification_job_id'] = classification_job_id
    result['evaluation_type'] = 'precision'
    result['classification_type'] = eval_type
    result['threshold'] = 0.8
    result['threshold_met'] = result['metrics']['precision'] >= 0.8
    
    return jsonify(result)

def calculate_grnti_precision(grnti_result):
    """Расчет precision для классификации по ГРНТИ"""
    total_tp, total_fp, total_fn = 0, 0, 0
    file_level_metrics = []
    
    for file_data in grnti_result['files']:
        # Экспертная оценка
        expert_label = file_data['expert_grnti_code']
        
        # Предсказания системы (топ-5)
        system_predictions = file_data['top_5_predictions']
        system_classes = {pred[0] for pred in system_predictions}
        
        # Расчет метрик для файла
        tp = 1 if expert_label in system_classes else 0
        fp = len(system_classes) - tp
        fn = 1 - tp
        
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0
        
        total_tp += tp
        total_fp += fp
        total_fn += fn
        
        file_level_metrics.append({
            "file": file_data['file'],
            "expert_label": expert_label,
            "system_predictions": system_predictions,
            "tp": tp,
            "fp": fp,
            "fn": fn,
            "precision": precision,
            "match_found": tp > 0
        })
    
    # Итоговые метрики
    final_precision = total_tp / (total_tp + total_fp) if (total_tp + total_fp) > 0 else 0
    
    return {
        "metrics": {
            "total_files": len(grnti_result['files']),
            "total_tp": total_tp,
            "total_fp": total_fp,
            "total_fn": total_fn,
            "precision": round(final_precision, 4)
        },
        "file_level_metrics": file_level_metrics,
        "summary": {
            "files_with_matches": total_tp,
            "files_without_matches": len(grnti_result['files']) - total_tp,
            "average_precision": round(final_precision, 4)
        }
    }

def calculate_cluster_precision(cluster_result):
    """Расчет precision для кластерной классификации"""
    total_tp, total_fp, total_fn = 0, 0, 0
    file_level_metrics = []
    
    # Mapping экспертных оценок к файлам (в реальной системе это должно приходить извне)
    expert_mapping = {
        "new_ai_research.txt": "cluster1",
        "tech_report.pdf": "cluster1",
        "physics_paper.txt": "cluster2",
        "biology_study.pdf": "cluster2",
        "market_analysis.docx": "cluster3",
        "financial_report.pdf": "cluster3",
        "file001.txt": "c1",
        "file002.txt": "c2"
    }
    
    for file_data in cluster_result['correspondence_table']['files']:
        filename = file_data['f']
        expert_label = expert_mapping.get(filename, "unknown")
        system_predictions = file_data['d']
        system_classes = {pred[0] for pred in system_predictions}
        
        # Расчет метрик для файла
        tp = 1 if expert_label in system_classes else 0
        fp = len(system_classes) - tp
        fn = 1 - tp
        
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0
        
        total_tp += tp
        total_fp += fp
        total_fn += fn
        
        file_level_metrics.append({
            "file": filename,
            "expert_label": expert_label,
            "system_predictions": system_predictions,
            "tp": tp,
            "fp": fp,
            "fn": fn,
            "precision": precision,
            "match_found": tp > 0
        })
    
    # Итоговые метрики
    final_precision = total_tp / (total_tp + total_fp) if (total_tp + total_fp) > 0 else 0
    
    return {
        "metrics": {
            "total_files": len(cluster_result['correspondence_table']['files']),
            "total_tp": total_tp,
            "total_fp": total_fp,
            "total_fn": total_fn,
            "precision": round(final_precision, 4)
        },
        "file_level_metrics": file_level_metrics,
        "summary": {
            "files_with_matches": total_tp,
            "files_without_matches": len(cluster_result['correspondence_table']['files']) - total_tp,
            "average_precision": round(final_precision, 4)
        }
    }

@app.route('/api/evaluation/recall', methods=['POST'])
def evaluate_recall():
    """Задача 14: Синхронная оценка полноты классификации"""
    
    # Получаем параметры из заголовков
    classification_job_id = request.headers.get('x-classification-job-id')
    eval_type = request.headers.get('x-evaluation-type')  # cluster или grnti
    
    # Валидация параметров
    if not classification_job_id or not eval_type:
        return jsonify(error="Missing required headers: x-classification-job-id, x-evaluation-type"), 400
    
    if classification_job_id not in jobs_db:
        return jsonify(error="Classification job not found"), 404
    
    classification_job = jobs_db[classification_job_id]
    if classification_job.get('status') != 'completed':
        return jsonify(error="Classification job not completed"), 400
    
    # Вычисляем метрики recall
    classification_result = classification_job['result']
    
    if eval_type == 'grnti':
        result = calculate_grnti_recall(classification_result)
    else:
        result = calculate_cluster_recall(classification_result)
    
    # Добавляем информацию о задании
    result['classification_job_id'] = classification_job_id
    result['evaluation_type'] = 'recall'
    result['classification_type'] = eval_type
    result['threshold'] = 0.8
    result['threshold_met'] = result['metrics']['recall'] >= 0.8
    
    return jsonify(result)

def calculate_grnti_recall(grnti_result):
    """Расчет recall для классификации по ГРНТИ"""
    total_tp, total_fp, total_fn = 0, 0, 0
    file_level_metrics = []
    
    for file_data in grnti_result['files']:
        # Экспертная оценка
        expert_label = file_data['expert_grnti_code']
        
        # Предсказания системы (топ-5)
        system_predictions = file_data['top_5_predictions']
        system_classes = {pred[0] for pred in system_predictions}
        
        # Расчет метрик для файла
        tp = 1 if expert_label in system_classes else 0
        fp = len(system_classes) - tp
        fn = 1 - tp  # Для recall важно считать false negatives
        
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0  # Формула recall: TP / (TP + FN)
        
        total_tp += tp
        total_fp += fp
        total_fn += fn
        
        file_level_metrics.append({
            "file": file_data['file'],
            "expert_label": expert_label,
            "system_predictions": system_predictions,
            "tp": tp,
            "fp": fp,
            "fn": fn,
            "recall": recall,  # Изменено с precision на recall
            "match_found": tp > 0
        })
    
    # Итоговые метрики - используем формулу recall
    final_recall = total_tp / (total_tp + total_fn) if (total_tp + total_fn) > 0 else 0
    
    return {
        "metrics": {
            "total_files": len(grnti_result['files']),
            "total_tp": total_tp,
            "total_fp": total_fp,
            "total_fn": total_fn,
            "recall": round(final_recall, 4)  # Изменено с precision на recall
        },
        "file_level_metrics": file_level_metrics,
        "summary": {
            "files_with_matches": total_tp,
            "files_without_matches": len(grnti_result['files']) - total_tp,
            "average_recall": round(final_recall, 4)  # Изменено с precision на recall
        }
    }

def calculate_cluster_recall(cluster_result):
    """Расчет recall для кластерной классификации"""
    total_tp, total_fp, total_fn = 0, 0, 0
    file_level_metrics = []
    
    # Mapping экспертных оценок к файлам (в реальной системе это должно приходить извне)
    expert_mapping = {
        "new_ai_research.txt": "cluster1",
        "tech_report.pdf": "cluster1",
        "physics_paper.txt": "cluster2",
        "biology_study.pdf": "cluster2",
        "market_analysis.docx": "cluster3",
        "financial_report.pdf": "cluster3",
        "file001.txt": "c1",
        "file002.txt": "c2"
    }
    
    # Исправленный путь к файлам в кластерной классификации
    for file_data in cluster_result['correspondence_table']['files']:
        filename = file_data['f']
        expert_label = expert_mapping.get(filename, "unknown")
        system_predictions = file_data['d']
        system_classes = {pred[0] for pred in system_predictions}
        
        # Расчет метрик для файла
        tp = 1 if expert_label in system_classes else 0
        fp = len(system_classes) - tp
        fn = 1 - tp
        
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0  # Формула recall
        
        total_tp += tp
        total_fp += fp
        total_fn += fn
        
        file_level_metrics.append({
            "file": filename,
            "expert_label": expert_label,
            "system_predictions": system_predictions,
            "tp": tp,
            "fp": fp,
            "fn": fn,
            "recall": recall,
            "match_found": tp > 0
        })
    
    # Итоговые метрики - используем формулу recall
    final_recall = total_tp / (total_tp + total_fn) if (total_tp + total_fn) > 0 else 0
    
    return {
        "metrics": {
            "total_files": len(cluster_result['correspondence_table']['files']),
            "total_tp": total_tp,
            "total_fp": total_fp,
            "total_fn": total_fn,
            "recall": round(final_recall, 4)
        },
        "file_level_metrics": file_level_metrics,
        "summary": {
            "files_with_matches": total_tp,
            "files_without_matches": len(cluster_result['correspondence_table']['files']) - total_tp,
            "average_recall": round(final_recall, 4)
        }
    }

@app.route('/api/fine-tuning/start', methods=['POST'])
def start_fine_tuning():
    try:
        base_model_id = request.headers.get('X-Base-Model-ID')
        if not base_model_id:
            return jsonify(error="Missing X-Base-Model-ID header"), 400
        
        # Проверяем существование модели
        model_exists = any(m['model_id'] == base_model_id for m in MOCK_MODELS)
        if not model_exists:
            return jsonify(error="Base model not found"), 404
        
        # Симулируем обработку файлов (в реальности здесь бы читались файлы из form-data)
        print(f"Received fine-tuning request for model: {base_model_id}")
        print(f"Files count: {len(request.files) if hasattr(request, 'files') else 0}")
        
        # Парсим form-data параметры
        new_model_name = request.form.get('new_model_name', f"fine_tuned_{int(time.time())}")
        min_file_size = request.form.get('min_file_size', '0')
        max_file_size = request.form.get('max_file_size', '10485760')  # 10MB по умолчанию
        file_extensions = request.form.get('file_extensions', '[]')
        
        print(f"New model name: {new_model_name}")
        print(f"Min file size: {min_file_size}")
        print(f"Max file size: {max_file_size}")
        print(f"File extensions: {file_extensions}")
        
        # Создаем job для асинхронной обработки
        job_id = str(uuid.uuid4())
        jobs_db[job_id] = {
            'status': 'processing',
            'type': 'fine_tuning',
            'progress': 0,
            'base_model_id': base_model_id,
            'new_model_name': new_model_name,
            'result': MOCK_FINE_TUNING_RESULT
        }
        job_creation_time[job_id] = time.time()
        
        # Возвращаем сразу ответ с job_id (как в вашем прокси)
        return jsonify({
            "job_id": job_id,
            "estimated_time_min": 60
        }), 202
        
    except Exception as e:
        print(f"Error in fine-tuning: {e}")
        return jsonify(error=str(e)), 500

@app.route('/api/fine-tuning/history', methods=['GET'])
def get_fine_tuning_history():
    history = []
    for job_id, job in jobs_db.items():
        if job['type'] == 'fine_tuning' and job['status'] == 'completed':
            history.append({
                "job_id": job_id,
                "base_model_id": job['base_model_id'],
                "new_model_id": job['result']['new_model_id'],
                "status": job['status'],
                "created_at": job_creation_time.get(job_id, time.time()),
                "training_time": job['result']['training_time']
            })
    return jsonify(history)

# Обработчики ошибок
@app.errorhandler(404)
def not_found(error):
    return jsonify(error="Not found"), 404

@app.errorhandler(413)
def payload_too_large(error):
    return jsonify(error="PAYLOAD_TOO_LARGE"), 413

@app.errorhandler(429)
def too_many_requests(error):
    return jsonify(error="Too many requests"), 429

@app.errorhandler(500)
def internal_error(error):
    return jsonify(error="Internal server error"), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3000, debug=True)