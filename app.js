// CBZ to XTC Converter - Browser-based conversion
// JSZip is loaded from CDN in index.html

import { applyDithering } from './dithering.js';
import { toGrayscale, applyContrast, calculateOverlapSegments } from './image-processing.js';
import { rotateCanvas, extractAndRotate, resizeWithPadding, TARGET_WIDTH, TARGET_HEIGHT } from './canvas-utils.js';

// File management
let selectedFiles = [];
let results = [];

// DOM Elements
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const fileListSection = document.getElementById('fileList');
const filesContainer = document.getElementById('files');
const convertBtn = document.getElementById('convertBtn');
const progressSection = document.getElementById('progress');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const currentPage = document.getElementById('currentPage');
const resultsSection = document.getElementById('results');
const resultsList = document.getElementById('resultsList');

// Options elements
const splitModeSelect = document.getElementById('splitMode');
const ditheringSelect = document.getElementById('dithering');
const contrastSelect = document.getElementById('contrast');
const marginInput = document.getElementById('margin');

// Event Listeners
dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});
dropzone.addEventListener('dragleave', () => {
  dropzone.classList.remove('dragover');
});
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  handleFiles(e.dataTransfer.files);
});
fileInput.addEventListener('change', (e) => {
  handleFiles(e.target.files);
});
convertBtn.addEventListener('click', startConversion);

function handleFiles(files) {
  const cbzFiles = Array.from(files).filter(f => 
    f.name.toLowerCase().endsWith('.cbz')
  );
  
  if (cbzFiles.length === 0) {
    alert('Please select CBZ files');
    return;
  }
  
  selectedFiles = [...selectedFiles, ...cbzFiles];
  updateFileList();
}

function updateFileList() {
  if (selectedFiles.length === 0) {
    fileListSection.classList.add('hidden');
    return;
  }
  
  fileListSection.classList.remove('hidden');
  filesContainer.innerHTML = selectedFiles.map((file, idx) => `
    <div class="file-item">
      <span class="name">${file.name}</span>
      <span class="size">${formatSize(file.size)}</span>
      <button class="remove" data-idx="${idx}">&times;</button>
    </div>
  `).join('');
  
  // Add remove handlers
  filesContainer.querySelectorAll('.remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.dataset.idx);
      selectedFiles.splice(idx, 1);
      updateFileList();
    });
  });
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

async function startConversion() {
  if (selectedFiles.length === 0) return;
  
  const options = {
    splitMode: splitModeSelect.value,
    dithering: ditheringSelect.value,
    contrast: parseInt(contrastSelect.value),
    margin: parseFloat(marginInput.value)
  };
  
  convertBtn.disabled = true;
  progressSection.classList.remove('hidden');
  resultsSection.classList.add('hidden');
  results = [];
  
  for (let i = 0; i < selectedFiles.length; i++) {
    const file = selectedFiles[i];
    progressText.textContent = `Processing ${file.name} (${i + 1}/${selectedFiles.length})...`;
    progressBar.style.width = `${(i / selectedFiles.length) * 100}%`;
    
    try {
      const result = await convertCbzToXtc(file, options, (pageProgress, previewUrl) => {
        progressBar.style.width = `${((i + pageProgress) / selectedFiles.length) * 100}%`;
        if (previewUrl) {
          currentPage.innerHTML = `<img src="${previewUrl}" alt="Current page">`;
        }
      });
      results.push(result);
    } catch (err) {
      console.error(`Error converting ${file.name}:`, err);
      results.push({
        name: file.name.replace('.cbz', '.xtc'),
        error: err.message
      });
    }
  }
  
  progressBar.style.width = '100%';
  progressText.textContent = 'Conversion complete!';
  currentPage.innerHTML = '';
  convertBtn.disabled = false;
  
  showResults();
}

function showResults() {
  resultsSection.classList.remove('hidden');
  resultsList.innerHTML = results.map((result, idx) => {
    if (result.error) {
      return `
        <div class="result-item">
          <div>
            <span class="name" style="color: #ff4757;">${result.name}</span>
            <div class="info">Error: ${result.error}</div>
          </div>
        </div>
      `;
    }
    return `
      <div class="result-item">
        <div>
          <span class="name">${result.name}</span>
          <div class="info">${result.pageCount} pages, ${formatSize(result.size)}</div>
        </div>
        <button class="btn-download" data-idx="${idx}">Download</button>
      </div>
    `;
  }).join('');
  
  resultsList.querySelectorAll('.btn-download').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.dataset.idx);
      downloadResult(results[idx]);
    });
  });
}

function downloadResult(result) {
  const blob = new Blob([result.data], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = result.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Main conversion function
async function convertCbzToXtc(file, options, onProgress) {
  // Extract CBZ
  const zip = await JSZip.loadAsync(file);
  
  // Get image files sorted
  const imageFiles = [];
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
  
  zip.forEach((relativePath, zipEntry) => {
    if (zipEntry.dir) return;
    if (relativePath.toLowerCase().startsWith('__macos')) return;
    
    const ext = relativePath.toLowerCase().substring(relativePath.lastIndexOf('.'));
    if (imageExtensions.includes(ext)) {
      imageFiles.push({ path: relativePath, entry: zipEntry });
    }
  });
  
  imageFiles.sort((a, b) => a.path.localeCompare(b.path));
  
  if (imageFiles.length === 0) {
    throw new Error('No images found in CBZ');
  }
  
  // Process each image
  const processedPages = [];
  
  for (let i = 0; i < imageFiles.length; i++) {
    const imgFile = imageFiles[i];
    const imgBlob = await imgFile.entry.async('blob');
    
    // Process image and get output pages
    const pages = await processImage(imgBlob, i + 1, options);
    processedPages.push(...pages);
    
    // Report progress with preview
    if (pages.length > 0 && pages[0].canvas) {
      // Convert canvas to data URL for preview (no Blob needed)
      const previewUrl = pages[0].canvas.toDataURL('image/png');
      onProgress((i + 1) / imageFiles.length, previewUrl);
    } else {
      onProgress((i + 1) / imageFiles.length, null);
    }
  }
  
  // Sort pages by their output name
  processedPages.sort((a, b) => a.name.localeCompare(b.name));
  
  // Convert to XTC
  const xtcData = await buildXtc(processedPages);
  
  return {
    name: file.name.replace(/\.cbz$/i, '.xtc'),
    data: xtcData,
    size: xtcData.byteLength,
    pageCount: processedPages.length
  };
}

async function processImage(imgBlob, pageNum, options) {
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(imgBlob);
    
    img.onload = () => {
      URL.revokeObjectURL(objectUrl); // Clean up
      const pages = processLoadedImage(img, pageNum, options);
      resolve(pages);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl); // Clean up
      console.error(`Failed to load image for page ${pageNum}`);
      resolve([]);
    };
    img.src = objectUrl;
  });
}

function processLoadedImage(img, pageNum, options) {
  const results = [];
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  let width = img.width;
  let height = img.height;
  
  // Apply margin crop
  if (options.margin > 0) {
    const marginPx = {
      left: Math.floor(width * options.margin / 100),
      top: Math.floor(height * options.margin / 100),
      right: Math.floor(width * options.margin / 100),
      bottom: Math.floor(height * options.margin / 100)
    };
    
    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = width - marginPx.left - marginPx.right;
    croppedCanvas.height = height - marginPx.top - marginPx.bottom;
    const croppedCtx = croppedCanvas.getContext('2d');
    
    croppedCtx.drawImage(
      img,
      marginPx.left, marginPx.top,
      croppedCanvas.width, croppedCanvas.height,
      0, 0,
      croppedCanvas.width, croppedCanvas.height
    );
    
    width = croppedCanvas.width;
    height = croppedCanvas.height;
    
    // Replace img with cropped version
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(croppedCanvas, 0, 0);
  } else {
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(img, 0, 0);
  }
  
  // Apply contrast boost
  if (options.contrast > 0) {
    applyContrast(ctx, width, height, options.contrast);
  }
  
  // Convert to grayscale
  toGrayscale(ctx, width, height);
  
  // Determine if we should split
  const shouldSplit = width < height && options.splitMode !== 'nosplit';
  
  if (shouldSplit) {
    if (options.splitMode === 'overlap') {
      // Overlapping thirds
      const segments = calculateOverlapSegments(width, height);
      segments.forEach((seg, idx) => {
        const letter = String.fromCharCode(97 + idx); // a, b, c...
        const pageCanvas = extractAndRotate(canvas, seg.x, seg.y, seg.w, seg.h);
        const finalCanvas = resizeWithPadding(pageCanvas);
        applyDithering(finalCanvas.getContext('2d'), TARGET_WIDTH, TARGET_HEIGHT, options.dithering);
        
        results.push({
          name: `${String(pageNum).padStart(4, '0')}_3_${letter}.png`,
          canvas: finalCanvas
        });
      });
    } else {
      // Split in half
      const halfHeight = Math.floor(height / 2);
      
      // Top half
      const topCanvas = extractAndRotate(canvas, 0, 0, width, halfHeight);
      const topFinal = resizeWithPadding(topCanvas);
      applyDithering(topFinal.getContext('2d'), TARGET_WIDTH, TARGET_HEIGHT, options.dithering);
      results.push({
        name: `${String(pageNum).padStart(4, '0')}_2_a.png`,
        canvas: topFinal
      });
      
      // Bottom half
      const bottomCanvas = extractAndRotate(canvas, 0, halfHeight, width, halfHeight);
      const bottomFinal = resizeWithPadding(bottomCanvas);
      applyDithering(bottomFinal.getContext('2d'), TARGET_WIDTH, TARGET_HEIGHT, options.dithering);
      results.push({
        name: `${String(pageNum).padStart(4, '0')}_2_b.png`,
        canvas: bottomFinal
      });
    }
  } else {
    // Wide page or no-split mode - rotate and fit
    const rotatedCanvas = rotateCanvas(canvas, 90);
    const finalCanvas = resizeWithPadding(rotatedCanvas);
    applyDithering(finalCanvas.getContext('2d'), TARGET_WIDTH, TARGET_HEIGHT, options.dithering);
    
    results.push({
      name: `${String(pageNum).padStart(4, '0')}_0_spread.png`,
      canvas: finalCanvas
    });
  }
  
  return results;
}

// XTC file format generation
async function buildXtc(pages) {
  const xtgBlobs = pages.map(page => imageDataToXtg(page.canvas.getContext('2d').getImageData(0, 0, TARGET_WIDTH, TARGET_HEIGHT)));
  
  const pageCount = xtgBlobs.length;
  const headerSize = 48;
  const indexEntrySize = 16;
  const indexOffset = headerSize;
  const dataOffset = indexOffset + pageCount * indexEntrySize;
  
  // Calculate total size
  let totalSize = dataOffset;
  for (const blob of xtgBlobs) {
    totalSize += blob.byteLength;
  }
  
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const uint8 = new Uint8Array(buffer);
  
  // Write XTC header
  // <4sHHBBBBIQQQQ> little-endian
  uint8[0] = 0x58; // 'X'
  uint8[1] = 0x54; // 'T'
  uint8[2] = 0x43; // 'C'
  uint8[3] = 0x00;
  view.setUint16(4, 1, true); // version
  view.setUint16(6, pageCount, true); // pageCount
  view.setUint8(8, 0); // readDirection
  view.setUint8(9, 0); // hasMetadata
  view.setUint8(10, 0); // hasThumbnails
  view.setUint8(11, 0); // hasChapters
  view.setUint32(12, 0, true); // currentPage
  
  // 64-bit values
  setBigUint64(view, 16, 0n); // metadataOffset
  setBigUint64(view, 24, BigInt(indexOffset)); // indexOffset
  setBigUint64(view, 32, BigInt(dataOffset)); // dataOffset
  setBigUint64(view, 40, 0n); // thumbOffset
  
  // Write index table
  let relOffset = dataOffset;
  for (let i = 0; i < pageCount; i++) {
    const blob = xtgBlobs[i];
    const entryOffset = indexOffset + i * indexEntrySize;
    
    setBigUint64(view, entryOffset, BigInt(relOffset)); // offset
    view.setUint32(entryOffset + 8, blob.byteLength, true); // size
    view.setUint16(entryOffset + 12, TARGET_WIDTH, true); // width
    view.setUint16(entryOffset + 14, TARGET_HEIGHT, true); // height
    
    relOffset += blob.byteLength;
  }
  
  // Write page data
  let writeOffset = dataOffset;
  for (const blob of xtgBlobs) {
    uint8.set(new Uint8Array(blob), writeOffset);
    writeOffset += blob.byteLength;
  }
  
  return buffer;
}

function imageDataToXtg(imageData) {
  const w = imageData.width;
  const h = imageData.height;
  const data = imageData.data;
  
  const rowBytes = Math.ceil(w / 8);
  const pixelData = new Uint8Array(rowBytes * h);
  
  // Convert to 1-bit monochrome
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const bit = data[idx] >= 128 ? 1 : 0;
      const byteIndex = y * rowBytes + Math.floor(x / 8);
      const bitIndex = 7 - (x % 8); // MSB first
      if (bit) {
        pixelData[byteIndex] |= 1 << bitIndex;
      }
    }
  }
  
  // Calculate MD5 (simplified - just use first 8 bytes of a hash)
  const md5digest = new Uint8Array(8);
  for (let i = 0; i < Math.min(8, pixelData.length); i++) {
    md5digest[i] = pixelData[i];
  }
  
  // XTG header: <4sHHBBI8s>
  const headerSize = 4 + 2 + 2 + 1 + 1 + 4 + 8; // = 22 bytes
  const totalSize = headerSize + pixelData.length;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const uint8 = new Uint8Array(buffer);
  
  // Write header
  uint8[0] = 0x58; // 'X'
  uint8[1] = 0x54; // 'T'
  uint8[2] = 0x47; // 'G'
  uint8[3] = 0x00;
  view.setUint16(4, w, true); // width
  view.setUint16(6, h, true); // height
  view.setUint8(8, 0); // colorMode
  view.setUint8(9, 0); // compression
  view.setUint32(10, pixelData.length, true); // dataSize
  uint8.set(md5digest, 14); // md5 digest (8 bytes)
  
  // Write pixel data
  uint8.set(pixelData, headerSize);
  
  return buffer;
}

// Helper for 64-bit writes (DataView doesn't have setBigUint64 in all browsers)
function setBigUint64(view, offset, value) {
  const low = Number(value & 0xFFFFFFFFn);
  const high = Number(value >> 32n);
  view.setUint32(offset, low, true);
  view.setUint32(offset + 4, high, true);
}
