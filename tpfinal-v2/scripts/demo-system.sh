#!/bin/bash

# Script de demostración final del sistema Computer Vision
# Usa el formato correcto de datos que esperan los servicios

echo "🎬 DEMOSTRACIÓN DEL SISTEMA COMPUTER VISION"
echo "=========================================="
echo ""

# Verificar que jq esté disponible
if ! command -v jq &> /dev/null; then
    echo "⚠️  Instalando jq..."
    sudo apt update && sudo apt install -y jq
fi

echo "🔍 ESTADO DE LOS SERVICIOS"
echo "-------------------------"
SESSION_STORE_STATUS=$(curl -s http://localhost:8080/api/health | jq -r '.status')
OBJECT_STORAGE_STATUS=$(curl -s http://localhost:8090/health | jq -r '.status') 
ATTRIBUTE_ENRICHER_STATUS=$(curl -s http://localhost:8091/health | jq -r '.status')

echo "📊 Session Store:     $SESSION_STORE_STATUS"
echo "💾 Object Storage:    $OBJECT_STORAGE_STATUS"
echo "🎨 Attribute Enricher: $ATTRIBUTE_ENRICHER_STATUS"
echo ""

if [[ "$SESSION_STORE_STATUS" != "healthy" ]] || [[ "$OBJECT_STORAGE_STATUS" != "healthy" ]] || [[ "$ATTRIBUTE_ENRICHER_STATUS" != "healthy" ]]; then
    echo "❌ Algunos servicios no están funcionando. Verifica con:"
    echo "   ./scripts/status.sh"
    exit 1
fi

echo "✅ Todos los servicios funcionando correctamente"
echo ""

# Generar IDs únicos para la demo
SESSION_ID="demo-$(date +%s)"
DEV_ID="webcam-$(hostname)"
EDGE_START_TS=$(date +%s)000  # Timestamp en milisegundos

echo "🎯 CREANDO SESIÓN DE DEMOSTRACIÓN"
echo "--------------------------------"
echo "  🆔 Session ID: $SESSION_ID"
echo "  📱 Device ID:  $DEV_ID" 
echo "  ⏰ Start Time: $EDGE_START_TS"
echo ""

# Crear sesión con formato correcto
SESSION_RESPONSE=$(curl -s -X POST http://localhost:8080/api/sessions/open \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'$SESSION_ID'",
    "dev_id": "'$DEV_ID'",
    "stream_path": "/dev/video0",
    "edge_start_ts": '$EDGE_START_TS',
    "metadata": {
      "demo": true,
      "description": "Demostración del sistema completo",
      "camera_device": "/dev/video0"
    }
  }')

echo "📝 Respuesta de creación de sesión:"
echo $SESSION_RESPONSE | jq .
echo ""

# Verificar si la sesión se creó correctamente
if echo $SESSION_RESPONSE | jq -e '.session_id' > /dev/null; then
    echo "✅ Sesión creada exitosamente"
else
    echo "❌ Error creando sesión. Detalles:"
    echo $SESSION_RESPONSE | jq .
    exit 1
fi

echo ""
echo "🤖 SIMULANDO DETECCIONES DE OBJETOS"
echo "-----------------------------------"

# Crear un lote de detecciones simuladas
CURRENT_TS=$(date -Iseconds)
DETECTION_RESPONSE=$(curl -s -X POST http://localhost:8080/api/detections/batch \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'$SESSION_ID'",
    "batch": [
      {
        "class": "person",
        "confidence": 0.89,
        "bbox": {"x": 150, "y": 100, "width": 120, "height": 200},
        "timestamp": "'$CURRENT_TS'"
      },
      {
        "class": "cat",
        "confidence": 0.76,
        "bbox": {"x": 300, "y": 250, "width": 80, "height": 60},
        "timestamp": "'$CURRENT_TS'"
      },
      {
        "class": "laptop",
        "confidence": 0.82,
        "bbox": {"x": 50, "y": 300, "width": 200, "height": 150},
        "timestamp": "'$CURRENT_TS'"
      }
    ]
  }')

echo "📊 Respuesta del lote de detecciones:"
echo $DETECTION_RESPONSE | jq .
echo ""

sleep 1

echo "📈 CONSULTANDO DETECCIONES REGISTRADAS"
echo "-------------------------------------"
DETECTIONS=$(curl -s "http://localhost:8080/api/detections/session/$SESSION_ID")
echo $DETECTIONS | jq .
echo ""

DETECTION_COUNT=$(echo $DETECTIONS | jq '.count')
echo "📊 Total de detecciones en la sesión: $DETECTION_COUNT"
echo ""

if [ "$DETECTION_COUNT" -gt 0 ]; then
    echo "🏷️  Objetos detectados:"
    echo $DETECTIONS | jq -r '.detections[] | "  - \(.class_name) (confianza: \(.confidence))"'
    echo ""
fi

echo "📋 ESTADÍSTICAS DEL ALMACENAMIENTO"
echo "---------------------------------"
STORAGE_STATS=$(curl -s http://localhost:8090/api/stats)
echo $STORAGE_STATS | jq .
echo ""

echo "🔚 CERRANDO SESIÓN"
echo "------------------"
EDGE_END_TS=$(date +%s)000  # Timestamp en milisegundos
CLOSE_RESPONSE=$(curl -s -X POST http://localhost:8080/api/sessions/close \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'$SESSION_ID'",
    "edge_end_ts": '$EDGE_END_TS',
    "metadata": {
      "demo_completed": true,
      "total_detections": '$DETECTION_COUNT'
    }
  }')

echo "📝 Respuesta del cierre de sesión:"
echo $CLOSE_RESPONSE | jq .
echo ""

echo "🎉 ¡DEMOSTRACIÓN COMPLETADA EXITOSAMENTE!"
echo "========================================"
echo ""
echo "📊 Resumen de la demo:"
echo "  🆔 Session ID: $SESSION_ID"
echo "  🎯 Detecciones: $DETECTION_COUNT objetos detectados"
echo "  ⏱️  Duración: $(( $(date +%s) - $(date -d "$EDGE_START_TS" +%s) )) segundos"
echo ""
echo "🌐 URLs de los servicios:"
echo "  📊 Session Store API:     http://localhost:8080/api/health"
echo "  💾 Object Storage API:    http://localhost:8090/api/stats"
echo "  🎨 Attribute Enricher:    http://localhost:8091/health"
echo ""
echo "📋 Para monitorear el sistema:"
echo "  ./scripts/status.sh"
echo ""
echo "🛠️  Para más pruebas:"
echo "  curl http://localhost:8080/api/detections/stats"
echo "  curl http://localhost:8080/api/sessions/$SESSION_ID"
echo ""