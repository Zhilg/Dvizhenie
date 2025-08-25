FROM python:3.9-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# Создаем папку для общих данных
RUN mkdir -p /app/shared_data

EXPOSE 3000

CMD ["python", "app.py"]