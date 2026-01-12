// Canvas utility functions for rotation and resizing

// Target dimensions for XTEink X4
const TARGET_WIDTH = 480;
const TARGET_HEIGHT = 800;

/**
 * Rotate canvas by specified degrees
 * @param {HTMLCanvasElement} canvas - Source canvas
 * @param {number} degrees - Rotation angle (90, -90, 180, etc.)
 * @returns {HTMLCanvasElement} Rotated canvas
 */
export function rotateCanvas(canvas, degrees) {
  const rotated = document.createElement('canvas');

  if (degrees === -90 || degrees === 90) {
    rotated.width = canvas.height;
    rotated.height = canvas.width;
  } else {
    rotated.width = canvas.width;
    rotated.height = canvas.height;
  }

  const ctx = rotated.getContext('2d');
  ctx.translate(rotated.width / 2, rotated.height / 2);
  ctx.rotate(degrees * Math.PI / 180);
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);

  return rotated;
}

/**
 * Extract a region from canvas and rotate it
 * @param {HTMLCanvasElement} srcCanvas - Source canvas
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {number} w - Width
 * @param {number} h - Height
 * @returns {HTMLCanvasElement} Extracted and rotated canvas
 */
export function extractAndRotate(srcCanvas, x, y, w, h) {
  const extractCanvas = document.createElement('canvas');
  extractCanvas.width = w;
  extractCanvas.height = h;
  const ctx = extractCanvas.getContext('2d');
  ctx.drawImage(srcCanvas, x, y, w, h, 0, 0, w, h);

  return rotateCanvas(extractCanvas, 90);
}

/**
 * Resize canvas with padding to fit target dimensions
 * @param {HTMLCanvasElement} canvas - Source canvas
 * @param {number} padColor - Padding color (0-255, default white)
 * @returns {HTMLCanvasElement} Resized canvas with padding
 */
export function resizeWithPadding(canvas, padColor = 255) {
  const result = document.createElement('canvas');
  result.width = TARGET_WIDTH;
  result.height = TARGET_HEIGHT;
  const ctx = result.getContext('2d');

  // Fill with padding color (white by default)
  ctx.fillStyle = `rgb(${padColor}, ${padColor}, ${padColor})`;
  ctx.fillRect(0, 0, TARGET_WIDTH, TARGET_HEIGHT);

  // Calculate scale to fit
  const scale = Math.min(TARGET_WIDTH / canvas.width, TARGET_HEIGHT / canvas.height);
  const newWidth = Math.floor(canvas.width * scale);
  const newHeight = Math.floor(canvas.height * scale);

  // Center the image
  const x = Math.floor((TARGET_WIDTH - newWidth) / 2);
  const y = Math.floor((TARGET_HEIGHT - newHeight) / 2);

  ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, x, y, newWidth, newHeight);

  return result;
}

// Export constants
export { TARGET_WIDTH, TARGET_HEIGHT };
