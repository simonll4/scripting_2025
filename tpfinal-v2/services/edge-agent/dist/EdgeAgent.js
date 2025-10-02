"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EdgeAgent = void 0;
const events_1 = require("events");
const shared_1 = require("@tpfinal/shared");
const CameraCapture_1 = require("./camera/CameraCapture");
const InferenceEngine_1 = require("./inference/InferenceEngine");
const StreamProcessor_1 = require("./streaming/StreamProcessor");
const SessionStoreClient_1 = require("./services/SessionStoreClient");
const ObjectStorageClient_1 = require("./services/ObjectStorageClient");
const config_1 = require("./config");
class EdgeAgent extends events_1.EventEmitter {
    constructor() {
        super();
        // Estado de sesión
        this.currentState = shared_1.SessionState.IDLE;
        this.currentSessionId = null;
        this.lastDetectionTime = 0;
        this.sessionStartTime = 0;
        // Control de streaming
        this.isStreaming = false;
        this.relevantDetectionCount = 0;
        this.streamingThreshold = 3; // Iniciar streaming después de 3 detecciones relevantes
        // Frame processing
        this.currentFrameBuffer = null;
        this.currentFrameTimestamp = 0;
        // Buffers para datos de sesión
        this.sessionDetections = [];
        this.sessionFrames = [];
        this.bestFrame = null;
        // Timers
        this.postRollTimer = null;
        // EdgeAgent como orquestador central - maneja la cámara y distribuye frames
        this.camera = new CameraCapture_1.CameraCapture(config_1.CONFIG.DEVICE_PATH);
        this.inference = new InferenceEngine_1.InferenceEngine();
        this.streamProcessor = new StreamProcessor_1.StreamProcessor();
        this.sessionStore = new SessionStoreClient_1.SessionStoreClient();
        this.objectStorage = new ObjectStorageClient_1.ObjectStorageClient();
        this.setupEventHandlers();
    }
    setupEventHandlers() {
        // EdgeAgent como orquestador - maneja frames de cámara y los distribuye
        this.camera.on('frame', this.handleFrame.bind(this));
        // Escuchar detecciones del inference engine (frame-based)
        this.inference.on('detections', this.handleDetections.bind(this));
        // Cleanup on exit
        process.on('SIGINT', this.shutdown.bind(this));
        process.on('SIGTERM', this.shutdown.bind(this));
    }
    async initialize() {
        console.log('🚀 Initializing Edge Agent...');
        try {
            // Test system dependencies
            await this.testSystemDependencies();
            // Initialize camera capture (EdgeAgent as orchestrator)
            console.log('📹 Starting camera capture...');
            await this.camera.start();
            // Initialize inference engine (without camera - will receive frames from EdgeAgent)
            console.log('🧠 Initializing inference engine...');
            await this.inference.initialize();
            // Initialize object storage
            console.log('💾 Initializing object storage...');
            await this.objectStorage.initializeSession('test');
            // Test session store connectivity
            console.log('🔗 Testing Session Store connectivity...');
            const sessionStoreHealthy = await this.sessionStore.healthCheck();
            if (!sessionStoreHealthy) {
                console.warn('⚠️ Session Store not available, will retry connections');
            }
            console.log('✅ Edge Agent initialized successfully');
            this.emit('initialized');
        }
        catch (error) {
            console.error('❌ Failed to initialize Edge Agent:', error);
            throw error;
        }
    }
    async start() {
        console.log('▶️ Starting Edge Agent...');
        try {
            // No iniciar camera capture - el YOLO engine maneja la cámara
            console.log('📹 Camera capture handled by YOLO engine');
            this.currentState = shared_1.SessionState.IDLE;
            console.log('✅ Edge Agent started and monitoring');
            this.emit('started');
        }
        catch (error) {
            console.error('❌ Failed to start Edge Agent:', error);
            throw error;
        }
    }
    async handleInferenceDetection(detectionData) {
        try {
            const timestamp = Date.now();
            // Convert detection data to Detection format
            const detection = {
                class: detectionData.class,
                score: detectionData.confidence,
                bbox: [detectionData.x1, detectionData.y1, detectionData.x2, detectionData.y2], // [x0, y0, x1, y1]
                ts: timestamp,
                frame_url: '' // Will be set when frame is saved
            };
            // Filter relevant detections
            if (detection.score >= config_1.CONFIG.CONFIDENCE_THRESHOLD &&
                config_1.CONFIG.CLASSES_OF_INTEREST.includes(detection.class)) {
                console.log(`🎯 Relevant detection: ${detection.class} (${(detection.score * 100).toFixed(1)}%)`);
                await this.handleRelevantDetections([detection], null, timestamp);
            }
            else {
                await this.handleNoDetections(timestamp);
            }
        }
        catch (error) {
            console.error('❌ Error processing inference detection:', error);
        }
    }
    async handleFrame(frameData) {
        try {
            const { buffer, timestamp } = frameData;
            // Store current frame data for detection processing
            this.currentFrameBuffer = buffer;
            this.currentFrameTimestamp = timestamp;
            // Send frame to inference engine (async processing)
            await this.inference.processFrame(buffer);
            // Also send frame to streaming if active
            // TODO: Implement StreamProcessor.processFrame method
            // if (this.isStreaming && this.streamProcessor) {
            //   await this.streamProcessor.processFrame(frameData);
            // }
        }
        catch (error) {
            console.error('❌ Error processing frame:', error);
        }
    }
    async handleDetections(detections) {
        if (!this.currentFrameBuffer || !this.currentFrameTimestamp) {
            return;
        }
        try {
            // Convert ONNX detections to our format
            const convertedDetections = detections.map(det => ({
                class: det.class,
                score: det.confidence,
                bbox: [det.bbox.x, det.bbox.y, det.bbox.x + det.bbox.width, det.bbox.y + det.bbox.height], // [x0, y0, x1, y1]
                ts: this.currentFrameTimestamp,
                frame_url: '', // Will be set later when frame is saved
                track_id: `track-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
            }));
            // Filter relevant detections
            const relevantDetections = convertedDetections.filter(d => d.score >= config_1.CONFIG.CONFIDENCE_THRESHOLD &&
                config_1.CONFIG.CLASSES_OF_INTEREST.includes(d.class));
            if (relevantDetections.length > 0) {
                await this.handleRelevantDetections(relevantDetections, this.currentFrameBuffer, this.currentFrameTimestamp);
            }
            else {
                await this.handleNoDetections(this.currentFrameTimestamp);
            }
        }
        catch (error) {
            console.error('❌ Error handling detections:', error);
        }
    }
    async handleRelevantDetections(detections, frameBuffer, timestamp) {
        this.lastDetectionTime = timestamp;
        this.relevantDetectionCount++;
        // Clear post-roll timer if active
        if (this.postRollTimer) {
            clearTimeout(this.postRollTimer);
            this.postRollTimer = null;
        }
        if (this.currentState === shared_1.SessionState.IDLE) {
            // Start new session
            await this.startNewSession(timestamp);
            this.relevantDetectionCount = 1; // Reset counter for new session
        }
        // Iniciar streaming solo después del threshold de detecciones relevantes
        if (this.currentSessionId && !this.isStreaming &&
            this.relevantDetectionCount >= this.streamingThreshold) {
            console.log(`🚨 Streaming threshold reached (${this.relevantDetectionCount}/${this.streamingThreshold})! Starting video stream...`);
            await this.startStreaming();
        }
        if (this.currentSessionId) {
            // Group detections by class to avoid saving multiple frames for similar detections
            const detectionsByClass = new Map();
            detections.forEach(detection => {
                const key = detection.class;
                if (!detectionsByClass.has(key)) {
                    detectionsByClass.set(key, []);
                }
                detectionsByClass.get(key).push(detection);
            });
            const processedDetections = [];
            // Process each class of detections
            for (const [className, classDetections] of detectionsByClass) {
                // Check if we already have a recent detection of this class
                const recentDetection = this.sessionDetections.find(d => {
                    const timeDiff = timestamp - d.ts;
                    return d.class === className && timeDiff < 2000; // Within 2 seconds
                });
                if (!recentDetection && frameBuffer) {
                    // Save frame only for new/unique detections
                    // Use timestamp that includes class info for uniqueness
                    const uniqueTimestamp = timestamp + Math.floor(Math.random() * 1000);
                    const frameUrl = await this.objectStorage.saveFrame(this.currentSessionId, frameBuffer, uniqueTimestamp);
                    // Take the best detection (highest score) for this class
                    const bestDetection = classDetections.reduce((best, current) => current.score > best.score ? current : best);
                    processedDetections.push({
                        ...bestDetection,
                        frame_url: frameUrl,
                        ts: timestamp
                    });
                    console.log(`📸 Saved frame for new ${className} detection (score: ${bestDetection.score.toFixed(2)})`);
                }
                else {
                    // Skip saving frame, but update existing detection timestamp if better score
                    const bestDetection = classDetections.reduce((best, current) => current.score > best.score ? current : best);
                    if (recentDetection && bestDetection.score > recentDetection.score) {
                        recentDetection.score = bestDetection.score;
                        recentDetection.ts = timestamp;
                        console.log(`🔄 Updated ${className} detection score to ${bestDetection.score.toFixed(2)}`);
                    }
                }
            }
            // Store only new unique detections
            if (processedDetections.length > 0) {
                this.sessionDetections.push(...processedDetections);
            }
            // Update best frame if this one has higher scores and we have a frame buffer
            const maxScore = Math.max(...detections.map(d => d.score));
            if (frameBuffer && (!this.bestFrame || maxScore > this.bestFrame.score)) {
                this.bestFrame = {
                    buffer: frameBuffer,
                    score: maxScore,
                    timestamp
                };
            }
            // Store frame annotation
            this.sessionFrames.push({
                ts: timestamp,
                detections: processedDetections
            });
            // Send individual detections to Session Store (optimized for unique detections)
            await this.sendUniqueDetections(processedDetections);
            this.currentState = shared_1.SessionState.ACTIVE;
        }
    }
    async handleNoDetections(timestamp) {
        // Reset detection counter when no relevant detections
        this.relevantDetectionCount = Math.max(0, this.relevantDetectionCount - 1);
        if (this.currentState === shared_1.SessionState.ACTIVE || this.currentState === shared_1.SessionState.OPEN) {
            // Check if post-roll period has elapsed
            const timeSinceLastDetection = timestamp - this.lastDetectionTime;
            if (timeSinceLastDetection >= config_1.CONFIG.POST_ROLL_MS) {
                // Start closing session
                this.currentState = shared_1.SessionState.CLOSING;
                // Schedule session closure
                this.postRollTimer = setTimeout(() => {
                    this.closeCurrentSession(timestamp);
                }, 1000); // Small delay to finish processing
            }
        }
    }
    async startNewSession(timestamp) {
        const sessionId = (0, shared_1.generateSessionId)();
        this.currentSessionId = sessionId;
        this.sessionStartTime = timestamp;
        this.currentState = shared_1.SessionState.OPEN;
        console.log(`🆕 Starting new session: ${sessionId}`);
        try {
            // Initialize session storage
            await this.objectStorage.initializeSession(sessionId);
            // NO iniciamos streaming aquí - solo cuando hay detecciones relevantes continuas
            console.log(`� Session ${sessionId} created, waiting for streaming trigger...`);
            // Send session open event
            await this.sessionStore.openSession({
                session_id: sessionId,
                dev_id: config_1.CONFIG.DEVICE_ID,
                stream_path: `sess-${sessionId}`,
                edge_start_ts: timestamp,
                classes: []
            });
            this.emit('session_started', { sessionId, timestamp });
        }
        catch (error) {
            console.error(`❌ Failed to start session ${sessionId}:`, error);
            this.currentState = shared_1.SessionState.IDLE;
            this.currentSessionId = null;
        }
    }
    async startStreaming() {
        if (!this.currentSessionId || this.isStreaming)
            return;
        try {
            console.log(`📡 Starting streaming for session: ${this.currentSessionId}`);
            const streamUrl = this.streamProcessor.startSessionStream(this.currentSessionId, config_1.CONFIG.DEVICE_PATH);
            this.isStreaming = true;
            console.log(`✅ Streaming started: ${streamUrl}`);
        }
        catch (error) {
            console.error(`❌ Failed to start streaming for session ${this.currentSessionId}:`, error);
        }
    }
    async stopStreaming() {
        if (!this.currentSessionId || !this.isStreaming)
            return;
        try {
            console.log(`📡 Stopping streaming for session: ${this.currentSessionId}`);
            this.streamProcessor.stopSessionStream(this.currentSessionId);
            this.isStreaming = false;
            console.log(`✅ Streaming stopped for session: ${this.currentSessionId}`);
        }
        catch (error) {
            console.error(`❌ Failed to stop streaming for session ${this.currentSessionId}:`, error);
        }
    }
    async closeCurrentSession(timestamp) {
        if (!this.currentSessionId)
            return;
        const sessionId = this.currentSessionId;
        console.log(`🔚 Closing session: ${sessionId}`);
        try {
            // Stop streaming
            await this.stopStreaming();
            // Save thumbnail
            let thumbUrl;
            let thumbTs;
            if (this.bestFrame) {
                thumbUrl = await this.objectStorage.saveThumb(sessionId, this.bestFrame.buffer);
                thumbTs = new Date(this.bestFrame.timestamp).toISOString();
            }
            // Save metadata
            const metadata = {
                session_id: sessionId,
                frames: this.sessionFrames
            };
            const metaUrl = await this.objectStorage.saveMetadata(sessionId, metadata);
            // Construct playlist URL (assuming MediaMTX convention)
            const playlistUrl = `http://localhost:8888/recordings/${sessionId}/index.m3u8`;
            // Send session close event
            await this.sessionStore.closeSession({
                session_id: sessionId,
                edge_end_ts: timestamp,
                playlist_url: playlistUrl,
                start_pdt: new Date(this.sessionStartTime).toISOString(),
                end_pdt: new Date(timestamp).toISOString(),
                meta_url: metaUrl,
                thumb_url: thumbUrl,
                thumb_ts: thumbTs
            });
            // Reset session state
            this.resetSessionState();
            console.log(`✅ Session closed: ${sessionId}`);
            this.emit('session_ended', { sessionId, timestamp, detectionsCount: this.sessionDetections.length });
        }
        catch (error) {
            console.error(`❌ Failed to close session ${sessionId}:`, error);
            this.resetSessionState();
        }
    }
    async sendUniqueDetections(detections) {
        if (!this.currentSessionId || detections.length === 0)
            return;
        // Send individual unique detections (more efficient than batch for few items)
        for (const detection of detections) {
            try {
                await this.sessionStore.sendDetectionsBatch({
                    session_id: this.currentSessionId,
                    batch: [{
                            first_ts: detection.ts,
                            last_ts: detection.ts,
                            class: detection.class,
                            score: detection.score,
                            frame_url: detection.frame_url,
                            attributes: detection.attributes || {}
                        }]
                });
                console.log(`✅ Sent unique detection: ${detection.class} (${detection.score.toFixed(2)}) - ${detection.frame_url}`);
            }
            catch (error) {
                console.error(`❌ Failed to send detection ${detection.class}:`, error);
            }
        }
    }
    async sendDetectionsBatch(detections) {
        if (!this.currentSessionId || detections.length === 0)
            return;
        try {
            await this.sessionStore.sendDetectionsBatch({
                session_id: this.currentSessionId,
                batch: detections.map(d => ({
                    first_ts: d.ts,
                    last_ts: d.ts,
                    class: d.class,
                    score: d.score,
                    frame_url: d.frame_url,
                    attributes: d.attributes || {}
                }))
            });
        }
        catch (error) {
            console.error('❌ Failed to send detections batch:', error);
        }
    }
    resetSessionState() {
        this.currentSessionId = null;
        this.currentState = shared_1.SessionState.IDLE;
        this.sessionDetections = [];
        this.sessionFrames = [];
        this.bestFrame = null;
        this.lastDetectionTime = 0;
        this.sessionStartTime = 0;
        // Reset streaming state
        this.isStreaming = false;
        this.relevantDetectionCount = 0;
        if (this.postRollTimer) {
            clearTimeout(this.postRollTimer);
            this.postRollTimer = null;
        }
    }
    async testSystemDependencies() {
        console.log('🔍 Testing system dependencies...');
        // Test GStreamer
        const gstAvailable = await StreamProcessor_1.StreamProcessor.testGStreamerAvailability();
        if (!gstAvailable) {
            throw new Error('GStreamer not available. Please install gstreamer1.0-tools');
        }
        console.log('✅ GStreamer available');
        // Test video device
        const deviceAvailable = await CameraCapture_1.CameraCapture.testDevice(config_1.CONFIG.DEVICE_PATH);
        if (!deviceAvailable) {
            console.warn(`⚠️ Video device ${config_1.CONFIG.DEVICE_PATH} not available, using test source`);
        }
        else {
            console.log(`✅ Video device ${config_1.CONFIG.DEVICE_PATH} available`);
        }
    }
    async stop() {
        console.log('⏹️ Stopping Edge Agent...');
        // Close current session if active
        if (this.currentSessionId) {
            await this.closeCurrentSession(Date.now());
        }
        // Stop camera (handled by YOLO engine)
        // this.camera.stop();
        // Stop all streams
        this.streamProcessor.stopAllStreams();
        // Close inference engine
        await this.inference.close();
        console.log('✅ Edge Agent stopped');
        this.emit('stopped');
    }
    async shutdown() {
        console.log('🛑 Shutting down Edge Agent...');
        try {
            await this.stop();
        }
        catch (error) {
            console.error('❌ Error during shutdown:', error);
        }
        process.exit(0);
    }
    // Getters for status
    getCurrentState() {
        return this.currentState;
    }
    getCurrentSessionId() {
        return this.currentSessionId;
    }
    getStats() {
        return {
            state: this.currentState,
            sessionId: this.currentSessionId,
            detectionsCount: this.sessionDetections.length,
            isStreaming: this.isStreaming,
            relevantDetectionCount: this.relevantDetectionCount
        };
    }
    // Manual session control (for testing)
    async forceStartSession() {
        if (this.currentState !== shared_1.SessionState.IDLE) {
            throw new Error(`Cannot start session in state: ${this.currentState}`);
        }
        const timestamp = Date.now();
        await this.startNewSession(timestamp);
        if (!this.currentSessionId) {
            throw new Error('Failed to start session');
        }
        return this.currentSessionId;
    }
    async forceCloseSession() {
        if (!this.currentSessionId) {
            throw new Error('No active session to close');
        }
        await this.closeCurrentSession(Date.now());
    }
}
exports.EdgeAgent = EdgeAgent;
