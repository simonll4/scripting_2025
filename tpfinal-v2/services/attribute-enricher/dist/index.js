"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const multer_1 = __importDefault(require("multer"));
const sharp_1 = __importDefault(require("sharp"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = require("dotenv");
// Load environment variables
(0, dotenv_1.config)({ path: path_1.default.resolve(__dirname, '../../.env') });
const CONFIG = {
    PORT: parseInt(process.env.ATTRIBUTE_ENRICHER_PORT || '8091'),
    SESSION_STORE_URL: process.env.SESSION_STORE_URL || 'http://localhost:8080',
    OBJECT_STORAGE_URL: process.env.OBJECT_STORAGE_URL || 'http://localhost:8090',
    NODE_ENV: process.env.NODE_ENV || 'development'
};
const app = (0, express_1.default)();
exports.app = app;
// Security middleware
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({
    origin: CONFIG.NODE_ENV === 'production'
        ? ['http://localhost:3000', 'http://localhost:8080']
        : true,
    credentials: true
}));
app.use((0, compression_1.default)());
// Body parsing
app.use(express_1.default.json({ limit: '10mb' }));
// Multer configuration for file uploads
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        }
        else {
            cb(new Error('Only image files are allowed'));
        }
    }
});
// Logging middleware
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(JSON.stringify({
            timestamp: new Date().toISOString(),
            method: req.method,
            url: req.url,
            status: res.statusCode,
            duration: `${duration}ms`,
            userAgent: req.get('User-Agent'),
            ip: req.ip
        }));
    });
    next();
});
// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'attribute-enricher',
        config: {
            sessionStoreUrl: CONFIG.SESSION_STORE_URL,
            objectStorageUrl: CONFIG.OBJECT_STORAGE_URL
        }
    });
});
// Enrich detection from URL
app.post('/api/enrich', async (req, res) => {
    try {
        const enrichmentRequest = req.body;
        if (!enrichmentRequest.sessionId || !enrichmentRequest.detectionId) {
            return res.status(400).json({
                error: 'sessionId and detectionId are required'
            });
        }
        const result = await processEnrichment(enrichmentRequest);
        // Update detection in Session Store
        await updateDetectionAttributes(result);
        res.json(result);
    }
    catch (error) {
        console.error('Enrichment error:', error);
        res.status(500).json({
            error: 'Failed to enrich detection',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// Enrich detection from uploaded image
app.post('/api/enrich/upload', upload.single('image'), async (req, res) => {
    try {
        const { sessionId, detectionId } = req.body;
        if (!sessionId || !detectionId) {
            return res.status(400).json({
                error: 'sessionId and detectionId are required'
            });
        }
        if (!req.file) {
            return res.status(400).json({
                error: 'Image file is required'
            });
        }
        const startTime = Date.now();
        const result = await processImageBuffer(req.file.buffer, {
            sessionId,
            detectionId
        });
        const processingTime = Date.now() - startTime;
        const enrichmentResult = {
            ...result,
            processingTime
        };
        // Update detection in Session Store
        await updateDetectionAttributes(enrichmentResult);
        res.json(enrichmentResult);
    }
    catch (error) {
        console.error('Upload enrichment error:', error);
        res.status(500).json({
            error: 'Failed to enrich uploaded image',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// Batch enrichment endpoint
app.post('/api/enrich/batch', async (req, res) => {
    try {
        const { requests } = req.body;
        if (!Array.isArray(requests) || requests.length === 0) {
            return res.status(400).json({
                error: 'requests array is required'
            });
        }
        // Process all requests in parallel
        const results = await Promise.all(requests.map(async (request) => {
            try {
                return await processEnrichment(request);
            }
            catch (error) {
                return {
                    detectionId: request.detectionId,
                    attributes: {},
                    processingTime: 0,
                    error: error instanceof Error ? error.message : 'Unknown error'
                };
            }
        }));
        // Update all detections in Session Store
        const successfulResults = results.filter(r => !r.error);
        if (successfulResults.length > 0) {
            await Promise.all(successfulResults.map(result => updateDetectionAttributes(result)));
        }
        res.json({
            total: results.length,
            successful: successfulResults.length,
            failed: results.length - successfulResults.length,
            results
        });
    }
    catch (error) {
        console.error('Batch enrichment error:', error);
        res.status(500).json({
            error: 'Failed to process batch enrichment'
        });
    }
});
// Get color palette from image
app.post('/api/colors/palette', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                error: 'Image file is required'
            });
        }
        const colors = await extractColorPalette(req.file.buffer);
        res.json({ colors });
    }
    catch (error) {
        console.error('Color palette error:', error);
        res.status(500).json({
            error: 'Failed to extract color palette'
        });
    }
});
// Error handler
app.use((error, req, res, next) => {
    console.error('Attribute Enricher error:', error);
    res.status(error.status || 500).json({
        error: 'Internal Server Error',
        message: CONFIG.NODE_ENV === 'development' ? error.message : 'Something went wrong',
        timestamp: new Date().toISOString()
    });
});
// Core processing functions
async function processEnrichment(request) {
    const startTime = Date.now();
    try {
        let imageBuffer;
        if (request.frameUrl) {
            // Download image from URL
            const response = await (0, node_fetch_1.default)(request.frameUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch image: ${response.statusText}`);
            }
            imageBuffer = Buffer.from(await response.arrayBuffer());
        }
        else {
            // Try to get frame from object storage
            const frameUrl = `${CONFIG.OBJECT_STORAGE_URL}/${request.sessionId}/frames/${request.detectionId}.jpg`;
            const response = await (0, node_fetch_1.default)(frameUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch frame from object storage: ${response.statusText}`);
            }
            imageBuffer = Buffer.from(await response.arrayBuffer());
        }
        // Crop to bounding box if provided
        if (request.boundingBox) {
            imageBuffer = await (0, sharp_1.default)(imageBuffer)
                .extract({
                left: Math.round(request.boundingBox.x),
                top: Math.round(request.boundingBox.y),
                width: Math.round(request.boundingBox.width),
                height: Math.round(request.boundingBox.height)
            })
                .toBuffer();
        }
        const result = await processImageBuffer(imageBuffer, request);
        return {
            ...result,
            processingTime: Date.now() - startTime
        };
    }
    catch (error) {
        return {
            detectionId: request.detectionId,
            attributes: {},
            processingTime: Date.now() - startTime,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}
async function processImageBuffer(imageBuffer, request) {
    // Get image stats
    const image = (0, sharp_1.default)(imageBuffer);
    const { width, height } = await image.metadata();
    if (!width || !height) {
        throw new Error('Unable to get image dimensions');
    }
    // Extract color information
    const colors = await extractColorPalette(imageBuffer);
    const dominantColor = colors[0];
    const secondaryColors = colors.slice(1, 4);
    // Calculate average color
    const averageColor = await calculateAverageColor(imageBuffer);
    // Calculate color distribution
    const colorDistribution = calculateColorDistribution(colors);
    // Calculate image properties
    const brightness = calculateBrightness(averageColor.rgb);
    const contrast = await calculateContrast(imageBuffer);
    const saturation = averageColor.hsl[1];
    return {
        detectionId: request.detectionId,
        attributes: {
            dominantColor,
            secondaryColors,
            averageColor,
            colorDistribution,
            brightness,
            contrast,
            saturation
        }
    };
}
async function extractColorPalette(imageBuffer) {
    // Resize image for faster processing
    const resizedBuffer = await (0, sharp_1.default)(imageBuffer)
        .resize(100, 100, { fit: 'cover' })
        .raw()
        .toBuffer({ resolveWithObject: true });
    const { data, info } = resizedBuffer;
    const pixels = [];
    // Extract RGB values
    for (let i = 0; i < data.length; i += info.channels) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        pixels.push([r, g, b]);
    }
    // K-means clustering to find dominant colors
    const clusters = kMeansClustering(pixels, 5);
    return clusters.map((cluster, index) => {
        const rgb = [
            Math.round(cluster.centroid[0]),
            Math.round(cluster.centroid[1]),
            Math.round(cluster.centroid[2])
        ];
        const hsl = rgbToHsl(rgb);
        const hex = rgbToHex(rgb);
        const name = getColorName(rgb);
        return {
            name,
            hex,
            rgb,
            hsl,
            confidence: cluster.size / pixels.length
        };
    });
}
async function calculateAverageColor(imageBuffer) {
    const { data, info } = await (0, sharp_1.default)(imageBuffer)
        .resize(1, 1)
        .raw()
        .toBuffer({ resolveWithObject: true });
    const rgb = [data[0], data[1], data[2]];
    const hsl = rgbToHsl(rgb);
    const hex = rgbToHex(rgb);
    const name = getColorName(rgb);
    return {
        name,
        hex,
        rgb,
        hsl,
        confidence: 1.0
    };
}
function calculateColorDistribution(colors) {
    const distribution = {};
    colors.forEach(color => {
        const colorFamily = getColorFamily(color.hsl);
        distribution[colorFamily] = (distribution[colorFamily] || 0) + color.confidence;
    });
    return distribution;
}
function calculateBrightness(rgb) {
    // Calculate perceived brightness using luminance formula
    const [r, g, b] = rgb;
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
async function calculateContrast(imageBuffer) {
    // Convert to grayscale and calculate standard deviation
    const { data } = await (0, sharp_1.default)(imageBuffer)
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });
    const pixels = Array.from(data);
    const mean = pixels.reduce((sum, pixel) => sum + pixel, 0) / pixels.length;
    const variance = pixels.reduce((sum, pixel) => sum + Math.pow(pixel - mean, 2), 0) / pixels.length;
    return Math.sqrt(variance) / 255; // Normalize to 0-1
}
// Color utility functions
function rgbToHsl(rgb) {
    const [r, g, b] = rgb.map(x => x / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const diff = max - min;
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;
    if (diff !== 0) {
        s = l > 0.5 ? diff / (2 - max - min) : diff / (max + min);
        switch (max) {
            case r:
                h = (g - b) / diff + (g < b ? 6 : 0);
                break;
            case g:
                h = (b - r) / diff + 2;
                break;
            case b:
                h = (r - g) / diff + 4;
                break;
        }
        h /= 6;
    }
    return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}
function rgbToHex(rgb) {
    return '#' + rgb.map(x => Math.round(x).toString(16).padStart(2, '0')).join('');
}
function getColorName(rgb) {
    const hsl = rgbToHsl(rgb);
    const [h, s, l] = hsl;
    // Simple color naming based on HSL
    if (l < 10)
        return 'black';
    if (l > 90)
        return 'white';
    if (s < 10)
        return 'gray';
    if (h < 15 || h >= 345)
        return 'red';
    if (h < 45)
        return 'orange';
    if (h < 75)
        return 'yellow';
    if (h < 105)
        return 'lime';
    if (h < 135)
        return 'green';
    if (h < 165)
        return 'teal';
    if (h < 195)
        return 'cyan';
    if (h < 225)
        return 'blue';
    if (h < 255)
        return 'indigo';
    if (h < 285)
        return 'purple';
    if (h < 315)
        return 'magenta';
    return 'pink';
}
function getColorFamily(hsl) {
    const [h, s, l] = hsl;
    if (l < 20)
        return 'dark';
    if (l > 80)
        return 'light';
    if (s < 20)
        return 'neutral';
    if (h < 30 || h >= 330)
        return 'warm';
    if (h < 90)
        return 'warm';
    if (h < 150)
        return 'cool';
    if (h < 210)
        return 'cool';
    if (h < 270)
        return 'cool';
    return 'warm';
}
// K-means clustering implementation
function kMeansClustering(pixels, k) {
    if (pixels.length === 0)
        return [];
    // Initialize centroids randomly
    const centroids = [];
    for (let i = 0; i < k; i++) {
        const randomPixel = pixels[Math.floor(Math.random() * pixels.length)];
        centroids.push([...randomPixel]);
    }
    const maxIterations = 10;
    for (let iter = 0; iter < maxIterations; iter++) {
        // Assign pixels to nearest centroid
        const clusters = Array(k).fill(null).map(() => []);
        pixels.forEach(pixel => {
            let minDistance = Infinity;
            let nearestCluster = 0;
            centroids.forEach((centroid, index) => {
                const distance = Math.sqrt(Math.pow(pixel[0] - centroid[0], 2) +
                    Math.pow(pixel[1] - centroid[1], 2) +
                    Math.pow(pixel[2] - centroid[2], 2));
                if (distance < minDistance) {
                    minDistance = distance;
                    nearestCluster = index;
                }
            });
            clusters[nearestCluster].push(pixel);
        });
        // Update centroids
        let changed = false;
        clusters.forEach((cluster, index) => {
            if (cluster.length > 0) {
                const newCentroid = [
                    cluster.reduce((sum, pixel) => sum + pixel[0], 0) / cluster.length,
                    cluster.reduce((sum, pixel) => sum + pixel[1], 0) / cluster.length,
                    cluster.reduce((sum, pixel) => sum + pixel[2], 0) / cluster.length
                ];
                const oldCentroid = centroids[index];
                if (Math.abs(newCentroid[0] - oldCentroid[0]) > 1 ||
                    Math.abs(newCentroid[1] - oldCentroid[1]) > 1 ||
                    Math.abs(newCentroid[2] - oldCentroid[2]) > 1) {
                    changed = true;
                }
                centroids[index] = newCentroid;
            }
        });
        if (!changed)
            break;
    }
    // Return results sorted by cluster size
    return centroids
        .map((centroid, index) => ({
        centroid,
        size: Math.max(1, pixels.filter(pixel => {
            let minDistance = Infinity;
            let nearestIndex = 0;
            centroids.forEach((c, i) => {
                const distance = Math.sqrt(Math.pow(pixel[0] - c[0], 2) +
                    Math.pow(pixel[1] - c[1], 2) +
                    Math.pow(pixel[2] - c[2], 2));
                if (distance < minDistance) {
                    minDistance = distance;
                    nearestIndex = i;
                }
            });
            return nearestIndex === index;
        }).length)
    }))
        .sort((a, b) => b.size - a.size);
}
async function updateDetectionAttributes(result) {
    if (result.error)
        return;
    try {
        const response = await (0, node_fetch_1.default)(`${CONFIG.SESSION_STORE_URL}/api/detections/${result.detectionId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                enrichedAttributes: result.attributes
            })
        });
        if (!response.ok) {
            console.warn(`Failed to update detection ${result.detectionId}: ${response.statusText}`);
        }
    }
    catch (error) {
        console.error(`Error updating detection ${result.detectionId}:`, error);
    }
}
// Start server
app.listen(CONFIG.PORT, () => {
    console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        service: 'attribute-enricher',
        event: 'server_started',
        port: CONFIG.PORT,
        environment: CONFIG.NODE_ENV
    }));
});
// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    process.exit(0);
});
process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    process.exit(0);
});
//# sourceMappingURL=index.js.map