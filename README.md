# GitHub File Manager

A lightweight GitHub repository management app built with React, TypeScript, Vite, and Gemini AI support. It lets users browse GitHub repositories, view file trees, upload files, edit content, delete files, and export repository data in a simple interface.

## Overview

This project is designed for users who want a fast and clean way to manage files directly in GitHub repositories without needing to use the GitHub web interface for every action. The app supports:

- Repository browsing and search
- Recursive file/folder tree view
- File preview and editing
- Upload new files
- Delete existing files
- Export repository structure
- AI-powered file handling support via Gemini API

## ✨ Features

- **GitHub Repo Management** - Connect to any GitHub repository, browse files, select branches, and manage project contents directly
- **File Explorer** - View folder hierarchy, full-path structure, and search through repository content efficiently
- **Upload & Delete** - Upload files or folders and remove selected items with commit messages and bulk deletion support
- **AI Ready** - Built with Gemini API support for AI-assisted workflows and enhanced repository management
- **Full CRUD Operations** - Create, Read, Update, Delete files directly through intuitive UI
- **Live Artifact Screen** - Preview HTML files in real-time
- **Bulk Operations** - Bulk delete multiple files at once
- **Auto-Upload** - Toggle automatic upload on file selection

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript
- **Build Tool**: Vite 6.2.3
- **Styling**: Tailwind CSS 4.1.14
- **GitHub API**: Octokit 5.0.5
- **AI Integration**: Google GenAI 2.4.0
- **Backend**: Express 4.21.2
- **UI Components**: Lucide React, Motion

## 📁 Project Structure

```
.
├── .env.example              # Environment variables template
├── .github/                  # GitHub workflows and configs
├── .gitignore               # Git ignore rules
├── assets/                  # Static assets and .aistudio files
├── index.html               # Main HTML entry point
├── metadata.json            # Project metadata
├── package.json             # Dependencies and scripts
├── tsconfig.json            # TypeScript configuration
├── vite.config.ts           # Vite build configuration
├── bun.lock                 # Dependency lock file
├── src/
│   ├── App.tsx              # Main React application component
│   ├── main.tsx             # React entry point
│   ├── index.css            # Global styles
│   ├── components/          # Reusable React components
│   │   ├── FileViewerModal.tsx
│   │   ├── DeleteConfirmationModal.tsx
│   │   ├── ArtifactScreen.tsx
│   │   ├── AllIndexPagesViewer.tsx
│   │   └── FullPathFileViewer.tsx
│   └── utils/               # Utility functions
│       └── githubHelpers.ts # GitHub API helpers
└── README.md                # This file
```

## 📋 Prerequisites

Before running this project, make sure you have:

- **Node.js** (v18 or newer)
- **npm** or **bun** package manager
- **GitHub Personal Access Token (PAT)** with `repo` scope
- **Gemini API Key** (optional, for AI features)

## 🚀 Installation

### 1. Clone the Repository

```bash
git clone https://github.com/ydvaditya20-creator/Git-file-uploader.git
cd Git-file-uploader
```

### 2. Install Dependencies

Using npm:
```bash
npm install
```

Or using bun:
```bash
bun install
```

### 3. Setup Environment Variables

Copy the example configuration:
```bash
cp .env.example .env.local
```

Edit `.env.local` and add your values:
```env
GEMINI_API_KEY="your_gemini_api_key_here"
APP_URL="http://localhost:3000"
```

> **Note**: If running inside AI Studio or a hosted environment, some values may be injected automatically at runtime.

## 💻 Run Locally

Start the development server:

```bash
npm run dev
```

The app will be available at:
```
http://localhost:3000
```

The app will:
- Hot reload on file changes
- Show TypeScript errors in the console
- Display Vite dev server info with network address

## 📦 Production Build

Build for production:

```bash
npm run build
```

Output will be in the `dist/` directory.

Preview the production build locally:

```bash
npm run preview
```

## 📜 Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Run app in development mode on port 3000 |
| `npm run build` | Build the project for production |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Type-check with TypeScript |
| `npm run clean` | Remove build artifacts (dist, server.js) |

## 🎯 Usage Guide

### First Time Setup

1. **Launch the app** at `http://localhost:3000`
2. **Enter GitHub Token** - Paste your GitHub Personal Access Token (requires `repo` scope)
3. **Select Repository** - Choose from your repos or manually enter a repo URL
4. **Connect** - Click the Connect button to verify access

### Managing Files

#### Browse Files
- Navigate through directories using the file explorer
- Use breadcrumbs to jump to any parent folder
- Search for files using the search bar
- View file sizes and types

#### View Files
- Click the eye icon to preview file content
- Supports text files, code files, and documents
- Copy file paths to clipboard

#### Edit Files
- Click the edit icon to open file editor
- Make changes and add commit message
- Save changes back to GitHub

#### Upload Files
- Drag & drop files directly into the upload zone
- Or click to browse and select files
- Upload entire folders with structure preserved
- Enable auto-upload for immediate pushing to GitHub
- Add custom commit message for the upload

#### Create Files
- Create new empty files with content
- Specify file path (supports nested paths like `docs/readme.md`)
- Add file content directly
- Include commit message

#### Create Folders
- Create new folders in the repository
- Automatically creates `.gitkeep` placeholder file
- Preserves folder structure on GitHub

#### Delete Files
- Select single or multiple files
- Use bulk delete for efficiency
- Add commit message before deletion
- Confirmation modal prevents accidents

### Tab Features

1. **Repository Files** - Navigate and manage individual files
2. **Full Path File List** - View entire repository structure with full paths
3. **Live Artifact Screen** - Preview and test HTML files live
4. **All index.html Pages** - View all HTML entry points in collapsible details

## 🔐 GitHub Token Requirements

Your GitHub Personal Access Token needs these scopes:
- `repo` - Full control of private and public repositories
- `workflow` (optional) - For GitHub Actions access

### How to Create a GitHub Token

1. Go to GitHub → Settings → Developer settings → Personal access tokens
2. Click "Generate new token"
3. Select scopes: `repo` (and optionally `workflow`)
4. Copy the token and paste into the app
5. Token is stored securely in browser localStorage

## 🌐 Environment Variables

### `.env.local` Configuration

```env
# Gemini API Key for AI features
GEMINI_API_KEY="AIzaSyD..."

# Application URL
APP_URL="http://localhost:3000"
```

In AI Studio, these are automatically injected at runtime through the Secrets panel.

## 🏗️ Component Architecture

### Main Components

- **App.tsx** - Main application logic, state management, GitHub operations
- **FileViewerModal.tsx** - Modal for viewing and editing files
- **DeleteConfirmationModal.tsx** - Confirmation UI for deletions
- **ArtifactScreen.tsx** - Live preview of HTML artifacts
- **FullPathFileViewer.tsx** - Complete repository file tree view
- **AllIndexPagesViewer.tsx** - All index.html files viewer

### Utility Functions

- **githubHelpers.ts** - Octokit integration, base64 encoding/decoding, file operations

## 📝 API Integration

### GitHub API (Octokit)

The app uses Octokit to interact with GitHub:
- List repositories
- Get repository contents
- Create/update files
- Delete files
- Get repository trees (for bulk operations)

### Gemini API

Optional integration for AI-powered features:
- File analysis
- Content suggestions
- Code assistance

## 🎨 UI/UX Features

- **Modern Dark Theme** - Optimized for extended usage
- **Responsive Design** - Works on desktop, tablet, and mobile
- **Real-time Feedback** - Success and error notifications
- **Loading States** - Visual feedback during operations
- **Smooth Animations** - Transitioned UI elements
- **Keyboard Shortcuts** - Quick navigation support

## ⚡ Performance Optimizations

- **Bulk Tree Fetching** - Single API call to get repository structure
- **Lazy Loading** - Components load on demand
- **File Caching** - Smart caching for file contents
- **Optimized Uploads** - Batch upload processing
- **React 19** - Latest performance improvements

## 🐛 Troubleshooting

### "Unauthorized! Please check your Personal Access Token"
- Verify your GitHub token is valid
- Check token hasn't expired
- Ensure token has `repo` scope

### "Repository not found"
- Verify repository URL is correct
- Check you have access to the repository
- Try with a public repository first

### "Failed to upload file"
- Check GitHub token permissions
- Verify you have write access to the repository
- Check file size limits
- Ensure branch exists

### App won't start
- Clear `node_modules` and reinstall: `rm -rf node_modules && npm install`
- Clear build artifacts: `npm run clean`
- Check Node.js version is v18+

## 📚 Documentation

- [GitHub API Docs](https://docs.github.com/en/rest)
- [Octokit Documentation](https://octokit.github.io/rest.js/)
- [React Documentation](https://react.dev)
- [Tailwind CSS](https://tailwindcss.com)
- [Vite Guide](https://vitejs.dev/guide/)

## 🤝 Contributing

Contributions are welcome! Feel free to:
- Report bugs
- Suggest features
- Submit pull requests
- Improve documentation

## 📄 License

This project does not specify a license in the repository metadata. Please check the repository for licensing information before using it in production.

## 👤 Author

**GitHub**: [@ydvaditya20-creator](https://github.com/ydvaditya20-creator)

---

### 🌟 Give a Star!

If this project helped you, please consider giving it a ⭐ on GitHub!

### 📞 Support

For issues, questions, or suggestions:
- Open an GitHub Issue
- Check existing discussions
- Review the troubleshooting section

---

**Last Updated**: 2026  
**Version**: 2.0 - CRUD Edition
