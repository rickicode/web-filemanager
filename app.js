// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const mime = require('mime-types');
const archiver = require('archiver');
const { createServer } = require('http');
const { Server } = require('socket.io');

const app = express();
const server = createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

// Admin credentials from environment variables
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Authentication toggle from environment variables
const AUTH_ENABLED = process.env.AUTH !== 'false';

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, 'uploads');
fs.ensureDirSync(UPLOADS_DIR);

// Middleware - Remove size limits
app.use(express.json({ limit: '50gb' }));
app.use(express.urlencoded({ extended: true, limit: '50gb' }));
app.use(express.static('public'));

// Session configuration with file store
const FileStore = require('session-file-store')(session);

// Create sessions directory
const sessionsDir = path.join(__dirname, 'sessions');
fs.ensureDirSync(sessionsDir);

const sessionConfig = {
    secret: process.env.SESSION_SECRET || 'file-manager-secret-key',
    resave: false,
    saveUninitialized: false,
    store: new FileStore({
        path: sessionsDir,
        ttl: 24 * 60 * 60, // 24 hours in seconds
        retries: 3,
        factor: 2,
        minTimeout: 1000,
        maxTimeout: 60000,
        reapInterval: 60 * 60, // Clean up expired sessions every hour (in seconds)
        logFn: () => {} // Disable logging
    }),
    cookie: {
        secure: false, // Set to true if using HTTPS
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
};

console.log('Using file-based session store for production-ready session management');
app.use(session(sessionConfig));

// Multer configuration for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Use default uploads directory, files will be moved to correct location in the route
        let uploadPath = UPLOADS_DIR;
        
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
    if (!AUTH_ENABLED || req.session.authenticated) {
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
    if (!AUTH_ENABLED) {
        return res.redirect('/');
    }
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
    res.json({
        authenticated: !AUTH_ENABLED || !!req.session.authenticated,
        authEnabled: AUTH_ENABLED
    });
});

// Main page - redirect to login if not authenticated
app.get('/', (req, res) => {
    if (AUTH_ENABLED && !req.session.authenticated) {
        return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Realtime Editor page - default room
app.get('/editor', (req, res) => {
    if (AUTH_ENABLED && !req.session.authenticated) {
        return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, 'public', 'editor.html'));
});

// Realtime Editor page - specific room (numbers only)
app.get('/editor/:roomId', (req, res) => {
    if (AUTH_ENABLED && !req.session.authenticated) {
        return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, 'public', 'editor.html'));
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
app.post('/api/upload', requireAuth, upload.array('files'), async (req, res) => {
    try {
        const currentPath = req.body.currentPath || '';
        const preserveStructure = req.body.preserveStructure === 'true';
        const relativePaths = req.body.relativePaths;
        
        // Determine target directory
        const targetDir = currentPath ?
            path.join(UPLOADS_DIR, currentPath) : UPLOADS_DIR;
        
        // Ensure target directory exists
        fs.ensureDirSync(targetDir);
        
        const uploadedFiles = [];
        
        for (let i = 0; i < req.files.length; i++) {
            const file = req.files[i];
            let finalPath = targetDir;
            let finalFilename = file.originalname;
            
            // Handle folder structure preservation
            if (preserveStructure && relativePaths) {
                const relativePath = Array.isArray(relativePaths) ?
                    relativePaths[i] : relativePaths;
                
                if (relativePath) {
                    const dirPath = path.dirname(relativePath);
                    if (dirPath && dirPath !== '.') {
                        finalPath = path.join(targetDir, dirPath);
                        fs.ensureDirSync(finalPath);
                    }
                    finalFilename = path.basename(relativePath);
                }
            }
            
            const finalFilePath = path.join(finalPath, finalFilename);
            
            // Move file from temporary location to final location only if different
            if (file.path !== finalFilePath) {
                await fs.move(file.path, finalFilePath, { overwrite: true });
            }
            
            uploadedFiles.push({
                name: finalFilename,
                size: file.size,
                path: path.relative(UPLOADS_DIR, finalFilePath).replace(/\\/g, '/')
            });
        }
        
        res.json({
            success: true,
            files: uploadedFiles
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Upload failed: ' + error.message });
    }
});

// Download file
app.get('/api/download/:path(*)', requireAuth, (req, res) => {
    try {
        const filePath = req.params.path;
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
app.get('/api/file-content/:path(*)', requireAuth, (req, res) => {
    try {
        const filePath = req.params.path;
        const fullPath = getSafePath(filePath);
        
        if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
            return res.status(404).json({ error: 'File not found' });
        }
        
        // Check if file is text-based using comprehensive extension list
        const fileExt = path.extname(fullPath).toLowerCase();
        const editableExtensions = [
            // Text files
            '.txt', '.md', '.markdown', '.rst', '.asciidoc',
            
            // Code files - Web
            '.html', '.htm', '.css', '.scss', '.sass', '.less',
            '.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte',
            
            // Code files - Backend
            '.php', '.py', '.rb', '.go', '.rs', '.java', '.kt',
            '.cs', '.vb', '.cpp', '.c', '.h', '.hpp',
            '.swift', '.m', '.mm', '.scala', '.clj', '.hs',
            
            // Shell and scripts
            '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd',
            
            // Data and config files
            '.json', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf',
            '.xml', '.csv', '.tsv', '.properties', '.env',
            
            // SQL and database
            '.sql', '.sqlite', '.db',
            
            // Documentation and markup
            '.tex', '.latex', '.org', '.wiki', '.mediawiki',
            
            // Log files
            '.log', '.logs',
            
            // Other text-based formats
            '.gitignore', '.gitattributes', '.editorconfig',
            '.dockerignore', '.eslintrc', '.prettierrc',
            '.babelrc', '.nvmrc', '.npmrc', '.yarnrc'
        ];
        
        // Also fallback to MIME type check for additional coverage
        const mimeType = mime.lookup(fullPath);
        const isMimeTextBased = mimeType && (
            mimeType.startsWith('text/') ||
            mimeType.includes('json') ||
            mimeType.includes('xml') ||
            mimeType.includes('javascript')
        );
        
        const isTextFile = editableExtensions.includes(fileExt) || isMimeTextBased;
        
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
app.post('/api/save-file/:path(*)', requireAuth, (req, res) => {
    try {
        const filePath = req.params.path;
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
app.delete('/api/delete/:path(*)', requireAuth, (req, res) => {
    try {
        const itemPath = req.params.path;
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

// Save editor content to file
app.post('/api/save-editor-file', requireAuth, (req, res) => {
    try {
        const { filename, content, roomId } = req.body;
        
        if (!filename || filename.trim() === '') {
            return res.status(400).json({ error: 'Filename is required' });
        }
        
        const cleanFilename = filename.trim();
        
        // Prevent dangerous file names
        if (cleanFilename.includes('..') || cleanFilename.includes('/') || cleanFilename.includes('\\')) {
            return res.status(400).json({ error: 'Invalid filename: cannot contain path separators or parent directory references' });
        }
        
        // Create Saved directory if it doesn't exist for manual saves
        const savedDir = path.join(UPLOADS_DIR, 'Saved');
        fs.ensureDirSync(savedDir);
        
        // Create filename with room info if not default room
        let finalFilename = cleanFilename;
        if (roomId && roomId !== 'default') {
            const ext = path.extname(cleanFilename);
            const nameWithoutExt = path.basename(cleanFilename, ext);
            finalFilename = `${nameWithoutExt}_room-${roomId}${ext}`;
        }
        
        const fullPath = path.join(savedDir, finalFilename);
        
        // Check if file already exists and add number suffix if needed
        let counter = 1;
        let actualFilename = finalFilename;
        let actualFullPath = fullPath;
        
        while (fs.existsSync(actualFullPath)) {
            const ext = path.extname(finalFilename);
            const nameWithoutExt = path.basename(finalFilename, ext);
            actualFilename = `${nameWithoutExt}_${counter}${ext}`;
            actualFullPath = path.join(savedDir, actualFilename);
            counter++;
        }
        
        // Save the file
        fs.writeFileSync(actualFullPath, content || '', 'utf8');
        
        console.log(`Editor content saved to: ${actualFullPath}`);
        
        res.json({
            success: true,
            filename: actualFilename,
            path: path.relative(UPLOADS_DIR, actualFullPath).replace(/\\/g, '/'),
            size: Buffer.byteLength(content || '', 'utf8')
        });
    } catch (error) {
        console.error('Save editor file error:', error);
        res.status(500).json({ error: 'Failed to save file' });
    }
});

// Create new file
app.post('/api/create-file', requireAuth, (req, res) => {
    try {
        const { name, currentPath, content = '' } = req.body;
        
        if (!name || name.trim() === '') {
            return res.status(400).json({ error: 'File name is required' });
        }
        
        const fileName = name.trim();
        
        // Prevent dangerous file names
        if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
            return res.status(400).json({ error: 'Invalid file name: cannot contain path separators or parent directory references' });
        }
        
        const filePath = currentPath ?
            path.join(currentPath, fileName) : fileName;
        const fullPath = getSafePath(filePath);
        
        if (fs.existsSync(fullPath)) {
            return res.status(400).json({ error: 'File already exists' });
        }
        
        // Ensure parent directory exists
        const parentDir = path.dirname(fullPath);
        fs.ensureDirSync(parentDir);
        
        // Create the file with initial content
        fs.writeFileSync(fullPath, content, 'utf8');
        
        res.json({
            success: true,
            file: {
                name: fileName,
                path: path.relative(UPLOADS_DIR, fullPath).replace(/\\/g, '/'),
                size: Buffer.byteLength(content, 'utf8')
            }
        });
    } catch (error) {
        console.error('Create file error:', error);
        res.status(500).json({ error: 'Failed to create file' });
    }
});

// Rename file or folder
app.post('/api/rename/:path(*)', requireAuth, (req, res) => {
    try {
        const itemPath = req.params.path;
        const { newName } = req.body;
        
        if (!newName || newName.trim() === '') {
            return res.status(400).json({ error: 'New name is required' });
        }
        
        const oldFullPath = getSafePath(itemPath);
        const parentDir = path.dirname(oldFullPath);
        const newFullPath = path.join(parentDir, newName.trim());
        
        if (!fs.existsSync(oldFullPath)) {
            return res.status(404).json({ error: 'File or folder not found' });
        }
        
        if (fs.existsSync(newFullPath)) {
            return res.status(400).json({ error: 'A file or folder with that name already exists' });
        }
        
        // Prevent renaming to dangerous paths
        if (newName.includes('..') || newName.includes('/') || newName.includes('\\')) {
            return res.status(400).json({ error: 'Invalid name: cannot contain path separators or parent directory references' });
        }
        
        fs.renameSync(oldFullPath, newFullPath);
        res.json({ success: true });
    } catch (error) {
        console.error('Rename error:', error);
        res.status(500).json({ error: 'Failed to rename item' });
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

// Realtime editor storage - support multiple rooms
const editorRooms = new Map(); // roomId -> { content: '', users: Set() }

// Ensure Editor directory exists
const EDITOR_DIR = path.join(UPLOADS_DIR, 'Editor');
fs.ensureDirSync(EDITOR_DIR);

// Function to auto-save editor content to file
function autoSaveEditorContent(roomId, content) {
    try {
        // Determine filename based on room
        let filename;
        if (!roomId || roomId === 'default') {
            filename = 'default.txt';
        } else {
            filename = `${roomId}.txt`;
        }
        
        const filePath = path.join(EDITOR_DIR, filename);
        
        // Save content to file
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Auto-saved editor content to: ${filePath}`);
        
    } catch (error) {
        console.error('Auto-save error:', error);
    }
}

// Function to load editor content from file
function loadEditorContent(roomId) {
    try {
        // Determine filename based on room
        let filename;
        if (!roomId || roomId === 'default') {
            filename = 'default.txt';
        } else {
            filename = `${roomId}.txt`;
        }
        
        const filePath = path.join(EDITOR_DIR, filename);
        
        // Load content from file if exists
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8');
            console.log(`Loaded editor content from: ${filePath}`);
            return content;
        }
        
        return ''; // Return empty string if file doesn't exist
        
    } catch (error) {
        console.error('Load content error:', error);
        return '';
    }
}

// WebSocket handling with room support
io.on('connection', (socket) => {
    let currentRoom = null;
    
    // Handle joining a room
    socket.on('joinRoom', (roomId) => {
        // Leave previous room if any
        if (currentRoom) {
            leaveRoom(socket, currentRoom);
        }
        
        // Normalize room ID (default to 'default' if empty)
        roomId = roomId || 'default';
        currentRoom = roomId;
        
        // Initialize room if doesn't exist
        if (!editorRooms.has(roomId)) {
            // Load existing content from file
            const savedContent = loadEditorContent(roomId);
            editorRooms.set(roomId, {
                content: savedContent,
                users: new Set()
            });
        }
        
        const room = editorRooms.get(roomId);
        room.users.add(socket.id);
        
        // Join socket.io room
        socket.join(roomId);
        
        console.log(`User ${socket.id} joined room: ${roomId}. Room users: ${room.users.size}`);
        
        // Send current content to new user
        socket.emit('initialContent', room.content);
        
        // Update user count for users in this room
        io.to(roomId).emit('userCountUpdate', room.users.size);
        socket.emit('roomInfo', { roomId: roomId });
    });
    
    // Handle text changes
    socket.on('textChange', (data) => {
        if (currentRoom && editorRooms.has(currentRoom)) {
            const room = editorRooms.get(currentRoom);
            room.content = data.content;
            
            // Auto-save content to file
            autoSaveEditorContent(currentRoom, data.content);
            
            // Broadcast to all other users in the same room
            socket.to(currentRoom).emit('textUpdate', { content: room.content });
        }
    });
    
    // Handle disconnection
    socket.on('disconnect', () => {
        if (currentRoom) {
            leaveRoom(socket, currentRoom);
        }
    });
    
    // Helper function to leave a room
    function leaveRoom(socket, roomId) {
        if (editorRooms.has(roomId)) {
            const room = editorRooms.get(roomId);
            room.users.delete(socket.id);
            
            console.log(`User ${socket.id} left room: ${roomId}. Room users: ${room.users.size}`);
            
            // Update user count for remaining users in room
            io.to(roomId).emit('userCountUpdate', room.users.size);
            
            // Clean up empty rooms (except default)
            if (room.users.size === 0 && roomId !== 'default') {
                editorRooms.delete(roomId);
                console.log(`Room ${roomId} deleted (empty)`);
            }
        }
        socket.leave(roomId);
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
server.listen(PORT, HOST, () => {
    console.log(`File Manager running on http://${HOST}:${PORT}`);
    console.log(`Realtime Editor available at http://${HOST}:${PORT}/editor`);
    console.log(`Authentication: ${AUTH_ENABLED ? 'ENABLED' : 'DISABLED'}`);
    if (AUTH_ENABLED) {
        console.log(`Admin credentials: ${ADMIN_USERNAME}/${ADMIN_PASSWORD}`);
    }
    console.log('Server is accessible from all network interfaces');
});