#!/bin/bash

# Integration test script for Computer Vision System
# Tests end-to-end functionality of all services

set -e

echo "🚀 Starting Computer Vision System Integration Tests"

# Configuration
SERVICES_DIR="./services"
TEST_TIMEOUT=30
TEST_SESSION_ID=""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Wait for service to be ready
wait_for_service() {
    local service_name=$1
    local health_url=$2
    local max_attempts=10
    local attempt=1
    
    log_info "Waiting for $service_name to be ready..."
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s -f "$health_url" > /dev/null 2>&1; then
            log_success "$service_name is ready"
            return 0
        fi
        
        log_warning "Attempt $attempt/$max_attempts failed, retrying in 3 seconds..."
        sleep 3
        attempt=$((attempt + 1))
    done
    
    log_error "$service_name failed to start within timeout"
    return 1
}

# Test database connection
test_database() {
    log_info "Testing database connection..."
    
    if PGPASSWORD=postgres psql -h localhost -U postgres -d session_store -c "SELECT 1;" > /dev/null 2>&1; then
        log_success "Database connection successful"
        return 0
    else
        log_error "Database connection failed"
        return 1
    fi
}

# Test session store API
test_session_store() {
    log_info "Testing Session Store API..."
    
    # Test health endpoint
    local health_response=$(curl -s http://localhost:8080/health)
    if echo "$health_response" | grep -q "healthy"; then
        log_success "Session Store health check passed"
    else
        log_error "Session Store health check failed"
        return 1
    fi
    
    # Test creating a session
    local session_data='{
        "startTime": "'$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")'",
        "state": "active",
        "metadata": {
            "test": "integration-test",
            "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")'"
        }
    }'
    
    local create_response=$(curl -s -X POST http://localhost:8080/api/sessions \
        -H "Content-Type: application/json" \
        -d "$session_data")
    
    TEST_SESSION_ID=$(echo "$create_response" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
    
    if [ -n "$TEST_SESSION_ID" ]; then
        log_success "Session created successfully: $TEST_SESSION_ID"
    else
        log_error "Failed to create session"
        log_error "Response: $create_response"
        return 1
    fi
    
    # Test getting the session
    local get_response=$(curl -s http://localhost:8080/api/sessions/$TEST_SESSION_ID)
    if echo "$get_response" | grep -q "$TEST_SESSION_ID"; then
        log_success "Session retrieval successful"
    else
        log_error "Session retrieval failed"
        return 1
    fi
    
    return 0
}

# Test object storage
test_object_storage() {
    log_info "Testing Object Storage..."
    
    # Test health endpoint
    local health_response=$(curl -s http://localhost:8090/health)
    if echo "$health_response" | grep -q "healthy"; then
        log_success "Object Storage health check passed"
    else
        log_error "Object Storage health check failed"
        return 1
    fi
    
    # Test storage stats
    local stats_response=$(curl -s http://localhost:8090/api/stats)
    if echo "$stats_response" | grep -q "totalSizeGB"; then
        log_success "Object Storage stats endpoint working"
    else
        log_error "Object Storage stats endpoint failed"
        return 1
    fi
    
    return 0
}

# Test attribute enricher
test_attribute_enricher() {
    log_info "Testing Attribute Enricher..."
    
    # Test health endpoint
    local health_response=$(curl -s http://localhost:8091/health)
    if echo "$health_response" | grep -q "healthy"; then
        log_success "Attribute Enricher health check passed"
    else
        log_error "Attribute Enricher health check failed"
        return 1
    fi
    
    return 0
}

# Test MediaMTX
test_mediamtx() {
    log_info "Testing MediaMTX..."
    
    # Test MediaMTX API
    if curl -s -f http://localhost:8889/v3/config/get > /dev/null 2>&1; then
        log_success "MediaMTX API accessible"
    else
        log_warning "MediaMTX API not accessible (this may be expected)"
    fi
    
    return 0
}

# Test ONNX model loading
test_onnx_model() {
    log_info "Testing ONNX model..."
    
    # Check if model file exists
    if [ -f "./models/yolov8n.onnx" ]; then
        log_success "ONNX model file found"
    else
        log_warning "ONNX model file not found - downloading..."
        
        # Create models directory
        mkdir -p ./models
        
        # Download YOLOv8 nano model (smallest for testing)
        if command -v wget > /dev/null; then
            wget -O ./models/yolov8n.onnx "https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8n.onnx"
        elif command -v curl > /dev/null; then
            curl -L -o ./models/yolov8n.onnx "https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8n.onnx"
        else
            log_error "Neither wget nor curl available for model download"
            return 1
        fi
        
        if [ -f "./models/yolov8n.onnx" ]; then
            log_success "ONNX model downloaded successfully"
        else
            log_error "Failed to download ONNX model"
            return 1
        fi
    fi
    
    return 0
}

# Test end-to-end detection flow
test_detection_flow() {
    if [ -z "$TEST_SESSION_ID" ]; then
        log_error "No test session available for detection flow test"
        return 1
    fi
    
    log_info "Testing detection flow..."
    
    # Create a test detection
    local detection_data='{
        "sessionId": "'$TEST_SESSION_ID'",
        "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")'",
        "className": "person",
        "confidence": 0.85,
        "boundingBox": {
            "x": 100,
            "y": 100,
            "width": 200,
            "height": 300
        },
        "attributes": {
            "test": "integration-test"
        }
    }'
    
    local detection_response=$(curl -s -X POST http://localhost:8080/api/detections \
        -H "Content-Type: application/json" \
        -d "$detection_data")
    
    local detection_id=$(echo "$detection_response" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
    
    if [ -n "$detection_id" ]; then
        log_success "Detection created successfully: $detection_id"
    else
        log_error "Failed to create detection"
        log_error "Response: $detection_response"
        return 1
    fi
    
    # Test getting detections for session
    local session_detections=$(curl -s "http://localhost:8080/api/sessions/$TEST_SESSION_ID/detections")
    if echo "$session_detections" | grep -q "$detection_id"; then
        log_success "Detection retrieval successful"
    else
        log_error "Detection retrieval failed"
        return 1
    fi
    
    return 0
}

# Cleanup test data
cleanup() {
    log_info "Cleaning up test data..."
    
    if [ -n "$TEST_SESSION_ID" ]; then
        # Delete test session
        curl -s -X DELETE http://localhost:8080/api/sessions/$TEST_SESSION_ID > /dev/null 2>&1
        log_success "Test session cleaned up"
    fi
}

# Main test execution
main() {
    log_info "Starting integration tests..."
    
    # Check if running in Docker environment
    if [ -f "/.dockerenv" ]; then
        log_info "Running in Docker environment"
    else
        log_info "Running in host environment"
    fi
    
    # Test database first
    if ! test_database; then
        log_error "Database test failed - check PostgreSQL connection"
        exit 1
    fi
    
    # Wait for all services to be ready
    wait_for_service "Session Store" "http://localhost:8080/health" || exit 1
    wait_for_service "Object Storage" "http://localhost:8090/health" || exit 1
    wait_for_service "Attribute Enricher" "http://localhost:8091/health" || exit 1
    
    # Run individual service tests
    test_session_store || exit 1
    test_object_storage || exit 1
    test_attribute_enricher || exit 1
    test_mediamtx
    test_onnx_model || exit 1
    
    # Run end-to-end tests
    test_detection_flow || exit 1
    
    # Cleanup
    cleanup
    
    log_success "🎉 All integration tests passed!"
    
    # Print summary
    echo ""
    echo "📊 Test Summary:"
    echo "  ✅ Database connection"
    echo "  ✅ Session Store API"
    echo "  ✅ Object Storage API"
    echo "  ✅ Attribute Enricher API"
    echo "  ✅ ONNX model availability"
    echo "  ✅ End-to-end detection flow"
    echo ""
    log_success "System is ready for operation!"
}

# Trap for cleanup on exit
trap cleanup EXIT

# Run main function
main "$@"