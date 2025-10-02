#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');

const MODELS_DIR = path.join(__dirname, '..', 'models');
const MODELS = {
  'yolov5s.onnx': 'https://github.com/ultralytics/yolov5/releases/download/v7.0/yolov5s.onnx',
  'yolov5n.onnx': 'https://github.com/ultralytics/yolov5/releases/download/v7.0/yolov5n.onnx'
};

async function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    console.log(`📥 Downloading ${url}...`);
    
    const file = fs.createWriteStream(filepath);
    
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Handle redirect
        downloadFile(response.headers.location, filepath).then(resolve).catch(reject);
        return;
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }

      const totalSize = parseInt(response.headers['content-length'], 10);
      let downloaded = 0;

      response.on('data', (chunk) => {
        downloaded += chunk.length;
        const percent = totalSize ? Math.round((downloaded / totalSize) * 100) : 0;
        process.stdout.write(`\r📊 Progress: ${percent}% (${downloaded}/${totalSize} bytes)`);
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        console.log(`\n✅ Downloaded: ${path.basename(filepath)}`);
        resolve();
      });

      file.on('error', (err) => {
        fs.unlink(filepath, () => {}); // Delete partial file
        reject(err);
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log('🚀 Downloading ONNX models for Edge Agent...');

  // Create models directory
  if (!fs.existsSync(MODELS_DIR)) {
    fs.mkdirSync(MODELS_DIR, { recursive: true });
    console.log(`📁 Created models directory: ${MODELS_DIR}`);
  }

  for (const [filename, url] of Object.entries(MODELS)) {
    const filepath = path.join(MODELS_DIR, filename);
    
    // Skip if file already exists
    if (fs.existsSync(filepath)) {
      console.log(`⏭️ Skipping ${filename} (already exists)`);
      continue;
    }

    try {
      await downloadFile(url, filepath);
    } catch (error) {
      console.error(`❌ Failed to download ${filename}:`, error.message);
      process.exit(1);
    }
  }

  console.log('✅ All models downloaded successfully!');
  console.log('🎯 Available models:');
  
  const files = fs.readdirSync(MODELS_DIR);
  files.forEach(file => {
    const stats = fs.statSync(path.join(MODELS_DIR, file));
    const sizeMB = Math.round(stats.size / 1024 / 1024);
    console.log(`   - ${file} (${sizeMB} MB)`);
  });

  console.log('');
  console.log('🔧 To use a model, set the MODEL_PATH environment variable:');
  console.log(`   export MODEL_PATH=${MODELS_DIR}/yolov5s.onnx`);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { downloadFile };