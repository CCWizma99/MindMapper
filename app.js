/**
 * MindMapper — App orchestration
 */
import { SUPABASE_CONFIG } from './supabaseConfig.js';

let renderer = null;
let supabaseClient = null;
const MAX_FILES = 10;
const MAX_BUCKET_SIZE = 50 * 1024 * 1024; // 50 MB

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
  const usageText = document.getElementById('usage-text');
  const usageFill = document.getElementById('usage-fill');

  // -- Init Supabase
  if (SUPABASE_CONFIG.url && SUPABASE_CONFIG.url !== 'https://your-project-url.supabase.co') {
    supabaseClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
  }

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
  // Community Panel (Supabase)
  // =========================================

  function checkSupabase() {
    if (!supabaseClient) {
      showToast('Please configure Supabase in supabaseConfig.js', 'error');
      return false;
    }
    return true;
  }

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
    if (checkSupabase()) communityFileInput.click();
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

    try {
      showToast('Uploading to community...', 'info');
      
      // 1. Check existing files for FIFO
      const { data: existingFiles, error: listError } = await supabaseClient.storage
        .from(SUPABASE_CONFIG.bucketName)
        .list('', { sortBy: { column: 'created_at', order: 'asc' } });

      if (listError) throw listError;

      // 2. FIFO Logic: If >= MAX_FILES, delete oldest
      if (existingFiles.length >= MAX_FILES) {
        const oldest = existingFiles[0];
        await supabaseClient.storage
          .from(SUPABASE_CONFIG.bucketName)
          .remove([oldest.name]);
      }

      // 3. Upload new file
      const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
      const { error: uploadError } = await supabaseClient.storage
        .from(SUPABASE_CONFIG.bucketName)
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      showToast(`"${file.name}" shared with community!`, 'success');
      loadCommunityFiles();
    } catch (err) {
      console.error(err);
      showToast('Upload failed: ' + err.message, 'error');
    }

    communityFileInput.value = '';
  });

  // Load community file list & usage stats
  async function loadCommunityFiles() {
    if (!checkSupabase()) return;

    try {
      const { data: files, error } = await supabaseClient.storage
        .from(SUPABASE_CONFIG.bucketName)
        .list('', { sortBy: { column: 'created_at', order: 'desc' } });

      if (error) throw error;

      // Update Usage Stats
      const totalSize = files.reduce((acc, f) => acc + (f.metadata?.size || 0), 0);
      updateUsageIndicator(totalSize);

      if (!files || files.length === 0) {
        communityList.innerHTML = '<div class="community-panel__empty">No files shared yet</div>';
        return;
      }

      communityList.innerHTML = files.map(f => `
        <div class="community-file" data-name="${f.name}" title="Click to view mind map">
          <div class="community-file__icon">📄</div>
          <div class="community-file__info">
            <div class="community-file__name">${escapeHtml(f.name.split('_').slice(1).join('_'))}</div>
            <div class="community-file__meta">${formatSize(f.metadata?.size || 0)} • ${formatTime(f.created_at)}</div>
          </div>
          <span class="community-file__arrow">→</span>
        </div>
      `).join('');

      communityList.querySelectorAll('.community-file').forEach(el => {
        el.addEventListener('click', () => {
          loadCommunityFile(el.dataset.name);
        });
      });
    } catch (err) {
      console.error(err);
      communityList.innerHTML = '<div class="community-panel__empty">Could not load files</div>';
    }
  }

  function updateUsageIndicator(sizeInBytes) {
    const sizeInMB = sizeInBytes / (1024 * 1024);
    const percent = Math.min((sizeInBytes / MAX_BUCKET_SIZE) * 100, 100);
    
    usageText.textContent = `${sizeInMB.toFixed(2)} / 50 MB (${percent.toFixed(1)}%)`;
    usageFill.style.width = percent + '%';
    
    if (percent > 90) usageFill.style.background = 'var(--accent-7)'; // Warning color
    else usageFill.style.background = 'linear-gradient(90deg, var(--accent-5), var(--accent-4))';
  }

  // Load a specific community file
  async function loadCommunityFile(name) {
    try {
      const { data, error } = await supabaseClient.storage
        .from(SUPABASE_CONFIG.bucketName)
        .download(name);

      if (error) throw error;

      const text = await data.text();
      const displayName = name.split('_').slice(1).join('_');
      
      filenameDisplay.textContent = displayName;
      filenameDisplay.classList.add('visible');

      renderFromText(text);
      communityPanel.classList.remove('open');
      showToast(`Loaded "${displayName}" from community`, 'success');
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
