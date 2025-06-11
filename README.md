# Web File Manager

A simple and modern web-based file manager built with Node.js, Express, and Docker. Features a clean interface with drag & drop uploads, file editing, and comprehensive file management capabilities.

## Features

### 🚀 Core Functionality
- **File Upload**: Drag & drop interface with multi-file support
- **File Download**: Direct download with proper headers
- **File Creation**: Create new files with custom names and initial content
- **File Editing**: In-browser editor for text files
- **Realtime Text Editor**: Collaborative text editor with live synchronization
- **Folder Management**: Create, navigate, and delete folders
- **File Operations**: Delete files and folders with confirmation

### 🔐 Security
- **Admin Authentication**: Session-based login system
- **Path Traversal Protection**: Secure file system access
- **File Type Validation**: Configurable file type restrictions
- **Session Management**: Secure session handling

### 🎨 User Interface
- **Modern Design**: Clean and fully responsive interface
- **Mobile-First Design**: Optimized for all screen sizes (320px and up)
- **Responsive Layout**: Adaptive header, buttons, and file lists
- **Multiple Views**: Grid and list view options with mobile optimization
- **Drag & Drop**: Intuitive file upload experience
- **Breadcrumb Navigation**: Easy folder navigation
- **File Icons**: Context-aware file type icons
- **Toast Notifications**: User-friendly feedback system

### 🐳 Docker Support
- **Containerized**: Complete Docker setup
- **Windows Compatible**: Proper volume mounting for Windows
- **Health Checks**: Built-in container health monitoring
- **Environment Variables**: Configurable through environment

### 🔄 Realtime Text Editor
- **Live Collaboration**: Multiple users can edit the same document simultaneously
- **Multiple Rooms**: Create separate editor rooms using clean URLs (e.g., `/editor/382`)
- **Instant Synchronization**: Changes are reflected in real-time across all connected users in the same room
- **User Count Display**: See how many users are currently editing in each room
- **Auto-save**: All changes are automatically saved and persisted per room
- **Save to File**: Save editor content to files in the "Editor" folder with custom filenames
- **Room-based File Naming**: Files saved from specific rooms include room identifier
- **Connection Status**: Visual indicators for connection status
- **Simple Room Creation**: "New Room" button generates 3-digit room numbers (100-999)
- **Clean URLs**: Easy-to-share room URLs with path-based routing
- **Default Room**: Access `/editor` without parameters for the default shared editor

## Quick Start

### Prerequisites
- Docker and Docker Compose
- Or Node.js 18+ (for local development)

### Using Docker Compose (Recommended)

1. **Clone or download this project**
```bash
git clone <repository-url>
cd web-file-manager
```

2. **Configure environment (optional)**
```bash
# Copy and customize environment variables
cp .env.example .env
# Edit .env file as needed
```

3. **Start the application**
```bash
docker-compose up -d
```

3. **Access the application**
   - Open your browser and go to: http://localhost:3000
   - Login with default credentials: `admin` / `admin123`

### Using Docker CLI

1. **Build the image**
```bash
docker build -t file-manager .
```

2. **Run the container**
```bash
docker run -d \
  --name web-file-manager \
  -p 3000:3000 \
  -v "./uploads:/app/uploads" \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD=admin123 \
  file-manager
```

### Local Development

1. **Install dependencies**
```bash
npm install
```

2. **Start the development server**
```bash
npm run dev
```

3. **Access the application**
   - Open your browser and go to: http://localhost:3000

### Disabling Authentication

To disable authentication and allow direct access without login, set the `AUTH` environment variable to `false`:

**Using Docker Compose:**
```bash
# Create a .env file or export the variable
export AUTH=false
docker-compose up -d
```

**Using Docker CLI:**
```bash
docker run -d \
  --name web-file-manager \
  -p 3000:3000 \
  -v "./uploads:/app/uploads" \
  -e AUTH=false \
  file-manager
```

**For Local Development:**
```bash
# Set environment variable
export AUTH=false
npm start
```

When authentication is disabled:
- No login page will be shown
- Direct access to the file manager interface
- All file operations are immediately available
- Useful for local development or trusted environments

### Session Management

The application uses file-based session storage for production-ready session management:
- **Session files**: Stored in `/app/sessions` directory inside container
- **Automatic cleanup**: Expired sessions cleaned up every hour
- **Persistent sessions**: Sessions survive container restarts
- **No external dependencies**: No Redis or database required
- **Production ready**: Scalable and reliable for production use

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Application port |
| `AUTH` | `true` | Enable/disable authentication (`true` or `false`) |
| `ADMIN_USERNAME` | `admin` | Admin username |
| `ADMIN_PASSWORD` | `admin123` | Admin password |
| `SESSION_SECRET` | `file-manager-secret-key` | Session secret key |
| `NODE_ENV` | `development` | Node environment |

### Docker Volume Mounting

For Windows systems, update the volume path in `docker-compose.yml`:

```yaml
volumes:
  # Windows example
  - "C:/Users/YourUsername/file-manager-data:/app/uploads"
  
  # Linux/Mac example
  - "./uploads:/app/uploads"
```

## File Structure

```
file-manager/
├── app.js                 # Main server file
├── package.json           # Node.js dependencies
├── Dockerfile            # Docker configuration
├── docker-compose.yml    # Docker Compose setup
├── healthcheck.js        # Container health check
├── README.md             # This file
├── public/               # Frontend files
│   ├── index.html        # Main application page
│   ├── login.html        # Login page
│   ├── style.css         # Styles
│   └── script.js         # Frontend JavaScript
└── uploads/              # File storage directory
```

## API Endpoints

### Authentication
- `POST /api/login` - User login
- `POST /api/logout` - User logout
- `GET /api/auth-status` - Check authentication status

### File Operations
- `GET /api/files` - List files and folders
- `POST /api/upload` - Upload files
- `POST /api/create-file` - Create new file with name and content
- `GET /api/download/*` - Download file
- `DELETE /api/delete/*` - Delete file or folder
- `POST /api/rename/*` - Rename file or folder

### File Editing
- `GET /api/file-content/*` - Get file content for editing
- `POST /api/save-file/*` - Save edited file content

### Folder Management
- `POST /api/create-folder` - Create new folder

## Supported File Types

### Editable Files
- **Text files**: `.txt`, `.md`, `.markdown`, `.rst`, `.asciidoc`
- **Web files**: `.html`, `.htm`, `.css`, `.scss`, `.sass`, `.less`, `.js`, `.jsx`, `.ts`, `.tsx`, `.vue`, `.svelte`
- **Backend code**: `.php`, `.py`, `.rb`, `.go`, `.rs`, `.java`, `.kt`, `.cs`, `.vb`, `.cpp`, `.c`, `.h`, `.hpp`, `.swift`, `.scala`
- **Shell scripts**: `.sh`, `.bash`, `.zsh`, `.fish`, `.ps1`, `.bat`, `.cmd`
- **Config files**: `.json`, `.yaml`, `.yml`, `.toml`, `.ini`, `.cfg`, `.conf`, `.xml`, `.env`
- **Data files**: `.csv`, `.tsv`, `.properties`, `.sql`
- **Documentation**: `.tex`, `.latex`, `.org`, `.wiki`
- **Other formats**: `.log`, `.gitignore`, `.dockerignore`, `.eslintrc`, `.prettierrc`, and more

### Uploadable Files
- Images (`.jpg`, `.jpeg`, `.png`, `.gif`, `.bmp`, `.svg`)
- Documents (`.pdf`, `.doc`, `.docx`, `.xls`, `.xlsx`)
- Archives (`.zip`, `.rar`, `.7z`, `.tar`, `.gz`)
- Media (`.mp4`, `.mp3`, `.avi`, `.mov`)
- Code and text files

## Security Features

- **Path Traversal Protection**: Prevents access outside the uploads directory
- **File Type Validation**: Configurable file type restrictions
- **Session Security**: Secure session configuration
- **Authentication Required**: All file operations require login
- **File Size Limits**: 50MB upload limit (configurable)

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Troubleshooting

### Container Issues

1. **Check container status**
```bash
docker-compose ps
docker-compose logs file-manager
```

2. **Restart the container**
```bash
docker-compose restart file-manager
```

### Permission Issues (Linux/Mac)

```bash
# Fix upload directory permissions
sudo chown -R $USER:$USER ./uploads
chmod 755 ./uploads
```

### Windows Volume Mounting

Ensure Docker Desktop has access to the drive where your project is located:
1. Open Docker Desktop settings
2. Go to "Resources" > "File Sharing"
3. Add the drive containing your project

## Development

### Project Setup
```bash
# Install dependencies
npm install

# Start development server with auto-restart
npm run dev

# Start production server
npm start
```

### Adding New Features

1. **Backend**: Add new routes in `app.js`
2. **Frontend**: Update `public/script.js` and `public/index.html`
3. **Styling**: Modify `public/style.css`

## License

MIT License - feel free to use this project for personal or commercial purposes.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review the Docker logs
3. Create an issue with detailed information about your environment and the problem

---

**Default Login Credentials:**
- Username: `admin`
- Password: `admin123`

**Important:** Change the default credentials in production by setting the `ADMIN_USERNAME` and `ADMIN_PASSWORD` environment variables.