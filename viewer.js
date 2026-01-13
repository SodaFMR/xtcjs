// Manga Viewer Module
const $ = (id) => document.getElementById(id);

let pages = [];
let currentIndex = 0;
let isRotated = false;

const viewerSection = $('viewer');
const viewerTrack = $('viewerTrack');
const thumbnailTrack = $('thumbnailTrack');
const pageIndicator = $('pageIndicator');
const prevBtn = $('viewerPrev');
const nextBtn = $('viewerNext');
const closeBtn = $('viewerClose');
const rotateBtn = $('viewerRotate');

// Event listeners
prevBtn.addEventListener('click', () => goToPage(currentIndex - 1));
nextBtn.addEventListener('click', () => goToPage(currentIndex + 1));
closeBtn.addEventListener('click', closeViewer);
rotateBtn.addEventListener('click', toggleRotate);

// Keyboard navigation
document.addEventListener('keydown', (e) => {
  if (viewerSection.classList.contains('hidden')) return;

  switch (e.key) {
    case 'ArrowLeft':
      goToPage(currentIndex - 1);
      break;
    case 'ArrowRight':
      goToPage(currentIndex + 1);
      break;
    case 'Escape':
      closeViewer();
      break;
    case 'r':
    case 'R':
      toggleRotate();
      break;
  }
});

function toggleRotate() {
  isRotated = !isRotated;
  viewerSection.classList.toggle('rotated', isRotated);
}

export function openViewer(pageImages) {
  pages = pageImages;
  currentIndex = 0;
  isRotated = false;
  viewerSection.classList.remove('rotated');

  // Build main view
  viewerTrack.innerHTML = pages.map((src, i) => `
    <div class="viewer-page" data-index="${i}">
      <img src="${src}" alt="Page ${i + 1}">
    </div>
  `).join('');

  // Build thumbnails
  thumbnailTrack.innerHTML = pages.map((src, i) => `
    <button class="thumbnail${i === 0 ? ' active' : ''}" data-index="${i}">
      <img src="${src}" alt="Page ${i + 1}">
    </button>
  `).join('');

  // Thumbnail click handlers
  thumbnailTrack.querySelectorAll('.thumbnail').forEach(thumb => {
    thumb.addEventListener('click', () => {
      goToPage(parseInt(thumb.dataset.index));
    });
  });

  viewerSection.classList.remove('hidden');
  updateView();

  // Scroll viewer into view
  viewerSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function closeViewer() {
  viewerSection.classList.add('hidden');
  viewerSection.classList.remove('rotated');
  pages = [];
  currentIndex = 0;
  isRotated = false;
}

function goToPage(index) {
  if (index < 0 || index >= pages.length) return;
  currentIndex = index;
  updateView();
}

function updateView() {
  // Update track position
  viewerTrack.style.transform = `translateX(-${currentIndex * 100}%)`;

  // Update page indicator
  pageIndicator.textContent = `${currentIndex + 1} / ${pages.length}`;

  // Update buttons
  prevBtn.disabled = currentIndex === 0;
  nextBtn.disabled = currentIndex === pages.length - 1;

  // Update thumbnails
  thumbnailTrack.querySelectorAll('.thumbnail').forEach((thumb, i) => {
    thumb.classList.toggle('active', i === currentIndex);
  });

  // Scroll active thumbnail into view
  const activeThumbnail = thumbnailTrack.querySelector('.thumbnail.active');
  if (activeThumbnail) {
    activeThumbnail.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }
}
