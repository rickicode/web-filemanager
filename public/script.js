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
        
        if (!data.authenticated) {
            window.location.href = '/login';
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = '/login';
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
    document.getElementById('createFolderBtn').addEventListener('click', () => openModal(folderModal));
    
    // Bulk actions
    document.getElementById('downloadSelectedBtn').addEventListener('click', downloadSelectedFiles);
    document.getElementById('downloadZipBtn').addEventListener('click', downloadSelectedAsZip);
    
    // Editor modal
    document.getElementById('closeEditor').addEventListener('click', () => closeModal(editorModal));
    document.getElementById('saveFile').addEventListener('click', saveFileContent);
    document.getElementById('cancelEdit').addEventListener('click', () => closeModal(editorModal));
    
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
    
    // Handle both files and folders from drag & drop
    const items = Array.from(event.dataTransfer.items);
    const files = [];
    
    if (items.length > 0) {
        // Check if dropped items include folders
        processDroppedItems(items).then(allFiles => {
            if (allFiles.length > 0) {
                uploadFiles(allFiles);
            }
        });
    } else {
        // Fallback to files for older browsers
        const droppedFiles = Array.from(event.dataTransfer.files);
        if (droppedFiles.length > 0) {
            uploadFiles(droppedFiles);
        }
    }
}

async function processDroppedItems(items) {
    const files = [];
    
    for (const item of items) {
        if (item.kind === 'file') {
            const entry = item.webkitGetAsEntry();
            if (entry) {
                await processEntry(entry, files);
            }
        }
    }
    
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
    const formData = new FormData();
    let totalSize = 0;
    
    files.forEach(file => {
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
            
            const message = isFolder || files.some(f => f.webkitRelativePath)
                ? `Successfully uploaded folder with ${result.files.length} file(s)`
                : `Successfully uploaded ${result.files.length} file(s)`;
            showToast(message, 'success');
            loadFiles(); // Refresh file list
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

function showUploadProgress() {
    uploadProgress.style.display = 'block';
    progressFill.style.width = '0%';
    progressText.textContent = 'Uploading...';
    
    // Simulate progress (in real app, you'd track actual upload progress)
    let progress = 0;
    const interval = setInterval(() => {
        progress += Math.random() * 30;
        if (progress >= 90) {
            progress = 90;
            clearInterval(interval);
        }
        progressFill.style.width = progress + '%';
    }, 200);
}

function hideUploadProgress() {
    progressFill.style.width = '100%';
    progressText.textContent = 'Upload complete!';
    
    setTimeout(() => {
        uploadProgress.style.display = 'none';
    }, 1000);
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
    dropdownItems.push(`<button class="dropdown-item delete" onclick="deleteItem('${item.path}')">
        <i class="fas fa-trash"></i> Delete
    </button>`);
    
    const dropdown = dropdownItems.length > 0 ? `
        <div class="file-dropdown-top">
            <button class="dropdown-toggle" onclick="toggleDropdown(event)">
                <i class="fas fa-ellipsis-v"></i>
            </button>
            <div class="dropdown-menu">
                ${dropdownItems.join('')}
            </div>
        </div>
    ` : '';
    
    const checkbox = `
        <div class="file-checkbox">
            <input type="checkbox" id="file-${item.path.replace(/[^a-zA-Z0-9]/g, '_')}"
                   class="file-select" value="${item.path}" onchange="updateSelectedFiles()">
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
        return `
            <div class="file-item ${isFolder ? 'folder' : ''}" onclick="${clickHandler}">
                ${checkbox}
                ${dropdown}
                <div class="file-icon ${iconClass}">
                    <i class="fas ${getFileIconClass(item)}"></i>
                </div>
                <div class="file-content">
                    <div class="file-details">
                        <div class="file-name">${item.name}</div>
                        <div class="file-info">
                            ${fileSize}${fileSize && modifiedDate ? ' • ' : ''}${modifiedDate}
                        </div>
                    </div>
                    <div class="file-actions" onclick="event.stopPropagation()">
                        ${downloadAction}
                    </div>
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
    const editableExtensions = ['.txt', '.md', '.json', '.xml', '.csv', '.js', '.css', '.html', '.php', '.py'];
    
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
        window.open(`/api/download/${filePath}`, '_blank');
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
        const response = await fetch(`/api/delete/${itemPath}`, {
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
        toast.style.animation = 'slideInRight 0.3s ease-out reverse';
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
            window.open(`/api/download/${filePath}`, '_blank');
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