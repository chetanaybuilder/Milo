FROM python:3.11-slim

WORKDIR /code

# Install requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Expose standard port
EXPOSE 8000

# Run the app
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
