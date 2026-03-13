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

  // Community panel elements
  const btnCommunity = document.getElementById('btn-community');
  const communityPanel = document.getElementById('community-panel');
  const communityClose = document.getElementById('community-close');
  const communityList = document.getElementById('community-list');
  const btnShareUpload = document.getElementById('btn-share-upload');
  const communityFileInput = document.getElementById('community-file-input');
  const toastEl = document.getElementById('toast');

  // -- Init renderer
  renderer = new MindMapRenderer(canvasContainer);

  // =========================================
  // File handling (local)
  // =========================================
  function handleFile(file) {
    if (!file || !file.name.toLowerCase().endsWith('.rtf')) {
      showToast('Please select a valid .rtf file', 'error');
      return;
    }

    filenameDisplay.textContent = file.name;
    filenameDisplay.classList.add('visible');

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      renderFromText(text);
    };
    reader.readAsText(file);
  }

  function renderFromText(text) {
    const tree = parseRTF(text);
    uploadScreen.classList.add('hidden');
    setTimeout(() => {
      renderer.render(tree);
      updateStats();
    }, 300);
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
    if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
      e.preventDefault();
      fileInput.click();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      searchInput.focus();
    }
    if (e.key === 'Escape') {
      searchInput.value = '';
      renderer.search('');
      searchInput.blur();
      communityPanel.classList.remove('open');
    }
  });

  // =========================================
  // Community Panel
  // =========================================

  // Toggle panel
  btnCommunity.addEventListener('click', () => {
    communityPanel.classList.toggle('open');
    if (communityPanel.classList.contains('open')) {
      loadCommunityFiles();
    }
  });

  communityClose.addEventListener('click', () => {
    communityPanel.classList.remove('open');
  });

  // Share upload button
  btnShareUpload.addEventListener('click', () => {
    communityFileInput.click();
  });

  communityFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.rtf')) {
      showToast('Only .rtf files are accepted', 'error');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast('File too large. Maximum size is 5MB.', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || 'Upload failed', 'error');
        return;
      }

      showToast(`"${file.name}" shared with community! (${data.totalFiles}/10)`, 'success');
      loadCommunityFiles();
    } catch (err) {
      showToast('Upload failed. Is the server running?', 'error');
    }

    // Reset the input
    communityFileInput.value = '';
  });

  // Load community file list
  async function loadCommunityFiles() {
    try {
      const res = await fetch('/api/files');
      const files = await res.json();

      if (files.length === 0) {
        communityList.innerHTML = '<div class="community-panel__empty">No files shared yet</div>';
        return;
      }

      communityList.innerHTML = files
        .slice()
        .reverse() // newest first
        .map(f => `
          <div class="community-file" data-id="${f.id}" title="Click to view as mind map">
            <div class="community-file__icon">📄</div>
            <div class="community-file__info">
              <div class="community-file__name">${escapeHtml(f.name)}</div>
              <div class="community-file__meta">${formatSize(f.size)} • ${formatTime(f.uploadedAt)}</div>
            </div>
            <span class="community-file__arrow">→</span>
          </div>
        `).join('');

      // Add click handlers
      communityList.querySelectorAll('.community-file').forEach(el => {
        el.addEventListener('click', () => {
          loadCommunityFile(el.dataset.id, el.querySelector('.community-file__name').textContent);
        });
      });
    } catch (err) {
      communityList.innerHTML = '<div class="community-panel__empty">Could not load files</div>';
    }
  }

  // Load a specific community file
  async function loadCommunityFile(id, name) {
    try {
      const res = await fetch(`/api/files/${id}`);
      if (!res.ok) throw new Error('File not found');

      const text = await res.text();

      filenameDisplay.textContent = name;
      filenameDisplay.classList.add('visible');

      renderFromText(text);
      communityPanel.classList.remove('open');
      showToast(`Loaded "${name}" from community`, 'success');
    } catch (err) {
      showToast('Failed to load file', 'error');
    }
  }

  // =========================================
  // Helpers
  // =========================================

  function showToast(message, type) {
    toastEl.textContent = message;
    toastEl.className = 'toast visible ' + (type || '');
    clearTimeout(toastEl._timeout);
    toastEl._timeout = setTimeout(() => {
      toastEl.classList.remove('visible');
    }, 3000);
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function formatTime(isoString) {
    const d = new Date(isoString);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return diffMin + 'm ago';
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return diffHr + 'h ago';
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return diffDay + 'd ago';
    return d.toLocaleDateString();
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
});
