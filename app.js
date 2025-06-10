const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const mime = require('mime-types');
const archiver = require('archiver');

const app = express();
const PORT = process.env.PORT || 3000;

// Admin credentials from environment variables
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, 'uploads');
fs.ensureDirSync(UPLOADS_DIR);

// Middleware - Remove size limits
app.use(express.json({ limit: '50gb' }));
app.use(express.urlencoded({ extended: true, limit: '50gb' }));
app.use(express.static('public'));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'file-manager-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // Set to true if using HTTPS
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Multer configuration for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        let uploadPath = req.body.currentPath ?
            path.join(UPLOADS_DIR, req.body.currentPath) : UPLOADS_DIR;
        
        // Handle folder structure preservation with parent folder creation
        if (req.body.preserveStructure === 'true' && file.originalname) {
            const relativePaths = req.body.relativePaths;
            const fileIndex = req.files ? req.files.indexOf(file) : 0;
            
            if (Array.isArray(relativePaths) && relativePaths[fileIndex]) {
                const relativePath = relativePaths[fileIndex];
                // Use the full relative path including parent folder
                const dirPath = path.dirname(relativePath);
                if (dirPath && dirPath !== '.') {
                    uploadPath = path.join(uploadPath, dirPath);
                }
            } else if (typeof relativePaths === 'string' && fileIndex === 0) {
                const dirPath = path.dirname(relativePaths);
                if (dirPath && dirPath !== '.') {
                    uploadPath = path.join(uploadPath, dirPath);
                }
            }
        }
        
        fs.ensureDirSync(uploadPath);
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: Infinity, // No file size limit
        fieldSize: Infinity, // No field size limit
        fields: Infinity, // No field count limit
        files: Infinity // No file count limit
    },
    fileFilter: function (req, file, cb) {
        // Allow all file types
        cb(null, true);
    }
});

// Authentication middleware
const requireAuth = (req, res, next) => {
    if (req.session.authenticated) {
        next();
    } else {
        res.status(401).json({ error: 'Authentication required' });
    }
};

// Utility function to get safe path
const getSafePath = (requestedPath) => {
    if (!requestedPath || requestedPath === '/') {
        return UPLOADS_DIR;
    }
    const safePath = path.join(UPLOADS_DIR, requestedPath);
    // Prevent path traversal attacks
    if (!safePath.startsWith(UPLOADS_DIR)) {
        throw new Error('Invalid path');
    }
    return safePath;
};

// Routes

// Login page
app.get('/login', (req, res) => {
    if (req.session.authenticated) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Login API
app.post('/api/login', (req, res) => {
    const { username, password, rememberMe } = req.body;
    
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        req.session.authenticated = true;
        req.session.username = username;
        
        // Set session duration based on remember me
        if (rememberMe) {
            // 30 days in milliseconds
            req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
        } else {
            // Default session duration (until browser closes)
            req.session.cookie.maxAge = null;
        }
        
        res.json({ success: true });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

// Logout API
app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Could not log out' });
        }
        res.json({ success: true });
    });
});

// Check authentication status
app.get('/api/auth-status', (req, res) => {
    res.json({ authenticated: !!req.session.authenticated });
});

// Main page - redirect to login if not authenticated
app.get('/', (req, res) => {
    if (!req.session.authenticated) {
        return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Get files and folders
app.get('/api/files', requireAuth, (req, res) => {
    try {
        const requestedPath = req.query.path || '';
        const fullPath = getSafePath(requestedPath);
        
        if (!fs.existsSync(fullPath)) {
            return res.status(404).json({ error: 'Directory not found' });
        }
        
        const items = fs.readdirSync(fullPath).map(item => {
            const itemPath = path.join(fullPath, item);
            const stats = fs.statSync(itemPath);
            const relativePath = path.relative(UPLOADS_DIR, itemPath);
            
            return {
                name: item,
                path: relativePath.replace(/\\/g, '/'), // Normalize path separators
                isDirectory: stats.isDirectory(),
                size: stats.size,
                modified: stats.mtime,
                extension: path.extname(item).toLowerCase()
            };
        });
        
        // Sort: directories first, then files
        items.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
        });
        
        res.json({
            currentPath: requestedPath,
            items: items
        });
    } catch (error) {
        console.error('Error reading directory:', error);
        res.status(500).json({ error: 'Failed to read directory' });
    }
});

// Upload files
app.post('/api/upload', requireAuth, upload.array('files'), (req, res) => {
    try {
        const uploadedFiles = req.files.map(file => ({
            name: file.originalname,
            size: file.size,
            path: path.relative(UPLOADS_DIR, file.path).replace(/\\/g, '/')
        }));
        
        res.json({ 
            success: true, 
            files: uploadedFiles 
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Upload failed' });
    }
});

// Download file
app.get('/api/download/*', requireAuth, (req, res) => {
    try {
        const filePath = req.params[0];
        const fullPath = getSafePath(filePath);
        
        if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        const filename = path.basename(fullPath);
        res.download(fullPath, filename);
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: 'Download failed' });
    }
});

// Get file content for editing
app.get('/api/file-content/*', requireAuth, (req, res) => {
    try {
        const filePath = req.params[0];
        const fullPath = getSafePath(filePath);
        
        if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        // Check if file is text-based
        const mimeType = mime.lookup(fullPath);
        const isTextFile = mimeType && (
            mimeType.startsWith('text/') || 
            mimeType.includes('json') ||
            mimeType.includes('xml') ||
            mimeType.includes('javascript')
        );
        
        if (!isTextFile) {
            return res.status(400).json({ error: 'File is not editable' });
        }
        
        const content = fs.readFileSync(fullPath, 'utf8');
        res.json({ content: content });
    } catch (error) {
        console.error('Error reading file:', error);
        res.status(500).json({ error: 'Failed to read file' });
    }
});

// Save file content
app.post('/api/save-file/*', requireAuth, (req, res) => {
    try {
        const filePath = req.params[0];
        const fullPath = getSafePath(filePath);
        const { content } = req.body;
        
        fs.writeFileSync(fullPath, content, 'utf8');
        res.json({ success: true });
    } catch (error) {
        console.error('Error saving file:', error);
        res.status(500).json({ error: 'Failed to save file' });
    }
});

// Delete file or folder
app.delete('/api/delete/*', requireAuth, (req, res) => {
    try {
        const itemPath = req.params[0];
        const fullPath = getSafePath(itemPath);
        
        if (!fs.existsSync(fullPath)) {
            return res.status(404).json({ error: 'File or folder not found' });
        }
        
        fs.removeSync(fullPath);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ error: 'Failed to delete item' });
    }
});

// Create folder
app.post('/api/create-folder', requireAuth, (req, res) => {
    try {
        const { name, currentPath } = req.body;
        const folderPath = currentPath ?
            path.join(currentPath, name) : name;
        const fullPath = getSafePath(folderPath);
        
        if (fs.existsSync(fullPath)) {
            return res.status(400).json({ error: 'Folder already exists' });
        }
        
        fs.ensureDirSync(fullPath);
        res.json({ success: true });
    } catch (error) {
        console.error('Create folder error:', error);
        res.status(500).json({ error: 'Failed to create folder' });
    }
});

// Download multiple files as ZIP
app.post('/api/download-zip', requireAuth, (req, res) => {
    try {
        const { files } = req.body;
        
        if (!files || files.length === 0) {
            return res.status(400).json({ error: 'No files specified' });
        }
        
        // Set response headers for ZIP download
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="selected-files-${Date.now()}.zip"`);
        
        // Create archiver instance
        const archive = archiver('zip', {
            zlib: { level: 9 } // Maximum compression
        });
        
        // Pipe archive to response
        archive.pipe(res);
        
        // Add files to archive
        files.forEach(filePath => {
            try {
                const fullPath = getSafePath(filePath);
                
                if (fs.existsSync(fullPath)) {
                    const stats = fs.statSync(fullPath);
                    if (stats.isFile()) {
                        const fileName = path.basename(fullPath);
                        archive.file(fullPath, { name: fileName });
                    }
                }
            } catch (error) {
                console.error(`Error adding file ${filePath} to archive:`, error);
            }
        });
        
        // Handle archive events
        archive.on('error', (err) => {
            console.error('Archive error:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Failed to create archive' });
            }
        });
        
        archive.on('end', () => {
            console.log('Archive finalized');
        });
        
        // Finalize archive
        archive.finalize();
        
    } catch (error) {
        console.error('ZIP download error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to create ZIP file' });
        }
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large' });
        }
    }
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
    console.log(`File Manager running on http://${HOST}:${PORT}`);
    console.log(`Admin credentials: ${ADMIN_USERNAME}/${ADMIN_PASSWORD}`);
    console.log('Server is accessible from all network interfaces');
});