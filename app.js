// CBZ to XTC Converter - Browser-based conversion
import { applyDithering } from './dithering.js';
import { toGrayscale, applyContrast, calculateOverlapSegments } from './image-processing.js';
import { rotateCanvas, extractAndRotate, resizeWithPadding, TARGET_WIDTH, TARGET_HEIGHT } from './canvas-utils.js';
import { openViewer } from './viewer.js';

// State
let selectedFiles = [];
let results = [];

// DOM
const $ = (id) => document.getElementById(id);
const dropzone = $('dropzone');
const fileInput = $('fileInput');
const fileListSection = $('fileList');
const filesContainer = $('files');
const fileCount = $('fileCount');
const convertBtn = $('convertBtn');
const progressSection = $('progress');
const progressBar = $('progressBar');
const progressText = $('progressText');
const progressPercent = $('progressPercent');
const currentPage = $('currentPage');
const resultsSection = $('results');
const resultsList = $('resultsList');

// Options
const splitModeSelect = $('splitMode');
const ditheringSelect = $('dithering');
const contrastSelect = $('contrast');
const marginInput = $('margin');

// Event Listeners
dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fileInput.click();
  }
});
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
  fileCount.textContent = selectedFiles.length;

  filesContainer.innerHTML = selectedFiles.map((file, idx) => `
    <div class="file-item">
      <span class="name">${escapeHtml(file.name)}</span>
      <span class="size">${formatSize(file.size)}</span>
      <button class="remove" data-idx="${idx}" aria-label="Remove file">&times;</button>
    </div>
  `).join('');

  filesContainer.querySelectorAll('.remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.dataset.idx);
      selectedFiles.splice(idx, 1);
      updateFileList();
    });
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
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
  convertBtn.classList.add('loading');
  progressSection.classList.remove('hidden');
  progressSection.classList.add('processing');
  resultsSection.classList.add('hidden');
  results = [];

  for (let i = 0; i < selectedFiles.length; i++) {
    const file = selectedFiles[i];
    progressText.textContent = `${file.name}`;
    updateProgress(i / selectedFiles.length);

    try {
      const result = await convertCbzToXtc(file, options, (pageProgress, previewUrl) => {
        updateProgress((i + pageProgress) / selectedFiles.length);
        if (previewUrl) {
          currentPage.innerHTML = `<img src="${previewUrl}" alt="Preview">`;
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

  updateProgress(1);
  progressText.textContent = 'Complete';
  progressSection.classList.remove('processing');
  currentPage.innerHTML = '';
  convertBtn.disabled = false;
  convertBtn.classList.remove('loading');

  showResults();
}

function updateProgress(ratio) {
  const percent = Math.round(ratio * 100);
  progressBar.style.width = `${percent}%`;
  progressPercent.textContent = `${percent}%`;
}

function showResults() {
  resultsSection.classList.remove('hidden');
  resultsList.innerHTML = results.map((result, idx) => {
    if (result.error) {
      return `
        <div class="result-item error">
          <div>
            <span class="name">${escapeHtml(result.name)}</span>
            <div class="info">Error: ${escapeHtml(result.error)}</div>
          </div>
        </div>
      `;
    }
    return `
      <div class="result-item">
        <div>
          <span class="name">${escapeHtml(result.name)}</span>
          <div class="info">${result.pageCount} pages &middot; ${formatSize(result.size)}</div>
        </div>
        <div class="result-actions">
          <button class="btn-preview" data-idx="${idx}">Preview</button>
          <button class="btn-download" data-idx="${idx}">Download</button>
        </div>
      </div>
    `;
  }).join('');

  resultsList.querySelectorAll('.btn-download').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.dataset.idx);
      downloadResult(results[idx]);
    });
  });

  resultsList.querySelectorAll('.btn-preview').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.dataset.idx);
      if (results[idx].pageImages) {
        openViewer(results[idx].pageImages);
      }
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

// Conversion logic
async function convertCbzToXtc(file, options, onProgress) {
  const zip = await JSZip.loadAsync(file);

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

  const processedPages = [];

  for (let i = 0; i < imageFiles.length; i++) {
    const imgFile = imageFiles[i];
    const imgBlob = await imgFile.entry.async('blob');

    const pages = await processImage(imgBlob, i + 1, options);
    processedPages.push(...pages);

    if (pages.length > 0 && pages[0].canvas) {
      const previewUrl = pages[0].canvas.toDataURL('image/png');
      onProgress((i + 1) / imageFiles.length, previewUrl);
    } else {
      onProgress((i + 1) / imageFiles.length, null);
    }
  }

  processedPages.sort((a, b) => a.name.localeCompare(b.name));

  // Store page images for viewer
  const pageImages = processedPages.map(page => page.canvas.toDataURL('image/png'));

  const xtcData = await buildXtc(processedPages);

  return {
    name: file.name.replace(/\.cbz$/i, '.xtc'),
    data: xtcData,
    size: xtcData.byteLength,
    pageCount: processedPages.length,
    pageImages
  };
}

async function processImage(imgBlob, pageNum, options) {
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(imgBlob);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const pages = processLoadedImage(img, pageNum, options);
      resolve(pages);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
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

    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(croppedCanvas, 0, 0);
  } else {
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(img, 0, 0);
  }

  if (options.contrast > 0) {
    applyContrast(ctx, width, height, options.contrast);
  }

  toGrayscale(ctx, width, height);

  const shouldSplit = width < height && options.splitMode !== 'nosplit';

  if (shouldSplit) {
    if (options.splitMode === 'overlap') {
      const segments = calculateOverlapSegments(width, height);
      segments.forEach((seg, idx) => {
        const letter = String.fromCharCode(97 + idx);
        const pageCanvas = extractAndRotate(canvas, seg.x, seg.y, seg.w, seg.h);
        const finalCanvas = resizeWithPadding(pageCanvas);
        applyDithering(finalCanvas.getContext('2d'), TARGET_WIDTH, TARGET_HEIGHT, options.dithering);

        results.push({
          name: `${String(pageNum).padStart(4, '0')}_3_${letter}.png`,
          canvas: finalCanvas
        });
      });
    } else {
      const halfHeight = Math.floor(height / 2);

      const topCanvas = extractAndRotate(canvas, 0, 0, width, halfHeight);
      const topFinal = resizeWithPadding(topCanvas);
      applyDithering(topFinal.getContext('2d'), TARGET_WIDTH, TARGET_HEIGHT, options.dithering);
      results.push({
        name: `${String(pageNum).padStart(4, '0')}_2_a.png`,
        canvas: topFinal
      });

      const bottomCanvas = extractAndRotate(canvas, 0, halfHeight, width, halfHeight);
      const bottomFinal = resizeWithPadding(bottomCanvas);
      applyDithering(bottomFinal.getContext('2d'), TARGET_WIDTH, TARGET_HEIGHT, options.dithering);
      results.push({
        name: `${String(pageNum).padStart(4, '0')}_2_b.png`,
        canvas: bottomFinal
      });
    }
  } else {
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

// XTC format generation
async function buildXtc(pages) {
  const xtgBlobs = pages.map(page =>
    imageDataToXtg(page.canvas.getContext('2d').getImageData(0, 0, TARGET_WIDTH, TARGET_HEIGHT))
  );

  const pageCount = xtgBlobs.length;
  const headerSize = 48;
  const indexEntrySize = 16;
  const indexOffset = headerSize;
  const dataOffset = indexOffset + pageCount * indexEntrySize;

  let totalSize = dataOffset;
  for (const blob of xtgBlobs) {
    totalSize += blob.byteLength;
  }

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const uint8 = new Uint8Array(buffer);

  uint8[0] = 0x58; uint8[1] = 0x54; uint8[2] = 0x43; uint8[3] = 0x00;
  view.setUint16(4, 1, true);
  view.setUint16(6, pageCount, true);
  view.setUint8(8, 0);
  view.setUint8(9, 0);
  view.setUint8(10, 0);
  view.setUint8(11, 0);
  view.setUint32(12, 0, true);

  setBigUint64(view, 16, 0n);
  setBigUint64(view, 24, BigInt(indexOffset));
  setBigUint64(view, 32, BigInt(dataOffset));
  setBigUint64(view, 40, 0n);

  let relOffset = dataOffset;
  for (let i = 0; i < pageCount; i++) {
    const blob = xtgBlobs[i];
    const entryOffset = indexOffset + i * indexEntrySize;

    setBigUint64(view, entryOffset, BigInt(relOffset));
    view.setUint32(entryOffset + 8, blob.byteLength, true);
    view.setUint16(entryOffset + 12, TARGET_WIDTH, true);
    view.setUint16(entryOffset + 14, TARGET_HEIGHT, true);

    relOffset += blob.byteLength;
  }

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

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const bit = data[idx] >= 128 ? 1 : 0;
      const byteIndex = y * rowBytes + Math.floor(x / 8);
      const bitIndex = 7 - (x % 8);
      if (bit) {
        pixelData[byteIndex] |= 1 << bitIndex;
      }
    }
  }

  const md5digest = new Uint8Array(8);
  for (let i = 0; i < Math.min(8, pixelData.length); i++) {
    md5digest[i] = pixelData[i];
  }

  const headerSize = 22;
  const totalSize = headerSize + pixelData.length;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const uint8 = new Uint8Array(buffer);

  uint8[0] = 0x58; uint8[1] = 0x54; uint8[2] = 0x47; uint8[3] = 0x00;
  view.setUint16(4, w, true);
  view.setUint16(6, h, true);
  view.setUint8(8, 0);
  view.setUint8(9, 0);
  view.setUint32(10, pixelData.length, true);
  uint8.set(md5digest, 14);

  uint8.set(pixelData, headerSize);

  return buffer;
}

function setBigUint64(view, offset, value) {
  const low = Number(value & 0xFFFFFFFFn);
  const high = Number(value >> 32n);
  view.setUint32(offset, low, true);
  view.setUint32(offset + 4, high, true);
}
