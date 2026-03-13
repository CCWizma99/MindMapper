/**
 * MindMapper — App orchestration
 */

let renderer = null;

document.addEventListener('DOMContentLoaded', () => {
  const uploadScreen = document.getElementById('upload-screen');
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  const canvasContainer = document.getElementById('canvas-container');
  const filenameDisplay = document.getElementById('filename-display');

  const btnExpandAll = document.getElementById('btn-expand-all');
  const btnCollapseAll = document.getElementById('btn-collapse-all');
  const btnResetView = document.getElementById('btn-reset-view');
  const btnZoomIn = document.getElementById('btn-zoom-in');
  const btnZoomOut = document.getElementById('btn-zoom-out');
  const btnFitView = document.getElementById('btn-fit-view');
  const searchInput = document.getElementById('search-input');

  const statsNodes = document.getElementById('stats-nodes');
  const statsDepth = document.getElementById('stats-depth');

  // -- Init renderer
  renderer = new MindMapRenderer(canvasContainer);

  // -- File handling
  function handleFile(file) {
    if (!file || !file.name.toLowerCase().endsWith('.rtf')) {
      alert('Please select a valid .rtf file');
      return;
    }

    filenameDisplay.textContent = file.name;
    filenameDisplay.classList.add('visible');

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const tree = parseRTF(text);

      // Hide upload screen
      uploadScreen.classList.add('hidden');

      // Render minds map
      setTimeout(() => {
        renderer.render(tree);
        updateStats();
      }, 300);
    };
    reader.readAsText(file);
  }

  function updateStats() {
    const stats = renderer.getStats();
    statsNodes.textContent = stats.totalNodes;
    statsDepth.textContent = stats.maxDepth;
  }

  // -- Drop zone events
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
    const file = e.dataTransfer.files[0];
    handleFile(file);
  });

  fileInput.addEventListener('change', (e) => {
    handleFile(e.target.files[0]);
  });

  // -- Toolbar
  btnExpandAll.addEventListener('click', () => {
    renderer.expandAll();
    updateStats();
  });

  btnCollapseAll.addEventListener('click', () => {
    renderer.collapseAll();
    updateStats();
  });

  btnResetView.addEventListener('click', () => {
    renderer.resetView();
  });

  btnZoomIn.addEventListener('click', () => {
    renderer.zoomIn();
  });

  btnZoomOut.addEventListener('click', () => {
    renderer.zoomOut();
  });

  btnFitView.addEventListener('click', () => {
    renderer.resetView();
  });

  // -- Search
  let searchTimeout = null;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      renderer.search(e.target.value.trim());
      updateStats();
    }, 300);
  });

  // -- Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl+O or Cmd+O to open file
    if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
      e.preventDefault();
      fileInput.click();
    }
    // Ctrl+F or Cmd+F to focus search
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      searchInput.focus();
    }
    // Escape to clear search
    if (e.key === 'Escape') {
      searchInput.value = '';
      renderer.search('');
      searchInput.blur();
    }
  });
});
