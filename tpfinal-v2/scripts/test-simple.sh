#!/bin/bash

# Prueba simple del sistema actual

echo "🧪 Prueba Simple💾 5. Probando Object Storage stats...
STATS_RESPONSE=$(curl -s http://localhost:8090/api/stats)

echo "Estadísticas de almacenamiento:"
echo $STATS_RESPONSE | jq .
echo ""ema"
echo "============================"
echo ""

# Verificar que jq esté disponible
if ! command -v jq &> /dev/null; then
    echo "❌ jq no está instalado. Instalando..."
    sudo apt update && sudo apt install -y jq
fi

echo "🔍 1. Verificando servicios..."
echo "Session Store:"
curl -s http://localhost:8080/api/health | jq .
echo ""
echo "Object Storage:"
curl -s http://localhost:8090/health | jq .
echo ""
echo "Attribute Enricher:"
curl -s http://localhost:8091/health | jq .
echo ""

echo "🚀 2. Creando sesión de prueba..."
SESSION_RESPONSE=$(curl -s -X POST http://localhost:8080/api/sessions/open \
  -H "Content-Type: application/json" \
  -d '{
    "metadata": {
      "test": true,
      "description": "Prueba manual del sistema"
    }
  }')

echo "Respuesta de sesión:"
echo $SESSION_RESPONSE | jq .
SESSION_ID=$(echo $SESSION_RESPONSE | jq -r '.session.id')
echo "ID de sesión: $SESSION_ID"
echo ""

echo "🤖 3. Agregando detecciones de prueba..."
DETECTION_RESPONSE=$(curl -s -X POST http://localhost:8080/api/detections/batch \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'$SESSION_ID'",
    "batch": [
      {
        "class": "person",
        "confidence": 0.89,
        "bbox": {"x": 100, "y": 150, "width": 120, "height": 200},
        "timestamp": "'$(date -Iseconds)'"
      },
      {
        "class": "cat",
        "confidence": 0.76,
        "bbox": {"x": 300, "y": 200, "width": 80, "height": 60},
        "timestamp": "'$(date -Iseconds)'"
      }
    ]
  }')

echo "Respuesta de detecciones:"
echo $DETECTION_RESPONSE | jq .
echo ""

echo "📊 4. Consultando detecciones..."
DETECTIONS=$(curl -s "http://localhost:8080/api/detections/session/$SESSION_ID")
echo $DETECTIONS | jq .
echo ""

echo "💾 5. Probando subida de archivo..."
echo "Imagen de prueba" > /tmp/test.txt
UPLOAD_RESPONSE=$(curl -s -X POST http://localhost:8090/api/upload \
  -F "sessionId=$SESSION_ID" \
  -F "frame=@/tmp/test.txt")

echo "Respuesta de subida:"
echo $UPLOAD_RESPONSE | jq .
echo ""

echo "🔚 6. Cerrando sesión..."
CLOSE_RESPONSE=$(curl -s -X POST http://localhost:8080/api/sessions/close \
  -H "Content-Type: application/json" \
  -d '{"session_id": "'$SESSION_ID'", "metadata": {"test_completed": true}}')

echo "Respuesta del cierre:"
echo $CLOSE_RESPONSE | jq .
echo ""

# Limpiar
rm -f /tmp/test.txt

echo "✅ Prueba completada!"
echo ""
echo "🌐 URLs disponibles:"
echo "  Session Store: http://localhost:8080/api/sessions"
echo "  Object Storage: http://localhost:8090/health"
echo "  Attribute Enricher: http://localhost:8091/health"