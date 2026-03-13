const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// --- Config ---
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const MANIFEST_FILE = path.join(UPLOADS_DIR, 'manifest.json');
const MAX_FILES = 10;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR);
}

// Initialize manifest
function loadManifest() {
  if (fs.existsSync(MANIFEST_FILE)) {
    return JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf-8'));
  }
  return [];
}

function saveManifest(manifest) {
  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
}

// --- Multer setup ---
const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9.\-_& ]/g, '_');
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (!file.originalname.toLowerCase().endsWith('.rtf')) {
      return cb(new Error('Only .rtf files are accepted'));
    }
    cb(null, true);
  }
});

// --- Serve static files ---
app.use(express.static(__dirname, {
  index: 'index.html',
  extensions: ['html']
}));

// --- API: Upload RTF ---
app.post('/api/upload', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File too large. Maximum size is 5MB.' });
      }
      return res.status(400).json({ error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const manifest = loadManifest();

    // Add new entry
    const entry = {
      id: Date.now().toString(),
      originalName: req.file.originalname,
      filename: req.file.filename,
      size: req.file.size,
      uploadedAt: new Date().toISOString()
    };

    manifest.push(entry);

    // If over MAX_FILES, remove the oldest
    while (manifest.length > MAX_FILES) {
      const removed = manifest.shift();
      const removedPath = path.join(UPLOADS_DIR, removed.filename);
      if (fs.existsSync(removedPath)) {
        fs.unlinkSync(removedPath);
      }
    }

    saveManifest(manifest);

    res.json({ success: true, file: entry, totalFiles: manifest.length });
  });
});

// --- API: List community files ---
app.get('/api/files', (req, res) => {
  const manifest = loadManifest();
  // Return files without internal filename
  const files = manifest.map(f => ({
    id: f.id,
    name: f.originalName,
    size: f.size,
    uploadedAt: f.uploadedAt
  }));
  res.json(files);
});

// --- API: Serve a specific uploaded file ---
app.get('/api/files/:id', (req, res) => {
  const manifest = loadManifest();
  const entry = manifest.find(f => f.id === req.params.id);

  if (!entry) {
    return res.status(404).json({ error: 'File not found' });
  }

  const filePath = path.join(UPLOADS_DIR, entry.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found on disk' });
  }

  res.setHeader('Content-Type', 'text/rtf');
  res.setHeader('Content-Disposition', `inline; filename="${entry.originalName}"`);
  fs.createReadStream(filePath).pipe(res);
});

// --- Start ---
app.listen(PORT, () => {
  console.log(`\n  🧠 MindMapper server running at http://localhost:${PORT}\n`);
});
