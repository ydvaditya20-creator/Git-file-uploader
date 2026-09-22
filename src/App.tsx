/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { 
  Folder, 
  File as FileIcon, 
  Upload, 
  Trash2, 
  Edit3, 
  Plus, 
  ArrowLeft, 
  Check, 
  AlertCircle, 
  RefreshCw, 
  ExternalLink, 
  Eye, 
  X, 
  Settings, 
  Lock, 
  Unlock, 
  FolderPlus, 
  FileText,
  ChevronRight,
  Info,
  Github,
  Search,
  Download,
  Copy,
  LogOut,
  Globe,
  Sparkles,
  Layers
} from "lucide-react";
import { Octokit } from "octokit";

import { 
  RepoItem, 
  UploadingFile, 
  traverseFileTree, 
  decodeBase64Utf8, 
  encodeBase64Utf8, 
  readFileAsBase64 
} from "./utils/githubHelpers";
import { FileViewerModal } from "./components/FileViewerModal";
import { DeleteConfirmationModal } from "./components/DeleteConfirmationModal";
import { ArtifactScreen } from "./components/ArtifactScreen";
import { AllIndexPagesViewer } from "./components/AllIndexPagesViewer";

export default function App() {
  // --- State Variables ---
  const [token, setToken] = useState<string>(() => localStorage.getItem("github_pat_token") || "");
  const [repoUrl, setRepoUrl] = useState<string>(() => localStorage.getItem("github_repo_url") || "");
  const [owner, setOwner] = useState<string>(() => localStorage.getItem("github_owner") || "");
  const [repo, setRepo] = useState<string>(() => localStorage.getItem("github_repo") || "");
  const [branch, setBranch] = useState<string>(() => localStorage.getItem("github_branch") || "main");
  
  // Repositories list fetch state
  const [userRepos, setUserRepos] = useState<{ full_name: string; name: string; owner: string; default_branch: string }[]>([]);
  const [isLoadingRepos, setIsLoadingRepos] = useState<boolean>(false);
  const [repoSearchQuery, setRepoSearchQuery] = useState<string>("");
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const [isManualRepo, setIsManualRepo] = useState<boolean>(false);
  
  const [showToken, setShowToken] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  
  // Active Tab State
  const [activeTab, setActiveTab] = useState<"files" | "artifact" | "all-index">("files");

  // Browsing State
  const [currentPath, setCurrentPath] = useState<string>("");
  const [items, setItems] = useState<RepoItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  
  // Create File State
  const [newFileName, setNewFileName] = useState<string>("");
  const [newFileContent, setNewFileContent] = useState<string>("");
  const [newFileCommit, setNewFileCommit] = useState<string>("");
  const [isCreatingFile, setIsCreatingFile] = useState<boolean>(false);
  
  // Create Folder State
  const [newFolderName, setNewFolderName] = useState<string>("");
  const [isCreatingFolder, setIsCreatingFolder] = useState<boolean>(false);
  
  // Upload State
  const [uploadFiles, setUploadFiles] = useState<UploadingFile[]>([]);
  const [uploadCommit, setUploadCommit] = useState<string>("");
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isDragActive, setIsDragActive] = useState<boolean>(false);
  const [targetUploadFolder, setTargetUploadFolder] = useState<string>("");
  const [autoUpload, setAutoUpload] = useState<boolean>(true);
  
  // Bulk Delete State
  const [selectedRepoPaths, setSelectedRepoPaths] = useState<string[]>([]);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState<boolean>(false);
  const [bulkDeleteItems, setBulkDeleteItems] = useState<{ path: string; type: string; sha: string; checked: boolean }[]>([]);
  const [isFetchingBulkDeleteList, setIsFetchingBulkDeleteList] = useState<boolean>(false);
  const [bulkDeleteCommitMsg, setBulkDeleteCommitMsg] = useState<string>("");
  const [isBulkDeleting, setIsBulkDeleting] = useState<boolean>(false);
  const [bulkDeleteProgress, setBulkDeleteProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [bulkDeleteSearchQuery, setBulkDeleteSearchQuery] = useState<string>("");
  
  // View/Edit Modal State
  const [selectedItem, setSelectedItem] = useState<RepoItem | null>(null);
  const [selectedFileContent, setSelectedFileContent] = useState<string>("");
  const [isFileContentLoading, setIsFileContentLoading] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editedContent, setEditedContent] = useState<string>("");
  const [editCommitMsg, setEditCommitMsg] = useState<string>("");
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);
  
  // Delete Modal State
  const [deletingItem, setDeletingItem] = useState<RepoItem | null>(null);
  const [deleteCommitMsg, setDeleteCommitMsg] = useState<string>("");
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // References
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // --- Parse Repo URL ---
  const parseUrl = (url: string) => {
    let cleanUrl = url.trim();
    if (cleanUrl.endsWith(".git")) {
      cleanUrl = cleanUrl.substring(0, cleanUrl.length - 4);
    }
    
    try {
      const match = cleanUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (match) {
        setOwner(match[1]);
        setRepo(match[2]);
        setError(null);
        return { owner: match[1], repo: match[2] };
      }
    } catch (e) {
      // Ignored
    }
    return null;
  };

  useEffect(() => {
    parseUrl(repoUrl);
  }, [repoUrl]);

  // Handle URL change
  const handleRepoUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRepoUrl(e.target.value);
  };

  // --- Octokit Instance Helper ---
  const getOctokit = () => {
    if (!token) {
      throw new Error("GitHub Access Token is required.");
    }
    return new Octokit({ auth: token });
  };

  // --- Connect and Fetch Repository ---
  const handleConnect = async () => {
    setIsConnecting(true);
    setError(null);
    setSuccess(null);
    setIsConnected(false);
    
    const parsed = parseUrl(repoUrl);
    if (!parsed) {
      setError("Please enter a valid GitHub repository URL.");
      setIsConnecting(false);
      return;
    }

    try {
      const octokit = new Octokit({ auth: token });
      
      // Verify credentials & repo access by fetching repo details
      const repoDetails = await octokit.rest.repos.get({
        owner: parsed.owner,
        repo: parsed.repo,
      });

      // Fetch default branch if not specified
      if (repoDetails.data.default_branch) {
        setBranch(repoDetails.data.default_branch);
      }
      
      setIsConnected(true);
      setSuccess(`Successfully connected to ${parsed.owner}/${parsed.repo}!`);
      setCurrentPath("");

      // Save credentials in browser localStorage for convenient auto-load
      localStorage.setItem("github_pat_token", token);
      localStorage.setItem("github_repo_url", repoUrl);
      localStorage.setItem("github_owner", parsed.owner);
      localStorage.setItem("github_repo", parsed.repo);
      if (repoDetails.data.default_branch) {
        localStorage.setItem("github_branch", repoDetails.data.default_branch);
      }

      fetchContents(parsed.owner, parsed.repo, "", repoDetails.data.default_branch);
    } catch (err: any) {
      console.error("Connection error", err);
      setError(
        err.status === 401
          ? "Unauthorized! Please check your Personal Access Token (PAT)."
          : err.status === 404
          ? "Repository not found! Make sure the URL and token permissions are correct."
          : err.message || "Failed to connect to the repository."
      );
    } finally {
      setIsConnecting(false);
    }
  };

  // --- Disconnect and Clear Saved Credentials ---
  const handleDisconnect = () => {
    setIsConnected(false);
    setToken("");
    setRepoUrl("");
    setOwner("");
    setRepo("");
    setBranch("main");
    setItems([]);
    setUserRepos([]);
    setRepoSearchQuery("");
    
    // Clear localStorage
    localStorage.removeItem("github_pat_token");
    localStorage.removeItem("github_repo_url");
    localStorage.removeItem("github_owner");
    localStorage.removeItem("github_repo");
    localStorage.removeItem("github_branch");
    
    setSuccess("Disconnected and cleared stored credentials from your browser successfully.");
  };

  // --- Fetch User Repositories ---
  const fetchUserRepos = async (customToken = token) => {
    const trimmedToken = customToken?.trim();
    if (!trimmedToken) {
      return;
    }
    setIsLoadingRepos(true);
    try {
      const octokit = new Octokit({ auth: trimmedToken });
      
      // Fetch user's repositories (authenticated user can fetch private & public ones)
      const response = await octokit.rest.repos.listForAuthenticatedUser({
        per_page: 100,
        sort: "updated",
      });
      
      const mapped = response.data.map((item: any) => ({
        full_name: item.full_name,
        name: item.name,
        owner: item.owner.login,
        default_branch: item.default_branch || "main"
      }));
      
      setUserRepos(mapped);
    } catch (err: any) {
      console.error("Fetch repos error", err);
      // We don't overwrite global error immediately unless user manually clicked it
    } finally {
      setIsLoadingRepos(false);
    }
  };

  // --- Select a Repository and Connect Immediately ---
  const handleSelectRepository = async (repoItem: { owner: string; name: string; default_branch: string }) => {
    setOwner(repoItem.owner);
    setRepo(repoItem.name);
    setBranch(repoItem.default_branch);
    const newUrl = `https://github.com/${repoItem.owner}/${repoItem.name}.git`;
    setRepoUrl(newUrl);
    
    setIsConnecting(true);
    setError(null);
    setSuccess(null);
    setIsConnected(false);
    
    try {
      const octokit = new Octokit({ auth: token });
      
      // Verify credentials & repo access
      const repoDetails = await octokit.rest.repos.get({
        owner: repoItem.owner,
        repo: repoItem.name,
      });

      const finalBranch = repoDetails.data.default_branch || repoItem.default_branch || "main";
      setBranch(finalBranch);
      
      setIsConnected(true);
      setSuccess(`Successfully connected to ${repoItem.owner}/${repoItem.name}!`);
      setCurrentPath("");

      // Save credentials in browser localStorage for convenient auto-load
      localStorage.setItem("github_pat_token", token);
      localStorage.setItem("github_repo_url", newUrl);
      localStorage.setItem("github_owner", repoItem.owner);
      localStorage.setItem("github_repo", repoItem.name);
      localStorage.setItem("github_branch", finalBranch);

      fetchContents(repoItem.owner, repoItem.name, "", finalBranch);
    } catch (err: any) {
      console.error("Connection error to selected repo", err);
      setError(err.message || "Failed to connect to the selected repository.");
    } finally {
      setIsConnecting(false);
    }
  };

  // --- Fetch Directory Contents ---
  const fetchContents = async (
    targetOwner = owner,
    targetRepo = repo,
    path = currentPath,
    targetBranch = branch,
    showFeedback = false
  ) => {
    setLoading(true);
    setError(null);
    if (showFeedback) {
      setSuccess(null);
    }
    try {
      const octokit = getOctokit();

      const response = await octokit.rest.repos.getContent({
        owner: targetOwner,
        repo: targetRepo,
        path: path,
        ref: targetBranch,
      });

      if (Array.isArray(response.data)) {
        // Map elements
        const mappedItems: RepoItem[] = response.data.map((item: any) => ({
          name: item.name,
          path: item.path,
          sha: item.sha,
          size: item.size,
          type: item.type as "file" | "dir",
          download_url: item.download_url,
          html_url: item.html_url,
        }));
        
        // Sort: directories first, then files alphabetically
        mappedItems.sort((a, b) => {
          if (a.type !== b.type) {
            return a.type === "dir" ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });
        
        setItems(mappedItems);
        setCurrentPath(path);
        if (showFeedback) {
          setSuccess(`Repository files refreshed successfully! (${mappedItems.length} item${mappedItems.length === 1 ? '' : 's'})`);
        }
      } else {
        // If it's a single file, we handle viewing
        setError("Target path is not a directory.");
      }
    } catch (err: any) {
      console.error("Fetch contents error", err);
      // GitHub throws 404 if directory is empty or doesn't exist
      if (err.status === 404 && path !== "") {
        setItems([]);
        setCurrentPath(path);
        if (showFeedback) {
          setSuccess("Directory is empty.");
        }
      } else {
        setError(err.message || "Failed to fetch repository contents.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Trigger content refresh
  const handleRefresh = (showFeedback = false) => {
    fetchContents(owner, repo, currentPath, branch, showFeedback);
  };

  // Navigation down into a folder
  const handleFolderClick = (dirPath: string) => {
    setSuccess(null);
    setError(null);
    fetchContents(owner, repo, dirPath, branch);
  };

  // Navigation up or to specific breadcrumb
  const handleBreadcrumbClick = (path: string) => {
    setSuccess(null);
    setError(null);
    fetchContents(owner, repo, path, branch);
  };


  // --- View individual File ---
  const handleViewFile = async (item: RepoItem) => {
    setSelectedItem(item);
    setIsFileContentLoading(true);
    setSelectedFileContent("");
    setIsEditing(false);
    setEditedContent("");
    setEditCommitMsg(`Update ${item.name}`);
    setError(null);

    try {
      const octokit = getOctokit();
      const response = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: item.path,
        ref: branch,
      });

      if (!Array.isArray(response.data) && response.data.type === "file") {
        if (response.data.content) {
          const decoded = decodeBase64Utf8(response.data.content);
          setSelectedFileContent(decoded);
          setEditedContent(decoded);
        } else {
          // If content is empty (e.g. 0 byte file)
          setSelectedFileContent("");
          setEditedContent("");
        }
      }
    } catch (err: any) {
      console.error("View file error", err);
      setError(err.message || "Failed to load file contents.");
    } finally {
      setIsFileContentLoading(false);
    }
  };

  // --- Save File Changes (Update) ---
  const handleSaveEdit = async () => {
    if (!selectedItem) return;
    setIsSavingEdit(true);
    setError(null);
    setSuccess(null);

    try {
      const octokit = getOctokit();
      const base64Content = encodeBase64Utf8(editedContent);
      
      await octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: selectedItem.path,
        message: editCommitMsg || `Update ${selectedItem.name}`,
        content: base64Content,
        sha: selectedItem.sha,
        branch,
      });

      setSuccess(`Successfully updated ${selectedItem.name}!`);
      setSelectedItem(null);
      setIsEditing(false);
      handleRefresh();
    } catch (err: any) {
      console.error("Save edit error", err);
      setError(err.message || `Failed to save changes for ${selectedItem.name}.`);
    } finally {
      setIsSavingEdit(false);
    }
  };

  // --- Delete File ---
  const triggerDelete = (item: RepoItem) => {
    setDeletingItem(item);
    setDeleteCommitMsg(`Delete ${item.name}`);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingItem) return;
    setIsDeleting(true);
    setError(null);
    setSuccess(null);

    try {
      const octokit = getOctokit();
      await octokit.rest.repos.deleteFile({
        owner,
        repo,
        path: deletingItem.path,
        message: deleteCommitMsg || `Delete ${deletingItem.name}`,
        sha: deletingItem.sha,
        branch,
      });

      setSuccess(`Successfully deleted ${deletingItem.name}!`);
      setDeletingItem(null);
      handleRefresh();
    } catch (err: any) {
      console.error("Delete file error", err);
      setError(err.message || `Failed to delete ${deletingItem.name}.`);
    } finally {
      setIsDeleting(false);
    }
  };

  // --- Bulk Deletion Handlers ---
  const openBulkDeleteModal = async () => {
    setIsBulkDeleteModalOpen(true);
    setIsFetchingBulkDeleteList(true);
    setError(null);
    setBulkDeleteCommitMsg("Bulk delete selected files");
    setBulkDeleteSearchQuery("");
    
    try {
      const octokit = getOctokit();
      const treeResponse = await octokit.rest.git.getTree({
        owner,
        repo,
        tree_sha: branch,
        recursive: "true",
      });
      
      const tree = treeResponse.data.tree || [];
      // We only care about blobs (files) because directories vanish when empty in Git
      const mapped = tree
        .filter((node: any) => node.type === "blob")
        .map((node: any) => {
          // If the user already checked this item, or it's inside a checked folder in explorer:
          const isInitiallyChecked = selectedRepoPaths.includes(node.path) || 
            selectedRepoPaths.some(p => node.path === p || node.path.startsWith(p + "/"));
          
          return {
            path: node.path,
            type: "file",
            sha: node.sha,
            checked: isInitiallyChecked
          };
        });
      
      setBulkDeleteItems(mapped);
    } catch (err: any) {
      console.error("Failed to fetch recursive tree for bulk delete", err);
      setError("Failed to fetch live repository files list.");
      setIsBulkDeleteModalOpen(false);
    } finally {
      setIsFetchingBulkDeleteList(false);
    }
  };

  const handleBulkDeleteConfirm = async () => {
    const filesToDelete = bulkDeleteItems.filter(item => item.checked);
    if (filesToDelete.length === 0) {
      setError("Please check/select at least one file to delete.");
      return;
    }

    setIsBulkDeleting(true);
    setError(null);
    setSuccess(null);
    setBulkDeleteProgress({ current: 0, total: filesToDelete.length });

    try {
      const octokit = getOctokit();
      
      for (let i = 0; i < filesToDelete.length; i++) {
        const item = filesToDelete[i];
        setBulkDeleteProgress(prev => ({ ...prev, current: i + 1 }));

        await octokit.rest.repos.deleteFile({
          owner,
          repo,
          path: item.path,
          message: bulkDeleteCommitMsg || `Bulk delete ${item.path}`,
          sha: item.sha,
          branch,
        });
      }

      setSuccess(`Successfully deleted ${filesToDelete.length} file(s)!`);
      setIsBulkDeleteModalOpen(false);
      setSelectedRepoPaths([]);
      handleRefresh();
    } catch (err: any) {
      console.error("Bulk delete failure", err);
      setError(err.message || "Failed to complete some bulk deletion operations.");
    } finally {
      setIsBulkDeleting(false);
    }
  };

  // --- Create New File ---
  const handleCreateFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileName) return;
    
    setIsCreatingFile(true);
    setError(null);
    setSuccess(null);

    // Form target path
    const cleanFileName = newFileName.trim().replace(/^\//, "");
    const targetPath = currentPath 
      ? `${currentPath}/${cleanFileName}` 
      : cleanFileName;

    try {
      const octokit = getOctokit();
      const base64Content = encodeBase64Utf8(newFileContent);

      await octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: targetPath,
        message: newFileCommit || `Create ${cleanFileName}`,
        content: base64Content,
        branch,
      });

      setSuccess(`File "${cleanFileName}" created successfully!`);
      setNewFileName("");
      setNewFileContent("");
      setNewFileCommit("");
      handleRefresh();
    } catch (err: any) {
      console.error("Create file error", err);
      setError(err.message || `Failed to create file "${cleanFileName}".`);
    } finally {
      setIsCreatingFile(false);
    }
  };

  // --- Create Folder (with placeholder .gitkeep) ---
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName) return;

    setIsCreatingFolder(true);
    setError(null);
    setSuccess(null);

    const cleanFolder = newFolderName.trim().replace(/^\/|\/$/g, "");
    // Write a .gitkeep placeholder inside the target folder path
    const placeholderPath = currentPath 
      ? `${currentPath}/${cleanFolder}/.gitkeep` 
      : `${cleanFolder}/.gitkeep`;

    try {
      const octokit = getOctokit();
      const content = encodeBase64Utf8("# GitHub folder placeholder");

      await octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: placeholderPath,
        message: `Create folder ${cleanFolder}`,
        content: content,
        branch,
      });

      setSuccess(`Folder "${cleanFolder}" created with placeholder .gitkeep!`);
      setNewFolderName("");
      handleRefresh();
    } catch (err: any) {
      console.error("Create folder error", err);
      setError(err.message || `Failed to create folder "${cleanFolder}".`);
    } finally {
      setIsCreatingFolder(false);
    }
  };

  // --- Drag & Drop / File Input Handles ---
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      const entries = Array.from(e.dataTransfer.items)
        .map(item => (item as any).webkitGetAsEntry())
        .filter(entry => entry !== null);
      
      if (entries.length > 0) {
        setLoading(true);
        try {
          const filesPromises = entries.map(entry => traverseFileTree(entry));
          const filesArrays = await Promise.all(filesPromises);
          const allFiles = filesArrays.flat() as File[];
          
          if (allFiles.length > 0) {
            const topLevelName = entries[0].name || "folder";
            const commitMsg = `Upload content of folder ${topLevelName}`;
            
             const itemsToAdd: UploadingFile[] = allFiles.map((file: File) => {
              const relPath = (file as any).relativePath || file.name;
              const targetPath = currentPath ? `${currentPath}/${relPath}` : relPath;
              return {
                id: Math.random().toString(36).substring(7),
                file,
                path: targetPath,
                status: "pending",
                checked: true
              };
            });

            setUploadFiles(prev => [...prev, ...itemsToAdd]);
            if (autoUpload) {
              await uploadFilesList(itemsToAdd, commitMsg);
            } else {
              setUploadCommit(commitMsg);
            }
          }
        } catch (err: any) {
          console.error("Failed to traverse dropped items", err);
          setError("Failed to parse some dragged folders/files.");
        } finally {
          setLoading(false);
        }
        return;
      }
    }

    // Fallback to standard files if items are not available
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files) as File[];
      const commitMsg = `Upload ${files.length} file${files.length > 1 ? 's' : ''}`;
      const itemsToAdd: UploadingFile[] = files.map((file: File) => {
        const targetPath = currentPath ? `${currentPath}/${file.name}` : file.name;
        return {
          id: Math.random().toString(36).substring(7),
          file,
          path: targetPath,
          status: "pending",
          checked: true
        };
      });

      setUploadFiles(prev => [...prev, ...itemsToAdd]);
      if (autoUpload) {
        await uploadFilesList(itemsToAdd, commitMsg);
      } else {
        setUploadCommit(commitMsg);
      }
    }
  };

  const handleFileSelectChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files) as File[];
      const commitMsg = `Upload ${files.length} file${files.length > 1 ? 's' : ''}`;
      const itemsToAdd: UploadingFile[] = files.map((file: File) => {
        const targetPath = currentPath ? `${currentPath}/${file.name}` : file.name;
        return {
          id: Math.random().toString(36).substring(7),
          file,
          path: targetPath,
          status: "pending",
          checked: true
        };
      });

      setUploadFiles(prev => [...prev, ...itemsToAdd]);
      if (autoUpload) {
        await uploadFilesList(itemsToAdd, commitMsg);
      } else {
        setUploadCommit(commitMsg);
      }
      // Reset input value so same files can be selected again
      e.target.value = "";
    }
  };

  const handleFolderSelectChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files) as File[];
      const firstRel = files[0].webkitRelativePath || "";
      const folderName = firstRel.split('/')[0] || "folder";
      const commitMsg = `Upload content of folder ${folderName}`;
      
      const itemsToAdd: UploadingFile[] = files.map((file: File) => {
        let relPath = file.webkitRelativePath || file.name;
        // Strip the top level directory name if we're doing a folder selection upload
        if (relPath.includes("/")) {
          const parts = relPath.split("/");
          parts.shift(); // Remove the top-level directory folder name
          relPath = parts.join("/");
        }
        const targetPath = currentPath ? `${currentPath}/${relPath}` : relPath;
        
        return {
          id: Math.random().toString(36).substring(7),
          file,
          path: targetPath,
          status: "pending",
          checked: true
        };
      });

      setUploadFiles(prev => [...prev, ...itemsToAdd]);
      if (autoUpload) {
        await uploadFilesList(itemsToAdd, commitMsg);
      } else {
        setUploadCommit(commitMsg);
      }
      // Reset input value so same files can be selected again
      e.target.value = "";
    }
  };

  const addFilesToList = async (files: File[]) => {
    const commitMsg = `Upload ${files.length} file${files.length > 1 ? 's' : ''}`;
    const itemsToAdd: UploadingFile[] = files.map((file: File) => {
      const targetPath = currentPath ? `${currentPath}/${file.name}` : file.name;
      return {
        id: Math.random().toString(36).substring(7),
        file,
        path: targetPath,
        status: "pending",
        checked: true
      };
    });

    setUploadFiles(prev => [...prev, ...itemsToAdd]);
    if (autoUpload) {
      await uploadFilesList(itemsToAdd, commitMsg);
    } else {
      setUploadCommit(commitMsg);
    }
  };

  const handleRemoveUploadFile = (id: string) => {
    setUploadFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleClearUploadQueue = () => {
    setUploadFiles([]);
    setUploadCommit("");
  };


  // --- Optimized Bulk Upload Process ---
  const uploadFilesList = async (filesToUpload: UploadingFile[], commitMessage: string) => {
    if (filesToUpload.length === 0) return;
    setIsUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const octokit = getOctokit();
      
      // Bulk fetch the repository tree once to map existing paths -> SHAs.
      // This completely optimizes the upload process and eliminates heavy API overhead.
      const fileShaMap = new Map<string, string>();
      try {
        const treeResponse = await octokit.rest.git.getTree({
          owner,
          repo,
          tree_sha: branch,
          recursive: "true",
        });
        if (treeResponse.data.tree) {
          treeResponse.data.tree.forEach((node: any) => {
            if (node.type === "blob" && node.path && node.sha) {
              fileShaMap.set(node.path, node.sha);
            }
          });
        }
      } catch (e) {
        console.warn("Failed to fetch repository tree. Proceeding with inline fallback.", e);
      }

      let successCount = 0;
      let failureCount = 0;

      for (let i = 0; i < filesToUpload.length; i++) {
        const item = filesToUpload[i];
        
        // Update item status to 'uploading'
        setUploadFiles(prev =>
          prev.map(f => (f.id === item.id ? { ...f, status: "uploading" } : f))
        );

        try {
          const base64Content = await readFileAsBase64(item.file);
          
          // Instantly grab SHA from mapped tree cache to overwrite if necessary
          let existingSha = fileShaMap.get(item.path);

          await octokit.rest.repos.createOrUpdateFileContents({
            owner,
            repo,
            path: item.path,
            message: commitMessage || `Upload ${item.file.name}`,
            content: base64Content,
            sha: existingSha,
            branch,
          });

          // Update item status to 'success'
          setUploadFiles(prev =>
            prev.map(f => (f.id === item.id ? { ...f, status: "success" } : f))
          );
          successCount++;
        } catch (err: any) {
          console.error(`Upload failed for: ${item.file.name}`, err);
          failureCount++;
          setUploadFiles(prev =>
            prev.map(f => (
              f.id === item.id
                ? { ...f, status: "error", error: err.message || "Failed to upload" }
                : f
            ))
          );
        }
      }

      if (failureCount > 0) {
        setError(`Upload processing completed: ${successCount} file(s) uploaded, ${failureCount} file(s) failed. Check red badges below.`);
      } else {
        setSuccess(`Successfully uploaded all ${successCount} file(s)!`);
      }
    } catch (err: any) {
      console.error("Bulk upload queue error", err);
      setError(err.message || "Failed to finalize some file uploads.");
    } finally {
      setIsUploading(false);
      handleRefresh();
    }
  };

  // --- Execute Queue Uploads ---
  const handleUploadFilesQueue = async () => {
    const selectedFiles = uploadFiles.filter(f => f.checked && f.status !== "success");
    if (selectedFiles.length === 0) {
      setError("Please check/select at least one pending file to upload.");
      return;
    }
    await uploadFilesList(selectedFiles, uploadCommit);
  };

  // --- Copy File Path Helper ---
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // Visual alert or toast (handled simply here by adding success message)
    setSuccess(`Copied: "${text}" to clipboard!`);
    setTimeout(() => setSuccess(null), 3000);
  };

  // --- Breadcrumb Parts Parser ---
  const pathParts = currentPath ? currentPath.split("/") : [];

  // Filter items based on search query
  const filteredItems = items.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleToggleItemSelect = (path: string) => {
    setSelectedRepoPaths(prev =>
      prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]
    );
  };

  const allFilteredAreSelected = filteredItems.length > 0 && filteredItems.every(item => selectedRepoPaths.includes(item.path));
  const handleToggleSelectAll = () => {
    if (allFilteredAreSelected) {
      const filteredPaths = filteredItems.map(item => item.path);
      setSelectedRepoPaths(prev => prev.filter(p => !filteredPaths.includes(p)));
    } else {
      const filteredPaths = filteredItems.map(item => item.path);
      setSelectedRepoPaths(prev => {
        const union = new Set([...prev, ...filteredPaths]);
        return Array.from(union);
      });
    }
  };

  // Fetch user repositories automatically when token changes
  useEffect(() => {
    if (token && token.trim().length > 10) {
      fetchUserRepos(token);
    } else {
      setUserRepos([]);
    }
  }, [token]);

  // Keep repository search query in sync with selected repository initially
  useEffect(() => {
    if (owner && repo) {
      setRepoSearchQuery(`${owner}/${repo}`);
    }
  }, [owner, repo]);

  // Filter user repos based on search input
  const filteredRepos = (() => {
    const q = repoSearchQuery.trim().toLowerCase();
    const currentFull = `${owner}/${repo}`.toLowerCase();
    if (!q || q === currentFull) {
      return userRepos;
    }
    return userRepos.filter(item =>
      item.full_name.toLowerCase().includes(q)
    );
  })();

  // Auto connect if token and repoUrl are preset
  useEffect(() => {
    if (token && repoUrl) {
      handleConnect();
    }
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans antialiased" id="main_container">
      {/* --- Top Navigation Header --- */}
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur-md sticky top-0 z-40 px-6 py-4 flex flex-wrap items-center justify-between gap-4" id="app_header">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-slate-100 text-teal-600 rounded-lg shadow-sm border border-slate-200">
            <Github className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              GitHub RepoSutra
              <span className="text-xs bg-teal-50 text-teal-600 border border-teal-200 px-2 py-0.5 rounded-full font-mono font-medium">
                V2.0-CRUD
              </span>
            </h1>
            <p className="text-xs text-slate-500">Selected File & Folder CRUD Manager with Octokit</p>
          </div>
        </div>
        
        {/* Connection Status Indicator */}
        <div className="flex items-center gap-3 bg-slate-100 px-4 py-2 rounded-full border border-slate-200 shadow-sm">
          <div className={`h-2.5 w-2.5 rounded-full animate-pulse ${isConnected ? "bg-emerald-500" : "bg-amber-500"}`} />
          <span className="text-xs font-mono font-medium text-slate-700">
            {isConnected ? `${owner}/${repo} (${branch})` : "Disconnected"}
          </span>
          {isConnected && (
            <button
              onClick={handleDisconnect}
              title="Disconnect & clear saved credentials"
              className="text-xs text-rose-600 hover:text-rose-800 font-bold ml-2 pl-2 border-l border-slate-300 flex items-center gap-1 font-sans transition-colors active:scale-95"
            >
              <LogOut className="h-3.5 w-3.5" />
              Disconnect
            </button>
          )}
        </div>
      </header>

      {/* --- Main Dashboard --- */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 flex flex-col gap-6">
        
        {/* --- Error & Success Notifications --- */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-5 py-4 rounded-xl flex items-start gap-3 shadow-sm animate-fade-in" id="error_alert">
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div className="text-sm">
              <span className="font-semibold block mb-0.5">Operation Error:</span>
              {error}
            </div>
            <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {success && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-5 py-4 rounded-xl flex items-start gap-3 shadow-sm animate-fade-in" id="success_alert">
            <Check className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <span className="font-semibold block mb-0.5">Success:</span>
              {success}
            </div>
            <button onClick={() => setSuccess(null)} className="ml-auto text-emerald-600 hover:text-emerald-800 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* --- Repository Credentials Setup & Config --- */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm relative" id="config_card">
          <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
            <div className="absolute top-0 right-0 w-96 h-96 bg-teal-500/[0.02] rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
          </div>
          
          <div className="flex items-center gap-2 mb-5">
            <Settings className="h-4 w-4 text-teal-600" />
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Connection Settings</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-end">
            {/* GitHub PAT Input */}
            <div className="md:col-span-5 relative">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-500 block font-mono">
                  1. GITHUB PERSONAL ACCESS TOKEN (PAT)
                </label>
                {token && (
                  <button
                    type="button"
                    onClick={() => fetchUserRepos(token)}
                    className="text-[10px] text-teal-600 hover:text-teal-700 font-bold uppercase tracking-wider font-mono"
                  >
                    Refresh Repos
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  type={showToken ? "text" : "password"}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste your ghp_... token here"
                  className="w-full bg-slate-50 border border-slate-200 focus:border-teal-500 focus:bg-white focus:ring-1 focus:ring-teal-500/20 rounded-xl px-4 py-2.5 text-sm font-mono text-slate-800 outline-none transition-all pr-10 shadow-inner"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showToken ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Repo Selector / URL Input */}
            <div className="md:col-span-5 relative">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-500 block font-mono">
                  2. CHOOSE REPOSITORY {userRepos.length > 0 && `(${userRepos.length})`}
                </label>
                <button
                  type="button"
                  onClick={() => setIsManualRepo(!isManualRepo)}
                  className="text-[10px] text-teal-600 hover:text-teal-700 font-bold uppercase tracking-wider font-mono"
                >
                  {isManualRepo ? "Use List" : "Manual URL"}
                </button>
              </div>

              {!isManualRepo && userRepos.length > 0 ? (
                <div className="relative">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search or select repository..."
                      value={repoSearchQuery}
                      onChange={(e) => {
                        setRepoSearchQuery(e.target.value);
                        setIsDropdownOpen(true);
                      }}
                      onFocus={() => setIsDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setIsDropdownOpen(false), 250)}
                      className="w-full bg-slate-50 border border-slate-200 focus:border-teal-500 focus:bg-white focus:ring-1 focus:ring-teal-500/20 rounded-xl px-4 py-2.5 text-sm text-slate-800 font-mono outline-none transition-all pl-10 pr-10 shadow-inner"
                    />
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    {repoSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setRepoSearchQuery("")}
                        className="absolute right-10 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      <ChevronRight className={`h-4 w-4 transform transition-transform ${isDropdownOpen ? "rotate-90" : ""}`} />
                    </button>
                  </div>

                  {/* Dropdown list */}
                  {isDropdownOpen && (
                    <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto z-50 divide-y divide-slate-100">
                      {filteredRepos.length === 0 ? (
                        <div className="p-3 text-xs text-slate-400 text-center font-mono">
                          No matching repositories
                        </div>
                      ) : (
                        filteredRepos.map((item) => {
                          const isCurrent = owner === item.owner && repo === item.name;
                          return (
                            <button
                              key={item.full_name}
                              type="button"
                              onMouseDown={() => {
                                handleSelectRepository(item);
                                setRepoSearchQuery(item.full_name);
                                setIsDropdownOpen(false);
                              }}
                              className={`w-full text-left px-4 py-2.5 text-xs font-mono transition-colors flex items-center justify-between ${
                                isCurrent 
                                  ? "bg-teal-50 text-teal-800 font-semibold" 
                                  : "hover:bg-slate-50 text-slate-700"
                              }`}
                            >
                              <span className="truncate">{item.full_name}</span>
                              {isCurrent && <Check className="h-3.5 w-3.5 text-teal-600 shrink-0" />}
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              ) : !isManualRepo && isLoadingRepos ? (
                <div className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-500 flex items-center gap-2 font-mono h-[42px]">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-teal-600" />
                  Fetching repositories list...
                </div>
              ) : !isManualRepo && userRepos.length === 0 ? (
                <div className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 flex items-center justify-between font-mono h-[42px]">
                  <span className="text-xs text-slate-400 truncate">Enter PAT to load list</span>
                  <button
                    type="button"
                    onClick={() => fetchUserRepos(token)}
                    className="text-[10px] bg-teal-50 text-teal-600 hover:bg-teal-100 px-2.5 py-1 rounded-md border border-teal-200 font-bold font-sans uppercase shrink-0"
                  >
                    Load List
                  </button>
                </div>
              ) : (
                <input
                  type="text"
                  value={repoUrl}
                  onChange={handleRepoUrlChange}
                  placeholder="https://github.com/owner/repository"
                  className="w-full bg-slate-50 border border-slate-200 focus:border-teal-500 focus:bg-white focus:ring-1 focus:ring-teal-500/20 rounded-xl px-4 py-2.5 text-sm text-slate-800 font-mono outline-none transition-all shadow-inner"
                />
              )}
            </div>

            {/* Connect Action Button */}
            <div className="md:col-span-2">
              <button
                type="button"
                onClick={handleConnect}
                disabled={isConnecting}
                className="w-full bg-teal-600 hover:bg-teal-500 disabled:bg-teal-400/60 text-white font-bold py-2.5 px-4 rounded-xl transition-all shadow-md hover:shadow-teal-500/10 active:scale-95 disabled:pointer-events-none text-sm flex items-center justify-center gap-2"
              >
                {isConnecting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    Connect
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-4 items-center justify-between border-t border-slate-100 pt-4">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Info className="h-3.5 w-3.5 text-teal-600" />
              <span>Make sure the token has <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-teal-600">repo</code> scopes to allow files CRUD actions.</span>
            </div>
            
            {/* Quick pre-fill button for ydvaditya20-creator */}
            <div className="flex items-center gap-2">
              {(token || repoUrl) && (
                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem("github_pat_token");
                    localStorage.removeItem("github_repo_url");
                    localStorage.removeItem("github_owner");
                    localStorage.removeItem("github_repo");
                    localStorage.removeItem("github_branch");
                    setToken("");
                    setRepoUrl("");
                    setOwner("");
                    setRepo("");
                    setBranch("main");
                    setSuccess("Cleared saved credentials from your browser.");
                  }}
                  className="text-xs bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 px-3 py-1 rounded-full font-mono transition-all mr-2"
                >
                  Clear Saved
                </button>
              )}
              <span className="text-xs text-slate-400 font-medium">Quick Config:</span>
              <button
                onClick={() => {
                  setRepoUrl("https://github.com/ydvaditya20-creator/Gjh.git");
                  setSuccess("Repo URL pre-filled. Please paste your PAT token to connect.");
                }}
                className="text-xs bg-slate-100 hover:bg-slate-200 border border-slate-200 text-teal-700 px-3 py-1 rounded-full font-mono transition-all"
              >
                ydvaditya20-creator/Gjh
              </button>
            </div>
          </div>
        </div>

        {/* --- Connected Main UI Panel --- */}
        {isConnected ? (
          <div className="flex flex-col gap-6" id="connected_dashboard_wrapper">
            {/* Live Link & Quick Action Bar */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2.5 bg-teal-50 text-teal-600 rounded-xl border border-teal-200 shrink-0">
                  <Globe className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider font-mono">Live Repository Link</span>
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <a
                      href={`https://${owner.toLowerCase()}.github.io/${repo}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-mono font-bold text-teal-600 hover:text-teal-700 hover:underline truncate max-w-xs sm:max-w-md"
                      title={`https://${owner.toLowerCase()}.github.io/${repo}/`}
                    >
                      https://{owner.toLowerCase()}.github.io/{repo}/
                    </a>
                    <button
                      onClick={() => {
                        const url = `https://${owner.toLowerCase()}.github.io/${repo}/`;
                        navigator.clipboard.writeText(url);
                        setSuccess(`Copied live repository link to clipboard: ${url}`);
                      }}
                      className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors"
                      title="Copy Live URL"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <a
                      href={`https://${owner.toLowerCase()}.github.io/${repo}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-teal-600 transition-colors"
                      title="Open Live Site in New Tab"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              </div>

              {/* Tab navigation pills */}
              <div className="flex items-center bg-slate-100 p-1.5 rounded-xl border border-slate-200 gap-1.5 shrink-0 flex-wrap">
                <button
                  onClick={() => setActiveTab("files")}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                    activeTab === "files"
                      ? "bg-white text-teal-700 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Folder className="h-4 w-4 text-teal-600" />
                  Repository Files
                </button>
                <button
                  onClick={() => setActiveTab("artifact")}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                    activeTab === "artifact"
                      ? "bg-teal-600 text-white shadow-sm"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
                  }`}
                >
                  <Sparkles className="h-4 w-4" />
                  Live Artifact Screen
                  <span className="text-[10px] bg-teal-500 text-white px-1.5 py-0.5 rounded-full font-mono">
                    Live
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab("all-index")}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                    activeTab === "all-index"
                      ? "bg-slate-900 text-teal-300 shadow-sm"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
                  }`}
                  title="View all repository index.html files inside collapsible <details> tags with iframes"
                >
                  <Layers className="h-4 w-4 text-teal-400" />
                  All index.html Pages
                  <span className="text-[10px] bg-slate-800 text-teal-300 border border-teal-500/30 px-1.5 py-0.5 rounded-full font-mono">
                    &lt;details&gt;
                  </span>
                </button>
              </div>
            </div>

            {/* Tab 1: Repository Files & CRUD Manager */}
            {activeTab === "files" ? (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="dashboard_panel">
            
            {/* --- Left Column: Repository Explorer & Directory Search (Grid span 7) --- */}
            <div className="lg:col-span-7 flex flex-col gap-6" id="explorer_column">
              <div className="bg-white border border-slate-200 rounded-2xl flex flex-col shadow-sm">
                
                {/* Explorer Header */}
                <div className="px-6 py-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4 bg-slate-50/50 rounded-t-2xl">
                  <div className="flex items-center gap-2.5">
                    <Folder className="h-5 w-5 text-teal-600" />
                    <h3 className="font-bold text-slate-800">Repository Files</h3>
                  </div>

                  <div className="flex items-center gap-2.5 flex-wrap">
                    {/* Search Field */}
                    <div className="relative">
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search files..."
                        className="bg-slate-50 border border-slate-200 focus:border-teal-500 focus:bg-white rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-800 outline-none w-40 transition-all shadow-inner"
                      />
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                      {searchQuery && (
                        <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>

                    <button
                      onClick={() => handleRefresh(true)}
                      disabled={loading}
                      title="Live Refresh Files from GitHub (Bypasses Cache)"
                      className="p-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl text-slate-600 hover:text-teal-700 transition-colors disabled:opacity-40 flex items-center gap-1.5 text-xs font-medium"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-teal-600" : ""}`} />
                      <span className="hidden sm:inline">Refresh</span>
                    </button>

                    <button
                      onClick={openBulkDeleteModal}
                      title="Recursive Bulk Delete Manager"
                      className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-150 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Bulk Delete
                    </button>
                  </div>
                </div>

                {/* Explorer Path / Breadcrumbs */}
                <div className="px-6 py-3 border-b border-slate-200 bg-slate-50/30 flex items-center gap-1.5 flex-wrap font-mono text-xs overflow-x-auto whitespace-nowrap">
                  {filteredItems.length > 0 && (
                    <div className="flex items-center mr-2 pr-2 border-r border-slate-200">
                      <input
                        type="checkbox"
                        checked={allFilteredAreSelected}
                        onChange={handleToggleSelectAll}
                        title="Select/Deselect All in Directory"
                        className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 bg-white h-4 w-4 cursor-pointer"
                      />
                    </div>
                  )}

                  <button
                    onClick={() => handleBreadcrumbClick("")}
                    className="text-teal-600 hover:underline hover:text-teal-700 font-semibold"
                  >
                    root
                  </button>
                  
                  {pathParts.map((part, index) => {
                    const partialPath = pathParts.slice(0, index + 1).join("/");
                    return (
                      <React.Fragment key={partialPath}>
                        <ChevronRight className="h-3 w-3 text-slate-400 shrink-0" />
                        <button
                          onClick={() => handleBreadcrumbClick(partialPath)}
                          className={`hover:underline hover:text-teal-700 ${
                            index === pathParts.length - 1 ? "text-slate-800 font-semibold" : "text-slate-500"
                          }`}
                        >
                          {part}
                        </button>
                      </React.Fragment>
                    );
                  })}
                </div>

                {/* Bulk Select Sticky Bar */}
                {selectedRepoPaths.length > 0 && (
                  <div className="bg-red-50 border-b border-red-100 px-6 py-3.5 flex items-center justify-between text-xs animate-fade-in shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="text-red-700 font-bold font-mono bg-red-100/50 px-2 py-0.5 rounded-md">
                        {selectedRepoPaths.length}
                      </span>
                      <span className="text-slate-600 font-medium">item(s) selected from current navigation</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setSelectedRepoPaths([])}
                        className="text-slate-500 hover:text-slate-800 font-semibold transition-colors"
                      >
                        Clear Selection
                      </button>
                      <button
                        onClick={openBulkDeleteModal}
                        className="bg-red-600 hover:bg-red-500 text-white font-bold px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-all shadow-sm active:scale-95 text-xs"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete Checked ({selectedRepoPaths.length})
                      </button>
                    </div>
                  </div>
                )}

                {/* File list items table */}
                <div className="flex-1 min-h-[450px] max-h-[600px] overflow-y-auto" id="explorer_list">
                  {loading ? (
                    <div className="flex flex-col items-center justify-center h-full py-20 gap-4">
                      <RefreshCw className="h-10 w-10 text-teal-600 animate-spin" />
                      <p className="text-sm text-slate-500 font-mono">Fetching files from GitHub...</p>
                    </div>
                  ) : filteredItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center px-6">
                      <div className="p-4 bg-slate-50 rounded-full border border-slate-250 text-slate-400 mb-4">
                        {searchQuery ? <Search className="h-8 w-8" /> : <Folder className="h-8 w-8" />}
                      </div>
                      <p className="text-slate-700 font-medium text-sm">
                        {searchQuery ? "No matching files found." : "This directory is empty."}
                      </p>
                      <p className="text-slate-400 text-xs mt-1">
                        {searchQuery ? "Try searching with a different term." : "Use the right pane to create/upload files."}
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {filteredItems.map((item) => (
                        <div
                          key={item.sha}
                          className="flex items-center justify-between px-6 py-3 hover:bg-slate-50 transition-colors group"
                        >
                          {/* Left File/Dir info */}
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <input
                              type="checkbox"
                              checked={selectedRepoPaths.includes(item.path)}
                              onChange={() => handleToggleItemSelect(item.path)}
                              className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 bg-white h-4 w-4 cursor-pointer shrink-0"
                            />

                            {item.type === "dir" ? (
                              <button
                                onClick={() => handleFolderClick(item.path)}
                                className="p-1.5 bg-yellow-50 text-yellow-600 rounded-lg shrink-0 hover:bg-yellow-100 transition-colors"
                              >
                                <Folder className="h-4 w-4" />
                              </button>
                            ) : (
                              <div className="p-1.5 bg-slate-50 text-slate-500 rounded-lg border border-slate-200 shrink-0">
                                <FileIcon className="h-4 w-4" />
                              </div>
                            )}

                            <div className="min-w-0 flex-1">
                              {item.type === "dir" ? (
                                <button
                                  onClick={() => handleFolderClick(item.path)}
                                  className="font-semibold text-slate-800 hover:text-teal-600 text-sm block truncate text-left"
                                >
                                  {item.name}
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleViewFile(item)}
                                  className="font-medium text-slate-700 hover:text-teal-600 text-sm block truncate text-left font-mono"
                                >
                                  {item.name}
                                </button>
                              )}
                              <span className="text-[10px] text-slate-400 font-mono flex items-center gap-2">
                                <span>Size: {item.type === "dir" ? "--" : `${(item.size / 1024).toFixed(2)} KB`}</span>
                                <span>•</span>
                                <button
                                  onClick={() => copyToClipboard(item.path)}
                                  className="hover:text-teal-600 transition-colors font-medium"
                                  title="Copy Path"
                                >
                                  Copy Path
                                </button>
                              </span>
                            </div>
                          </div>

                          {/* Action triggers */}
                          <div className="flex items-center gap-1.5 ml-4 shrink-0 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                            {item.type === "file" && (
                              <>
                                {(item.name.toLowerCase().endsWith(".html") || item.name.toLowerCase().endsWith(".htm")) && (
                                  <button
                                    onClick={() => setActiveTab("artifact")}
                                    title="Launch in Artifact Live Screen"
                                    className="p-1.5 hover:bg-teal-50 text-teal-600 hover:text-teal-700 border border-transparent hover:border-teal-200 rounded-lg transition-all"
                                  >
                                    <Sparkles className="h-4 w-4" />
                                  </button>
                                )}
                                {item.name.toLowerCase() === "index.html" && (
                                  <button
                                    onClick={() => setActiveTab("all-index")}
                                    title="Open in All index.html <details> View"
                                    className="p-1.5 hover:bg-slate-100 text-teal-600 hover:text-teal-700 border border-transparent hover:border-slate-200 rounded-lg transition-all"
                                  >
                                    <Layers className="h-4 w-4" />
                                  </button>
                                )}
                                <button
                                  onClick={() => handleViewFile(item)}
                                  title="View File"
                                  className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-teal-600 border border-transparent hover:border-slate-200 rounded-lg transition-all"
                                >
                                  <Eye className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => {
                                    handleViewFile(item);
                                    setTimeout(() => setIsEditing(true), 300);
                                  }}
                                  title="Edit File"
                                  className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-amber-600 border border-transparent hover:border-slate-200 rounded-lg transition-all"
                                >
                                  <Edit3 className="h-4 w-4" />
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => triggerDelete(item)}
                              title="Delete Item"
                              className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-rose-600 border border-transparent hover:border-slate-200 rounded-lg transition-all"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/50 rounded-b-2xl flex items-center justify-between text-xs text-slate-500">
                  <span>Showing {filteredItems.length} items</span>
                  <span>Branch: <code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-slate-600">{branch}</code></span>
                </div>
              </div>
            </div>            {/* --- Right Column: Creator and Uploader Widgets (Grid span 5) --- */}
            <div className="lg:col-span-5 flex flex-col gap-6" id="creator_column">
              
              {/* --- SECTION 1: Selected File Upload Zone (Create CRUD Component) --- */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm relative overflow-hidden">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Upload className="h-4.5 w-4.5 text-teal-600" />
                    <h3 className="font-bold text-slate-800">Upload File / Folder</h3>
                  </div>
                  
                  {uploadFiles.length > 0 && (
                    <button
                      onClick={handleClearUploadQueue}
                      className="text-xs text-rose-600 hover:text-rose-700 font-bold underline"
                    >
                      Clear Queue
                    </button>
                  )}
                </div>

                {/* Upload drag & drop zone */}
                <div
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                    isDragActive
                      ? "border-teal-500 bg-teal-50"
                      : "border-slate-200 hover:border-slate-300 bg-slate-50/50"
                  }`}
                >
                  <Upload className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-700">Drag & Drop files here, or <span className="text-teal-600 hover:underline">browse</span></p>
                  <p className="text-xs text-slate-400 mt-1">Supports uploading files directly to current folder</p>
                  
                  {/* Native triggers hidden */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={handleFileSelectChange}
                  />
                </div>

                 {/* Webkit Directory/Folder Upload Trigger */}
                <div className="mt-3 flex flex-col gap-3">
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => folderInputRef.current?.click()}
                      className="w-full bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 text-xs py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-2 font-medium"
                    >
                      <FolderPlus className="h-3.5 w-3.5 text-yellow-600" />
                      Select Folder to Upload
                    </button>
                    <input
                      ref={folderInputRef}
                      type="file"
                      className="hidden"
                      {...({ webkitdirectory: "", directory: "" } as any)}
                      multiple
                      onChange={handleFolderSelectChange}
                    />
                  </div>

                  <div className="flex items-center gap-2 bg-slate-50/50 p-2.5 rounded-xl border border-slate-200">
                    <input
                      type="checkbox"
                      id="auto_upload_toggle"
                      checked={autoUpload}
                      onChange={(e) => setAutoUpload(e.target.checked)}
                      className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 bg-white h-4 w-4 cursor-pointer"
                    />
                    <label htmlFor="auto_upload_toggle" className="text-xs text-slate-600 select-none cursor-pointer font-semibold flex-1">
                      Auto-upload immediately on selection
                    </label>
                  </div>
                </div>

                {/* Upload List & Action triggers */}
                {uploadFiles.length > 0 && (
                  <div className="mt-5 border-t border-slate-100 pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider font-mono">
                          Upload Queue ({uploadFiles.length})
                        </h4>
                        <span className="text-slate-300">|</span>
                        <button
                          onClick={() => {
                            const allChecked = uploadFiles.every(f => f.checked);
                            setUploadFiles(prev => prev.map(f => ({ ...f, checked: !allChecked })));
                          }}
                          className="text-[10px] text-teal-600 hover:text-teal-700 font-bold underline"
                        >
                          {uploadFiles.every(f => f.checked) ? "Deselect All" : "Select All"}
                        </button>
                      </div>
                      {isUploading && (
                        <span className="text-xs text-teal-600 font-mono flex items-center gap-1">
                          <RefreshCw className="h-3 w-3 animate-spin" />
                          {uploadFiles.filter(f => f.status === "success").length} / {uploadFiles.length} Done
                        </span>
                      )}
                    </div>
                    
                    {/* Files Item Queue display list */}
                    <div className="max-h-40 overflow-y-auto space-y-2 mb-4 pr-1">
                      {uploadFiles.map((item) => (
                        <div
                          key={item.id}
                          className="bg-slate-50 border border-slate-200 rounded-lg p-2 flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="flex items-center gap-2 shrink-0">
                            <input
                              type="checkbox"
                              checked={item.checked}
                              disabled={item.status === "success" || item.status === "uploading"}
                              onChange={() => {
                                setUploadFiles(prev =>
                                  prev.map(f => (f.id === item.id ? { ...f, checked: !f.checked } : f))
                                );
                              }}
                              className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 bg-white h-4 w-4 cursor-pointer"
                            />
                          </div>

                          <div className="min-w-0 flex-1">
                            <span className="font-semibold text-slate-800 block truncate font-mono">
                              {item.file.name}
                            </span>
                            <span className="text-[10px] text-slate-400 block truncate font-mono">
                              Path: {item.path} ({(item.file.size / 1024).toFixed(1)} KB)
                            </span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {item.status === "pending" && (
                              <span className="text-[10px] bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-slate-500">
                                Pending
                              </span>
                            )}
                            {item.status === "uploading" && (
                              <span className="text-[10px] bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded text-teal-600 animate-pulse font-medium">
                                Uploading
                              </span>
                            )}
                            {item.status === "success" && (
                              <span className="text-[10px] bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded text-emerald-600 flex items-center gap-0.5 font-semibold">
                                <Check className="h-2.5 w-2.5" /> Success
                              </span>
                            )}
                            {item.status === "error" && (
                              <span className="text-[10px] bg-red-50 border border-red-200 px-1.5 py-0.5 rounded text-red-600" title={item.error}>
                                Failed
                              </span>
                            )}

                            {item.status === "pending" && (
                              <button
                                onClick={() => handleRemoveUploadFile(item.id)}
                                className="text-slate-400 hover:text-rose-600 transition-colors"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Commit input details */}
                    <div className="space-y-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 block mb-1 font-mono">
                          COMMIT MESSAGE
                        </label>
                        <input
                          type="text"
                          value={uploadCommit}
                          onChange={(e) => setUploadCommit(e.target.value)}
                          placeholder="e.g. Add dataset and configs"
                          className="w-full bg-slate-50 border border-slate-200 focus:border-teal-500 focus:bg-white rounded-lg px-3 py-1.5 text-xs text-slate-800 outline-none shadow-inner"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={handleUploadFilesQueue}
                        disabled={isUploading}
                        className="w-full bg-teal-600 hover:bg-teal-500 disabled:bg-teal-400/60 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95"
                      >
                        {isUploading ? (
                          <>
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            Uploading Files...
                          </>
                        ) : (
                          <>
                            <Upload className="h-3.5 w-3.5" />
                            Commit & Upload {uploadFiles.filter(f => f.checked).length} selected file(s)
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* --- SECTION 2: Create a New Empty File --- */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <Plus className="h-4.5 w-4.5 text-teal-600" />
                  <h3 className="font-bold text-slate-800">Create New File</h3>
                </div>

                <form onSubmit={handleCreateFile} className="space-y-4">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 block mb-1 font-mono">
                      FILE NAME / NESTED PATH
                    </label>
                    <input
                      type="text"
                      value={newFileName}
                      onChange={(e) => setNewFileName(e.target.value)}
                      placeholder="e.g. index.html or docs/readme.md"
                      required
                      className="w-full bg-slate-50 border border-slate-200 focus:border-teal-500 focus:bg-white rounded-xl px-3 py-2 text-xs text-slate-800 outline-none font-mono shadow-inner"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 block mb-1 font-mono">
                      FILE CONTENT (RAW CODE)
                    </label>
                    <textarea
                      rows={4}
                      value={newFileContent}
                      onChange={(e) => setNewFileContent(e.target.value)}
                      placeholder="Write your HTML or JS/TS code here..."
                      className="w-full bg-slate-50 border border-slate-200 focus:border-teal-500 focus:bg-white rounded-xl px-3 py-2 text-xs text-slate-800 font-mono outline-none resize-y shadow-inner"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 block mb-1 font-mono">
                      COMMIT MESSAGE
                    </label>
                    <input
                      type="text"
                      value={newFileCommit}
                      onChange={(e) => setNewFileCommit(e.target.value)}
                      placeholder="e.g. Create index.html entry point"
                      className="w-full bg-slate-50 border border-slate-200 focus:border-teal-500 focus:bg-white rounded-xl px-3 py-2 text-xs text-slate-800 outline-none shadow-inner"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isCreatingFile}
                    className="w-full bg-slate-100 hover:bg-slate-200 border border-slate-200 text-teal-700 hover:text-teal-800 font-bold py-2.5 px-4 rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-sm"
                  >
                    {isCreatingFile ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        Creating File...
                      </>
                    ) : (
                      <>
                        <FileText className="h-3.5 w-3.5" />
                        Create File
                      </>
                    )}
                  </button>
                </form>
              </div>

              {/* --- SECTION 3: Create New Empty Folder --- */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <FolderPlus className="h-4.5 w-4.5 text-teal-600" />
                  <h3 className="font-bold text-slate-800">Create Folder</h3>
                </div>

                <form onSubmit={handleCreateFolder} className="space-y-4">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 block mb-1 font-mono">
                      FOLDER NAME
                    </label>
                    <input
                      type="text"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      placeholder="e.g. assets, components"
                      required
                      className="w-full bg-slate-50 border border-slate-200 focus:border-teal-500 focus:bg-white rounded-xl px-3 py-2 text-xs text-slate-800 outline-none shadow-inner"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isCreatingFolder}
                    className="w-full bg-slate-100 hover:bg-slate-200 border border-slate-200 text-teal-700 hover:text-teal-800 font-bold py-2.5 px-4 rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-sm"
                  >
                    {isCreatingFolder ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Folder className="h-3.5 w-3.5" />
                        Create Folder
                      </>
                    )}
                  </button>
                </form>
              </div>

            </div>
          </div>
            ) : activeTab === "artifact" ? (
              /* Tab 2: Live Web Artifact Screen */
              <ArtifactScreen
                owner={owner}
                repo={repo}
                branch={branch}
                token={token}
                getOctokit={getOctokit}
                onRefreshFiles={() => handleRefresh(true)}
              />
            ) : (
              /* Tab 3: All index.html Stack in <details> tags (with Blank Target Page) */
              <AllIndexPagesViewer
                owner={owner}
                repo={repo}
                branch={branch}
                token={token}
                getOctokit={getOctokit}
              />
            )}
          </div>
        ) : (
          /* --- Standby state (Not connected) --- */
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm max-w-2xl mx-auto my-12" id="disconnected_placeholder">
            <div className="p-4 bg-slate-50 rounded-full border border-slate-200 text-teal-600 inline-block mb-4 shadow-sm">
              <Github className="h-10 w-10 animate-pulse" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">Configure and Connect to Start</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto mb-6 font-medium">
              Enter your GitHub Personal Access Token (PAT) and the Repository URL in the settings panel above to explore, write, update, or delete files directly in your repo.
            </p>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl max-w-sm mx-auto text-left space-y-2 shadow-inner">
              <div className="text-xs font-bold text-slate-500 font-mono uppercase tracking-wider">Default preset parameters:</div>
              <div className="text-xs text-slate-600 font-mono overflow-x-auto whitespace-nowrap">
                <span className="text-teal-600 font-bold">Repo:</span> ydvaditya20-creator/Gjh
              </div>
              <div className="text-xs text-slate-600 font-mono overflow-x-auto whitespace-nowrap">
                <span className="text-teal-600 font-bold">Token:</span> [Enter your Personal Access Token]
              </div>
            </div>
          </div>
        )}

      </main>

      {/* --- Overlay Modals (Extracted for cleaner architecture) --- */}
      <FileViewerModal
        selectedItem={selectedItem}
        selectedFileContent={selectedFileContent}
        isFileContentLoading={isFileContentLoading}
        isEditing={isEditing}
        editedContent={editedContent}
        editCommitMsg={editCommitMsg}
        isSavingEdit={isSavingEdit}
        setSelectedItem={setSelectedItem}
        setIsEditing={setIsEditing}
        setEditedContent={setEditedContent}
        setEditCommitMsg={setEditCommitMsg}
        handleSaveEdit={handleSaveEdit}
        copyToClipboard={copyToClipboard}
      />

      <DeleteConfirmationModal
        deletingItem={deletingItem}
        deleteCommitMsg={deleteCommitMsg}
        isDeleting={isDeleting}
        setDeletingItem={setDeletingItem}
        setDeleteCommitMsg={setDeleteCommitMsg}
        handleDeleteConfirm={handleDeleteConfirm}
        isBulkDeleteModalOpen={isBulkDeleteModalOpen}
        isFetchingBulkDeleteList={isFetchingBulkDeleteList}
        isBulkDeleting={isBulkDeleting}
        bulkDeleteItems={bulkDeleteItems}
        bulkDeleteSearchQuery={bulkDeleteSearchQuery}
        bulkDeleteCommitMsg={bulkDeleteCommitMsg}
        bulkDeleteProgress={bulkDeleteProgress}
        setIsBulkDeleteModalOpen={setIsBulkDeleteModalOpen}
        setBulkDeleteSearchQuery={setBulkDeleteSearchQuery}
        setBulkDeleteItems={setBulkDeleteItems}
        setBulkDeleteCommitMsg={setBulkDeleteCommitMsg}
        handleBulkDeleteConfirm={handleBulkDeleteConfirm}
      />

      {/* --- Footer bar --- */}
      <footer className="border-t border-slate-200 bg-slate-50 py-6 text-center px-6">
        <p className="text-xs text-slate-400 font-mono">
          Built with React, Octokit, & Tailwind CSS • Port 3000 Ingress Ready
        </p>
      </footer>
    </div>
  );
}

