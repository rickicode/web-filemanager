// Global variables
let currentPath = '';
let currentView = 'grid';
let currentEditFile = '';
let selectedFiles = new Set();

// DOM Elements
const fileManagerContainer = document.getElementById('fileManagerContainer');
const dragOverlay = document.getElementById('dragOverlay');
const uploadBtn = document.getElementById('uploadBtn');
const uploadFolderBtn = document.getElementById('uploadFolderBtn');
const fileInput = document.getElementById('fileInput');
const folderInput = document.getElementById('folderInput');
const uploadProgress = document.getElementById('uploadProgress');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const fileList = document.getElementById('fileList');
const breadcrumbContent = document.getElementById('breadcrumbContent');
const loadingSpinner = document.getElementById('loadingSpinner');
const toastContainer = document.getElementById('toastContainer');

// Modal elements
const editorModal = document.getElementById('editorModal');
const fileEditor = document.getElementById('fileEditor');
const editFileName = document.getElementById('editFileName');
const folderModal = document.getElementById('folderModal');
const folderName = document.getElementById('folderName');
const fileModal = document.getElementById('fileModal');
const fileName = document.getElementById('fileName');
const fileContent = document.getElementById('fileContent');
const confirmDialog = document.getElementById('confirmDialog');
const confirmMessage = document.getElementById('confirmMessage');

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    checkAuth();
    initializeEventListeners();
    loadFiles();
});

// Check authentication status
async function checkAuth() {
    try {
        const response = await fetch('/api/auth-status');
        const data = await response.json();
        
        if (!data.authenticated && data.authEnabled) {
            window.location.href = '/login';
        }
        
        // Hide logout button if authentication is disabled
        if (!data.authEnabled) {
            const logoutBtn = document.getElementById('logoutBtn');
            if (logoutBtn) {
                logoutBtn.style.display = 'none';
            }
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        // Only redirect to login if we can't determine auth status and auth might be enabled
        const urlParams = new URLSearchParams(window.location.search);
        if (!urlParams.has('noauth')) {
            window.location.href = '/login';
        }
    }
}

// Initialize event listeners
function initializeEventListeners() {
    // Upload functionality
    uploadBtn.addEventListener('click', () => fileInput.click());
    uploadFolderBtn.addEventListener('click', () => folderInput.click());
    fileInput.addEventListener('change', handleFileSelect);
    folderInput.addEventListener('change', handleFolderSelect);
    
    // Drag and drop on file manager container
    fileManagerContainer.addEventListener('dragover', handleDragOver);
    fileManagerContainer.addEventListener('dragleave', handleDragLeave);
    fileManagerContainer.addEventListener('drop', handleDrop);
    
    // Prevent default drag behaviors on document
    document.addEventListener('dragover', preventDefaults);
    document.addEventListener('drop', preventDefaults);
    
    // View controls
    document.getElementById('gridViewBtn').addEventListener('click', () => setView('grid'));
    document.getElementById('listViewBtn').addEventListener('click', () => setView('list'));
    
    // Header actions
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    document.getElementById('createFileBtn').addEventListener('click', () => openModal(fileModal));
    document.getElementById('createFolderBtn').addEventListener('click', () => openModal(folderModal));
    
    // Bulk actions
    document.getElementById('downloadSelectedBtn').addEventListener('click', downloadSelectedFiles);
    document.getElementById('downloadZipBtn').addEventListener('click', downloadSelectedAsZip);
    document.getElementById('deleteSelectedBtn').addEventListener('click', deleteSelectedFiles);
    
    // Editor modal
    document.getElementById('closeEditor').addEventListener('click', () => closeModal(editorModal));
    document.getElementById('saveFile').addEventListener('click', saveFileContent);
    document.getElementById('cancelEdit').addEventListener('click', () => closeModal(editorModal));
    
    // File modal
    document.getElementById('closeFileModal').addEventListener('click', () => closeModal(fileModal));
    document.getElementById('createFile').addEventListener('click', createFile);
    document.getElementById('cancelFile').addEventListener('click', () => closeModal(fileModal));
    
    // Folder modal
    document.getElementById('closeFolderModal').addEventListener('click', () => closeModal(folderModal));
    document.getElementById('createFolder').addEventListener('click', createFolder);
    document.getElementById('cancelFolder').addEventListener('click', () => closeModal(folderModal));
    
    // Confirmation dialog
    document.getElementById('confirmNo').addEventListener('click', () => closeModal(confirmDialog));
    
    // Close modals when clicking outside
    window.addEventListener('click', function(event) {
        if (event.target.classList.contains('modal')) {
            closeModal(event.target);
        }
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            closeAllModals();
        }
    });
}

// File upload handling
function handleFileSelect(event) {
    const files = Array.from(event.target.files);
    if (files.length > 0) {
        uploadFiles(files);
    }
}

function handleFolderSelect(event) {
    const files = Array.from(event.target.files);
    if (files.length > 0) {
        uploadFiles(files, true); // true indicates folder upload
    }
}

function preventDefaults(event) {
    event.preventDefault();
    event.stopPropagation();
}

function handleDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    fileManagerContainer.classList.add('dragover');
    dragOverlay.style.display = 'flex';
}

function handleDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    
    // Only hide if we're leaving the file manager container entirely
    if (!fileManagerContainer.contains(event.relatedTarget)) {
        fileManagerContainer.classList.remove('dragover');
        dragOverlay.style.display = 'none';
    }
}

function handleDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    
    fileManagerContainer.classList.remove('dragover');
    dragOverlay.style.display = 'none';
    
    // Get dropped files
    const droppedFiles = Array.from(event.dataTransfer.files);
    const items = Array.from(event.dataTransfer.items);
    
    console.log(`Dropped ${droppedFiles.length} files`, droppedFiles.map(f => f.name));
    
    // Check if any items have directory structure
    const hasDirectories = items.some(item => {
        const entry = item.webkitGetAsEntry && item.webkitGetAsEntry();
        return entry && entry.isDirectory;
    });
    
    if (hasDirectories && items.length > 0 && items[0].webkitGetAsEntry) {
        // Handle folder structure
        processDroppedItems(items).then(allFiles => {
            console.log(`Processed ${allFiles.length} files from directories`);
            if (allFiles.length > 0) {
                uploadFiles(allFiles, true);
            } else if (droppedFiles.length > 0) {
                uploadFiles(droppedFiles);
            }
        }).catch(error => {
            console.error('Error processing dropped items:', error);
            // Fallback to direct files if processing fails
            if (droppedFiles.length > 0) {
                uploadFiles(droppedFiles);
            }
        });
    } else {
        // Direct file handling - this should work for multiple files
        if (droppedFiles.length > 0) {
            uploadFiles(droppedFiles);
        } else {
            showToast('No files were dropped', 'error');
        }
    }
}

async function processDroppedItems(items) {
    const files = [];
    
    for (const item of items) {
        if (item.kind === 'file') {
            const entry = item.webkitGetAsEntry();
            if (entry) {
                try {
                    await processEntry(entry, files);
                } catch (error) {
                    console.error('Error processing entry:', error);
                    // Fallback: try to get the file directly
                    const file = item.getAsFile();
                    if (file) {
                        files.push(file);
                    }
                }
            } else {
                // Fallback: try to get the file directly
                const file = item.getAsFile();
                if (file) {
                    files.push(file);
                }
            }
        }
    }
    
    console.log(`processDroppedItems result: ${files.length} files`);
    return files;
}

async function processEntry(entry, files, path = '') {
    if (entry.isFile) {
        return new Promise((resolve) => {
            entry.file((file) => {
                // Add path information to file
                const fullPath = path + file.name;
                Object.defineProperty(file, 'webkitRelativePath', {
                    value: fullPath,
                    writable: false
                });
                files.push(file);
                resolve();
            });
        });
    } else if (entry.isDirectory) {
        const dirReader = entry.createReader();
        return new Promise((resolve) => {
            dirReader.readEntries(async (entries) => {
                for (const childEntry of entries) {
                    await processEntry(childEntry, files, path + entry.name + '/');
                }
                resolve();
            });
        });
    }
}

async function uploadFiles(files, isFolder = false) {
    // Check if files array is valid and not empty
    if (!files || files.length === 0) {
        showToast('<i class="fas fa-exclamation-triangle"></i> No files selected for upload', 'error');
        return;
    }
    
    console.log(`Starting upload of ${files.length} files:`, files.map(f => f.name));
    
    // Show info about multiple files being uploaded
    if (files.length > 1) {
        showToast(`<i class="fas fa-file-upload"></i> Preparing to upload ${files.length} files...`, 'info');
    } else {
        showToast(`<i class="fas fa-file-upload"></i> Preparing to upload "${files[0].name}"...`, 'info');
    }
    
    const formData = new FormData();
    let totalSize = 0;
    
    files.forEach((file, index) => {
        formData.append('files', file);
        totalSize += file.size;
        
        // Add relative path for folder structure
        if (file.webkitRelativePath) {
            formData.append('relativePaths', file.webkitRelativePath);
        }
        
    });
    
    formData.append('currentPath', currentPath);
    formData.append('preserveStructure', isFolder || files.some(f => f.webkitRelativePath));
    
    const startTime = Date.now();
    showUploadProgress(totalSize);
    
    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        
        if (response.ok) {
            const result = await response.json();
            const endTime = Date.now();
            const duration = (endTime - startTime) / 1000; // seconds
            const speed = totalSize / duration; // bytes per second
            
            let message;
            if (isFolder || files.some(f => f.webkitRelativePath)) {
                message = `<i class="fas fa-folder-open"></i> Successfully uploaded folder with ${result.files.length} file(s)`;
            } else if (result.files.length > 1) {
                message = `<i class="fas fa-check-circle"></i> Successfully uploaded ${result.files.length} files to ${currentPath || 'root folder'}`;
            } else {
                message = `<i class="fas fa-check"></i> Successfully uploaded "${result.files[0].name}" to ${currentPath || 'root folder'}`;
            }
            showToast(message, 'success');
            loadFiles(currentPath); // Refresh current directory
        } else {
            const error = await response.json();
            showToast(error.error || 'Upload failed', 'error');
        }
    } catch (error) {
        console.error('Upload error:', error);
        showToast('Upload failed: ' + error.message, 'error');
    } finally {
        hideUploadProgress();
        fileInput.value = ''; // Reset file input
        folderInput.value = ''; // Reset folder input
    }
}

let uploadStartTime = 0;
let uploadTotalSize = 0;
let uploadedBytes = 0;

function showUploadProgress(totalSize = 0) {
    uploadProgress.style.display = 'block';
    progressFill.style.width = '0%';
    progressText.textContent = 'Preparing upload...';
    
    uploadStartTime = Date.now();
    uploadTotalSize = totalSize;
    uploadedBytes = 0;
    
    document.getElementById('uploadSpeed').textContent = '0 MB/s';
    document.getElementById('uploadSize').textContent = `0 MB / ${formatFileSize(totalSize)}`;
    document.getElementById('uploadETA').textContent = 'ETA: calculating...';
    
    // Simulate progress with speed calculation
    let progress = 0;
    const interval = setInterval(() => {
        progress += Math.random() * 15 + 5; // 5-20% increment
        if (progress >= 95) {
            progress = 95;
            clearInterval(interval);
        }
        
        uploadedBytes = (progress / 100) * uploadTotalSize;
        updateUploadStats(progress);
        progressFill.style.width = progress + '%';
    }, 300);
    
    // Store interval for cleanup
    window.uploadInterval = interval;
}

function updateUploadStats(progress) {
    const currentTime = Date.now();
    const elapsed = (currentTime - uploadStartTime) / 1000; // seconds
    
    if (elapsed > 0) {
        const speed = uploadedBytes / elapsed; // bytes per second
        const remainingBytes = uploadTotalSize - uploadedBytes;
        const eta = speed > 0 ? remainingBytes / speed : 0;
        
        document.getElementById('uploadSpeed').textContent = formatSpeed(speed);
        document.getElementById('uploadSize').textContent =
            `${formatFileSize(uploadedBytes)} / ${formatFileSize(uploadTotalSize)}`;
        
        if (eta > 0 && progress < 95) {
            document.getElementById('uploadETA').textContent = `ETA: ${formatTime(eta)}`;
        } else {
            document.getElementById('uploadETA').textContent = 'ETA: completing...';
        }
        
        progressText.innerHTML = `<i class="fas fa-upload"></i> Uploading... ${Math.round(progress)}%`;
    }
}

function formatSpeed(bytesPerSecond) {
    const mbps = bytesPerSecond / (1024 * 1024);
    if (mbps >= 1) {
        return `${mbps.toFixed(1)} MB/s`;
    } else {
        const kbps = bytesPerSecond / 1024;
        return `${kbps.toFixed(0)} KB/s`;
    }
}

function formatTime(seconds) {
    if (seconds < 60) {
        return `${Math.round(seconds)}s`;
    } else if (seconds < 3600) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.round(seconds % 60);
        return `${minutes}m ${remainingSeconds}s`;
    } else {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours}h ${minutes}m`;
    }
}

function hideUploadProgress() {
    // Clear any running interval
    if (window.uploadInterval) {
        clearInterval(window.uploadInterval);
        window.uploadInterval = null;
    }
    
    progressFill.style.width = '100%';
    progressText.innerHTML = '<i class="fas fa-check-circle"></i> Upload complete!';
    document.getElementById('uploadSpeed').textContent = '0 MB/s';
    document.getElementById('uploadETA').textContent = 'Complete!';
    
    setTimeout(() => {
        uploadProgress.style.display = 'none';
    }, 1500);
}

// File management
async function loadFiles(path = '') {
    showLoading(true);
    currentPath = path;
    
    try {
        const response = await fetch(`/api/files?path=${encodeURIComponent(path)}`);
        
        if (response.ok) {
            const data = await response.json();
            displayFiles(data.items);
            updateBreadcrumb(path);
        } else {
            const error = await response.json();
            showToast(error.error || 'Failed to load files', 'error');
        }
    } catch (error) {
        console.error('Load files error:', error);
        showToast('Failed to load files: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

function displayFiles(items) {
    if (items.length === 0) {
        fileList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-folder-open"></i>
                <h3>No files or folders</h3>
                <p>Upload some files or create a new folder to get started</p>
            </div>
        `;
        return;
    }
    
    fileList.innerHTML = items.map(item => createFileItem(item)).join('');
    
    // Reset selection state
    selectedFiles.clear();
    updateSelectedFiles();
}

function createFileItem(item) {
    const isFolder = item.isDirectory;
    const iconClass = getFileIcon(item);
    const fileSize = isFolder ? '' : formatFileSize(item.size);
    const modifiedDate = new Date(item.modified).toLocaleDateString();
    
    const downloadAction = isFolder ? '' :
        `<button class="btn-download" onclick="downloadFile('${item.path}')">
            <i class="fas fa-download"></i> Download
        </button>`;
    
    const dropdownItems = [];
    if (!isFolder && isEditableFile(item)) {
        dropdownItems.push(`<button class="dropdown-item edit" onclick="editFile('${item.path}')">
            <i class="fas fa-edit"></i> Edit
        </button>`);
    }
    dropdownItems.push(`<button class="dropdown-item rename" onclick="renameItem('${item.path}', '${item.name}')">
        <i class="fas fa-i-cursor"></i> Rename
    </button>`);
    dropdownItems.push(`<button class="dropdown-item delete" onclick="deleteItem('${item.path}')">
        <i class="fas fa-trash"></i> Delete
    </button>`);
    
    const dropdown = dropdownItems.length > 0 ? `
        <div class="file-dropdown-top" onclick="event.stopPropagation()">
            <button class="dropdown-toggle" onclick="toggleDropdown(event)">
                <i class="fas fa-ellipsis-v"></i>
            </button>
            <div class="dropdown-menu">
                ${dropdownItems.join('')}
            </div>
        </div>
    ` : '';
    
    const checkbox = `
        <div class="file-checkbox" onclick="event.stopPropagation()">
            <input type="checkbox" id="file-${item.path.replace(/[^a-zA-Z0-9]/g, '_')}"
                   class="file-select" value="${item.path}" onchange="updateSelectedFiles()" onclick="event.stopPropagation()">
        </div>
    `;
    
    const fileId = `file-${item.path.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const clickHandler = isFolder ? `loadFiles('${item.path}')` : `toggleFileSelect('${fileId}')`;
    
    if (currentView === 'grid') {
        return `
            <div class="file-item ${isFolder ? 'folder' : ''}" onclick="${clickHandler}">
                ${checkbox}
                ${dropdown}
                <div class="file-icon ${iconClass}">
                    <i class="fas ${getFileIconClass(item)}"></i>
                </div>
                <div class="file-content-wrapper">
                    <div class="file-name">${item.name}</div>
                    <div class="file-info">
                        ${fileSize}${fileSize && modifiedDate ? ' • ' : ''}${modifiedDate}
                    </div>
                </div>
                <div class="file-actions" onclick="event.stopPropagation()">
                    ${downloadAction}
                </div>
            </div>
        `;
    } else {
        // List view layout - simplified structure
        return `
            <div class="file-item ${isFolder ? 'folder' : ''}" onclick="${clickHandler}">
                ${checkbox}
                <div class="file-icon ${iconClass}">
                    <i class="fas ${getFileIconClass(item)}"></i>
                </div>
                <div class="file-info-wrapper">
                    <div class="file-name">${item.name}</div>
                    <div class="file-details">
                        <span class="file-size">${fileSize}</span>
                        ${fileSize && modifiedDate ? ' • ' : ''}
                        <span class="file-date">${modifiedDate}</span>
                    </div>
                </div>
                <div class="file-actions" onclick="event.stopPropagation()">
                    ${downloadAction}
                    ${dropdown}
                </div>
            </div>
        `;
    }
}

function getFileIcon(item) {
    if (item.isDirectory) return 'folder';
    
    const ext = item.extension.toLowerCase();
    
    if (['.txt', '.md', '.json', '.xml', '.csv'].includes(ext)) return 'text';
    if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg'].includes(ext)) return 'image';
    if (['.mp4', '.avi', '.mov', '.wmv', '.flv'].includes(ext)) return 'video';
    if (['.mp3', '.wav', '.flac', '.aac'].includes(ext)) return 'audio';
    if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext)) return 'archive';
    if (['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'].includes(ext)) return 'document';
    
    return 'default';
}

function getFileIconClass(item) {
    if (item.isDirectory) return 'fa-folder';
    
    const ext = item.extension.toLowerCase();
    
    if (['.txt', '.md'].includes(ext)) return 'fa-file-text';
    if (['.json', '.xml'].includes(ext)) return 'fa-file-code';
    if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg'].includes(ext)) return 'fa-file-image';
    if (['.mp4', '.avi', '.mov', '.wmv', '.flv'].includes(ext)) return 'fa-file-video';
    if (['.mp3', '.wav', '.flac', '.aac'].includes(ext)) return 'fa-file-audio';
    if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext)) return 'fa-file-archive';
    if (['.pdf'].includes(ext)) return 'fa-file-pdf';
    if (['.doc', '.docx'].includes(ext)) return 'fa-file-word';
    if (['.xls', '.xlsx'].includes(ext)) return 'fa-file-excel';
    if (['.ppt', '.pptx'].includes(ext)) return 'fa-file-powerpoint';
    if (['.js', '.css', '.html', '.php', '.py'].includes(ext)) return 'fa-file-code';
    
    return 'fa-file';
}

function isEditableFile(item) {
    if (item.isDirectory) return false;
    
    const ext = item.extension.toLowerCase();
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
    
    return editableExtensions.includes(ext);
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Navigation
function updateBreadcrumb(path) {
    const parts = path ? path.split('/').filter(p => p) : [];
    
    let breadcrumbHTML = `
        <span class="breadcrumb-item ${!path ? 'active' : ''}" data-path="" onclick="loadFiles('')">
            <i class="fas fa-home"></i> Home
        </span>
    `;
    
    let currentPath = '';
    parts.forEach((part, index) => {
        currentPath += (currentPath ? '/' : '') + part;
        const isLast = index === parts.length - 1;
        
        breadcrumbHTML += `
            <span class="breadcrumb-separator"><i class="fas fa-chevron-right"></i></span>
            <span class="breadcrumb-item ${isLast ? 'active' : ''}" data-path="${currentPath}" onclick="loadFiles('${currentPath}')">
                ${part}
            </span>
        `;
    });
    
    breadcrumbContent.innerHTML = breadcrumbHTML;
}

// File operations
async function downloadFile(filePath) {
    try {
        const encodedPath = encodeURIComponent(filePath);
        window.open(`/api/download/${encodedPath}`, '_blank');
    } catch (error) {
        console.error('Download error:', error);
        showToast('Download failed: ' + error.message, 'error');
    }
}

async function editFile(filePath) {
    try {
        showLoading(true);
        const response = await fetch(`/api/file-content/${filePath}`);
        
        if (response.ok) {
            const data = await response.json();
            currentEditFile = filePath;
            editFileName.textContent = filePath.split('/').pop();
            fileEditor.value = data.content;
            openModal(editorModal);
        } else {
            const error = await response.json();
            showToast(error.error || 'Failed to load file', 'error');
        }
    } catch (error) {
        console.error('Edit file error:', error);
        showToast('Failed to load file: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

async function saveFileContent() {
    if (!currentEditFile) return;
    
    try {
        showLoading(true);
        const response = await fetch(`/api/save-file/${currentEditFile}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ content: fileEditor.value })
        });
        
        if (response.ok) {
            showToast('File saved successfully', 'success');
            closeModal(editorModal);
        } else {
            const error = await response.json();
            showToast(error.error || 'Failed to save file', 'error');
        }
    } catch (error) {
        console.error('Save file error:', error);
        showToast('Failed to save file: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

function deleteItem(itemPath) {
    const itemName = itemPath.split('/').pop();
    
    showConfirmDialog(
        `Are you sure you want to delete "${itemName}"? This action cannot be undone.`,
        () => performDelete(itemPath)
    );
}

async function performDelete(itemPath) {
    try {
        showLoading(true);
        const encodedPath = encodeURIComponent(itemPath);
        const response = await fetch(`/api/delete/${encodedPath}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            showToast('Item deleted successfully', 'success');
            loadFiles(currentPath); // Refresh file list
        } else {
            const error = await response.json();
            showToast(error.error || 'Failed to delete item', 'error');
        }
    } catch (error) {
        console.error('Delete error:', error);
        showToast('Failed to delete item: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

async function createFolder() {
    const name = folderName.value.trim();
    
    if (!name) {
        showToast('Please enter a folder name', 'warning');
        return;
    }
    
    try {
        showLoading(true);
        const response = await fetch('/api/create-folder', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                name: name, 
                currentPath: currentPath 
            })
        });
        
        if (response.ok) {
            showToast('Folder created successfully', 'success');
            closeModal(folderModal);
            folderName.value = '';
            loadFiles(currentPath); // Refresh file list
        } else {
            const error = await response.json();
            showToast(error.error || 'Failed to create folder', 'error');
        }
    } catch (error) {
        console.error('Create folder error:', error);
        showToast('Failed to create folder: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// Rename item function
// Create new file
async function createFile() {
    const name = fileName.value.trim();
    const content = fileContent.value || '';
    
    if (!name) {
        showToast('<i class="fas fa-exclamation-triangle"></i> Please enter a file name', 'error');
        fileName.focus();
        return;
    }
    
    // Basic validation for file name
    if (name.includes('/') || name.includes('\\') || name.includes('..')) {
        showToast('<i class="fas fa-exclamation-triangle"></i> Invalid file name. Cannot contain path separators or parent directory references.', 'error');
        fileName.focus();
        return;
    }
    
    try {
        const response = await fetch('/api/create-file', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: name,
                currentPath: currentPath,
                content: content
            })
        });
        
        if (response.ok) {
            const result = await response.json();
            showToast(`<i class="fas fa-check-circle"></i> File "${result.file.name}" created successfully`, 'success');
            closeModal(fileModal);
            fileName.value = '';
            fileContent.value = '';
            loadFiles(currentPath); // Refresh current directory
        } else {
            const error = await response.json();
            showToast(`<i class="fas fa-exclamation-triangle"></i> ${error.error}`, 'error');
        }
    } catch (error) {
        console.error('Create file error:', error);
        showToast('<i class="fas fa-exclamation-triangle"></i> Failed to create file: ' + error.message, 'error');
    }
}

async function renameItem(itemPath, currentName) {
    const newName = prompt('Enter new name:', currentName);
    
    if (newName === null || newName === currentName) {
        return; // User cancelled or didn't change the name
    }
    
    if (!newName || newName.trim() === '') {
        showToast('<i class="fas fa-exclamation-triangle"></i> Please enter a valid name', 'warning');
        return;
    }
    
    // Validate new name
    if (newName.includes('/') || newName.includes('\\') || newName.includes('..')) {
        showToast('<i class="fas fa-exclamation-triangle"></i> Invalid name: cannot contain path separators', 'error');
        return;
    }
    
    try {
        showLoading(true);
        
        const response = await fetch(`/api/rename/${encodeURIComponent(itemPath)}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                newName: newName.trim()
            })
        });
        
        if (response.ok) {
            showToast('<i class="fas fa-check"></i> Item renamed successfully', 'success');
            loadFiles(currentPath); // Refresh file list
        } else {
            const error = await response.json();
            showToast('<i class="fas fa-exclamation-triangle"></i> ' + (error.error || 'Failed to rename item'), 'error');
        }
    } catch (error) {
        console.error('Rename error:', error);
        showToast('<i class="fas fa-exclamation-triangle"></i> Failed to rename item: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// View controls
function setView(view) {
    currentView = view;
    
    document.getElementById('gridViewBtn').classList.toggle('active', view === 'grid');
    document.getElementById('listViewBtn').classList.toggle('active', view === 'list');
    
    fileList.className = `file-list ${view}-view`;
}

// Logout
async function handleLogout() {
    try {
        const response = await fetch('/api/logout', {
            method: 'POST'
        });
        
        if (response.ok) {
            window.location.href = '/login';
        } else {
            showToast('Logout failed', 'error');
        }
    } catch (error) {
        console.error('Logout error:', error);
        showToast('Logout failed: ' + error.message, 'error');
    }
}

// Modal functions
function openModal(modal) {
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

function closeModal(modal) {
    modal.style.display = 'none';
    document.body.style.overflow = '';
}

function closeAllModals() {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => closeModal(modal));
}

function showConfirmDialog(message, onConfirm) {
    confirmMessage.textContent = message;
    
    const confirmYes = document.getElementById('confirmYes');
    const newConfirmYes = confirmYes.cloneNode(true);
    confirmYes.parentNode.replaceChild(newConfirmYes, confirmYes);
    
    newConfirmYes.addEventListener('click', function() {
        closeModal(confirmDialog);
        onConfirm();
    });
    
    openModal(confirmDialog);
}

// UI helpers
function showLoading(show) {
    loadingSpinner.style.display = show ? 'flex' : 'none';
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="fas ${getToastIcon(type)}"></i>
        <span>${message}</span>
    `;
    
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideInUp 0.3s ease-out reverse';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

function getToastIcon(type) {
    switch (type) {
        case 'success': return 'fa-check-circle';
        case 'error': return 'fa-exclamation-circle';
        case 'warning': return 'fa-exclamation-triangle';
        default: return 'fa-info-circle';
    }
}

// Dropdown functionality
function toggleDropdown(event) {
    event.stopPropagation();
    
    // Close all other dropdowns
    document.querySelectorAll('.dropdown-menu.show').forEach(menu => {
        menu.classList.remove('show');
    });
    
    // Toggle current dropdown
    const dropdown = event.target.closest('.file-dropdown-top');
    const menu = dropdown.querySelector('.dropdown-menu');
    menu.classList.toggle('show');
    
    // Close dropdown when clicking outside
    document.addEventListener('click', function closeDropdown(e) {
        if (!dropdown.contains(e.target)) {
            menu.classList.remove('show');
            document.removeEventListener('click', closeDropdown);
        }
    });
}

// File selection functions
function toggleFileSelect(fileId) {
    const checkbox = document.getElementById(fileId);
    if (checkbox) {
        checkbox.checked = !checkbox.checked;
        updateSelectedFiles();
    }
}

function updateSelectedFiles() {
    selectedFiles.clear();
    
    // Remove all selected classes first
    document.querySelectorAll('.file-item').forEach(item => {
        item.classList.remove('selected');
    });
    
    // Add selected files and visual classes
    document.querySelectorAll('.file-select:checked').forEach(checkbox => {
        selectedFiles.add(checkbox.value);
        // Find parent file item and add selected class
        const fileItem = checkbox.closest('.file-item');
        if (fileItem) {
            fileItem.classList.add('selected');
        }
    });
    
    const count = selectedFiles.size;
    const selectedCountEl = document.getElementById('selectedCount');
    const bulkActionsEl = document.getElementById('bulkActions');
    const selectAllEl = document.getElementById('selectAll');
    
    selectedCountEl.textContent = `${count} selected`;
    bulkActionsEl.style.display = count > 0 ? 'flex' : 'none';
    
    // Update select all checkbox state
    const totalCheckboxes = document.querySelectorAll('.file-select').length;
    if (count === 0) {
        selectAllEl.indeterminate = false;
        selectAllEl.checked = false;
    } else if (count === totalCheckboxes) {
        selectAllEl.indeterminate = false;
        selectAllEl.checked = true;
    } else {
        selectAllEl.indeterminate = true;
        selectAllEl.checked = false;
    }
}

function toggleSelectAll() {
    const selectAll = document.getElementById('selectAll');
    const checkboxes = document.querySelectorAll('.file-select');
    
    checkboxes.forEach(checkbox => {
        checkbox.checked = selectAll.checked;
    });
    
    updateSelectedFiles();
}

async function downloadSelectedFiles() {
    if (selectedFiles.size === 0) {
        showToast('No files selected', 'warning');
        return;
    }
    
    for (const filePath of selectedFiles) {
        try {
            const encodedPath = encodeURIComponent(filePath);
            window.open(`/api/download/${encodedPath}`, '_blank');
        } catch (error) {
            console.error('Download error:', error);
            showToast(`Failed to download ${filePath}`, 'error');
        }
    }
    
    showToast(`Started download of ${selectedFiles.size} file(s)`, 'success');
}

async function downloadSelectedAsZip() {
    if (selectedFiles.size === 0) {
        showToast('No files selected', 'warning');
        return;
    }
    
    try {
        showLoading(true);
        const response = await fetch('/api/download-zip', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                files: Array.from(selectedFiles),
                currentPath: currentPath
            })
        });
        
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `selected-files-${Date.now()}.zip`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            showToast('ZIP download started', 'success');
        } else {
            const error = await response.json();
            showToast(error.error || 'Failed to create ZIP', 'error');
        }
    } catch (error) {
        console.error('ZIP download error:', error);
        showToast('Failed to create ZIP: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

async function deleteSelectedFiles() {
    if (selectedFiles.size === 0) {
        showToast('No files selected', 'warning');
        return;
    }
    
    const fileCount = selectedFiles.size;
    const message = `Are you sure you want to delete ${fileCount} selected file(s)? This action cannot be undone.`;
    
    showConfirmDialog(message, async () => {
        try {
            showLoading(true);
            let successCount = 0;
            let errorCount = 0;
            
            // Delete files one by one with proper URL encoding
            for (const filePath of selectedFiles) {
                try {
                    // Encode the file path properly for URL
                    const encodedPath = encodeURIComponent(filePath);
                    const response = await fetch(`/api/delete/${encodedPath}`, {
                        method: 'DELETE'
                    });
                    
                    if (response.ok) {
                        successCount++;
                        console.log(`Successfully deleted: ${filePath}`);
                    } else {
                        errorCount++;
                        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                        console.error(`Failed to delete ${filePath}:`, errorData.error);
                    }
                } catch (error) {
                    errorCount++;
                    console.error(`Error deleting ${filePath}:`, error);
                }
            }
            
            // Show results
            if (successCount > 0) {
                showToast(`Successfully deleted ${successCount} file(s)`, 'success');
            }
            if (errorCount > 0) {
                showToast(`Failed to delete ${errorCount} file(s)`, 'error');
            }
            
            // Clear selection and refresh
            selectedFiles.clear();
            updateSelectedFiles();
            loadFiles(currentPath);
            
        } catch (error) {
            console.error('Bulk delete error:', error);
            showToast('Failed to delete selected files: ' + error.message, 'error');
        } finally {
            showLoading(false);
        }
    });
}