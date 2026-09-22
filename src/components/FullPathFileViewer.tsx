/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import {
  FolderTree,
  FileCode,
  Folder,
  Search,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  Eye,
  Trash2,
  Download,
  GitBranch,
  Filter,
  ArrowUpDown,
  FileText,
  Layers,
  ChevronRight,
  ChevronDown,
  Sparkles,
  File,
  Code2,
  FileType,
  Database,
  Image as ImageIcon,
  CheckSquare,
  Square,
  Share2
} from "lucide-react";
import { Octokit } from "octokit";
import { RepoItem } from "../utils/githubHelpers";

export interface FlatFileNode {
  path: string;
  name: string;
  directory: string;
  sha: string;
  size: number;
  type: "file" | "dir";
  extension: string;
  depth: number;
}

interface FullPathFileViewerProps {
  owner: string;
  repo: string;
  branch: string;
  token?: string;
  getOctokit: () => Octokit;
  onViewFile?: (item: RepoItem) => void;
  onDeleteFile?: (item: RepoItem) => void;
  onNavigateToFolder?: (folderPath: string) => void;
}

export const FullPathFileViewer: React.FC<FullPathFileViewerProps> = ({
  owner,
  repo,
  branch: initialBranch,
  token,
  getOctokit,
  onViewFile,
  onDeleteFile,
  onNavigateToFolder,
}) => {
  // Branch State
  const [selectedBranch, setSelectedBranch] = useState<string>(initialBranch || "main");
  const [availableBranches, setAvailableBranches] = useState<string[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState<boolean>(false);

  // Tree & Files State
  const [allFiles, setAllFiles] = useState<FlatFileNode[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<string>("");

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedExt, setSelectedExt] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<"path-asc" | "path-desc" | "size-desc" | "size-asc" | "ext">("path-asc");
  const [viewMode, setViewMode] = useState<"flat" | "tree">("flat");
  const [treeExpanded, setTreeExpanded] = useState<Record<string, boolean>>({});

  // UI feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState<boolean>(false);

  // Sync selectedBranch if initialBranch changes
  useEffect(() => {
    if (initialBranch && initialBranch !== selectedBranch) {
      setSelectedBranch(initialBranch);
    }
  }, [initialBranch]);

  // Fetch available repository branches
  const fetchBranches = async () => {
    if (!owner || !repo) return;
    setIsLoadingBranches(true);
    try {
      const octokit = getOctokit();
      const res = await octokit.rest.repos.listBranches({
        owner,
        repo,
        per_page: 100,
      });
      const names = res.data.map((b: any) => b.name);
      setAvailableBranches(names);
    } catch (e) {
      console.warn("Could not list branches for full path viewer:", e);
    } finally {
      setIsLoadingBranches(false);
    }
  };

  useEffect(() => {
    fetchBranches();
  }, [owner, repo]);

  // Fetch complete recursive file list with full paths
  const fetchFullPathFiles = async () => {
    if (!owner || !repo) return;
    setIsLoading(true);
    setError(null);
    setScanStatus(`Resolving commit tree for branch "${selectedBranch}"...`);

    try {
      const octokit = getOctokit();

      // Step 1: Resolve commit tree SHA for branch to prevent 404/422 git tree failures
      let resolvedTreeSha = selectedBranch;
      try {
        const branchInfo = await octokit.rest.repos.getBranch({
          owner,
          repo,
          branch: selectedBranch,
        });
        if (branchInfo.data?.commit?.commit?.tree?.sha) {
          resolvedTreeSha = branchInfo.data.commit.commit.tree.sha;
        } else if (branchInfo.data?.commit?.sha) {
          resolvedTreeSha = branchInfo.data.commit.sha;
        }
      } catch (bErr) {
        console.warn("Could not resolve branch tree sha, fallback to branch name directly", bErr);
      }

      setScanStatus("Fetching complete recursive git tree...");
      const treeResponse = await octokit.rest.git.getTree({
        owner,
        repo,
        tree_sha: resolvedTreeSha,
        recursive: "1",
      });

      const nodes = treeResponse.data.tree || [];

      // Filter only blobs (files) with valid paths
      const fileNodes: FlatFileNode[] = nodes
        .filter((node: any) => node.type === "blob" && node.path)
        .map((node: any) => {
          const pathStr = node.path as string;
          const lastSlash = pathStr.lastIndexOf("/");
          const directory = lastSlash !== -1 ? pathStr.substring(0, lastSlash) : "";
          const name = lastSlash !== -1 ? pathStr.substring(lastSlash + 1) : pathStr;
          const extMatch = name.match(/\.([0-9a-z_-]+)$/i);
          const extension = extMatch ? extMatch[1].toLowerCase() : "none";
          const depth = pathStr.split("/").length - 1;

          return {
            path: pathStr,
            name,
            directory,
            sha: node.sha,
            size: node.size || 0,
            type: "file",
            extension,
            depth,
          };
        });

      setAllFiles(fileNodes);
      setScanStatus(`Loaded ${fileNodes.length} files with full paths.`);

      // Expand first-level folders in tree view by default
      const defaultExpanded: Record<string, boolean> = { "": true };
      fileNodes.forEach((f) => {
        if (f.directory) {
          const topFolder = f.directory.split("/")[0];
          defaultExpanded[topFolder] = true;
        }
      });
      setTreeExpanded(defaultExpanded);
    } catch (err: any) {
      console.error("Error fetching full path files:", err);
      setError(err.message || "Failed to fetch repository files list.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchFullPathFiles();
  }, [owner, repo, selectedBranch]);

  // Calculate statistics & extensions breakdown
  const stats = useMemo(() => {
    const totalFiles = allFiles.length;
    let totalBytes = 0;
    const dirSet = new Set<string>();
    const extCountMap: Record<string, number> = {};

    allFiles.forEach((f) => {
      totalBytes += f.size;
      if (f.directory) {
        dirSet.add(f.directory);
        // Add parent paths as well
        const parts = f.directory.split("/");
        let acc = "";
        parts.forEach((p) => {
          acc = acc ? `${acc}/${p}` : p;
          dirSet.add(acc);
        });
      }
      extCountMap[f.extension] = (extCountMap[f.extension] || 0) + 1;
    });

    // Top extensions sorted by count
    const topExtensions = Object.entries(extCountMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    return {
      totalFiles,
      totalDirectories: dirSet.size,
      totalBytes,
      topExtensions,
    };
  }, [allFiles]);

  // Filter & Sort
  const filteredFiles = useMemo(() => {
    let result = [...allFiles];

    // Filter by search query (matches anywhere in full path)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (f) =>
          f.path.toLowerCase().includes(q) ||
          f.name.toLowerCase().includes(q) ||
          f.extension.toLowerCase().includes(q)
      );
    }

    // Filter by extension
    if (selectedExt !== "ALL") {
      result = result.filter((f) => f.extension === selectedExt);
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === "path-asc") {
        return a.path.localeCompare(b.path);
      }
      if (sortBy === "path-desc") {
        return b.path.localeCompare(a.path);
      }
      if (sortBy === "size-desc") {
        return b.size - a.size;
      }
      if (sortBy === "size-asc") {
        return a.size - b.size;
      }
      if (sortBy === "ext") {
        return a.extension.localeCompare(b.extension) || a.path.localeCompare(b.path);
      }
      return 0;
    });

    return result;
  }, [allFiles, searchQuery, selectedExt, sortBy]);

  // Format bytes helper
  const formatSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Extension Badge styling & icon helper
  const getExtDetails = (ext: string) => {
    switch (ext) {
      case "html":
      case "htm":
        return { color: "bg-amber-50 text-amber-700 border-amber-200", icon: FileCode };
      case "ts":
      case "tsx":
        return { color: "bg-blue-50 text-blue-700 border-blue-200", icon: Code2 };
      case "js":
      case "jsx":
        return { color: "bg-yellow-50 text-yellow-800 border-yellow-200", icon: Code2 };
      case "css":
      case "scss":
      case "sass":
        return { color: "bg-indigo-50 text-indigo-700 border-indigo-200", icon: FileType };
      case "json":
        return { color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: Database };
      case "md":
      case "txt":
        return { color: "bg-slate-100 text-slate-700 border-slate-200", icon: FileText };
      case "png":
      case "jpg":
      case "jpeg":
      case "svg":
      case "webp":
      case "gif":
        return { color: "bg-pink-50 text-pink-700 border-pink-200", icon: ImageIcon };
      default:
        return { color: "bg-slate-100 text-slate-600 border-slate-200", icon: File };
    }
  };

  // Copy single path
  const copySinglePath = (path: string) => {
    navigator.clipboard.writeText(path);
    setCopiedId(path);
    setTimeout(() => setCopiedId(null), 2500);
  };

  // Copy all visible full paths (one per line)
  const copyAllPaths = () => {
    const text = filteredFiles.map((f) => f.path).join("\n");
    navigator.clipboard.writeText(text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2500);
  };

  // Export as text file
  const exportAsText = () => {
    const text = filteredFiles.map((f) => f.path).join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${repo}-file-paths-${selectedBranch}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export as JSON file
  const exportAsJson = () => {
    const json = JSON.stringify(
      filteredFiles.map((f) => ({
        path: f.path,
        name: f.name,
        directory: f.directory,
        size: f.size,
        extension: f.extension,
        sha: f.sha,
      })),
      null,
      2
    );
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${repo}-files-tree-${selectedBranch}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Convert FlatFileNode to RepoItem for opening in modal or delete
  const nodeToRepoItem = (node: FlatFileNode): RepoItem => ({
    name: node.name,
    path: node.path,
    sha: node.sha,
    size: node.size,
    type: "file",
    download_url: `https://raw.githubusercontent.com/${owner}/${repo}/${selectedBranch}/${node.path}`,
    html_url: `https://github.com/${owner}/${repo}/blob/${selectedBranch}/${node.path}`,
  });

  // Tree Mode Builder: Group files into directory map
  const treeGroups = useMemo<Record<string, FlatFileNode[]>>(() => {
    const groups: Record<string, FlatFileNode[]> = {};
    if (viewMode !== "tree") return groups;
    filteredFiles.forEach((f) => {
      const dir = f.directory || "(root)";
      if (!groups[dir]) groups[dir] = [];
      groups[dir].push(f);
    });
    return groups;
  }, [filteredFiles, viewMode]);

  return (
    <div className="flex flex-col gap-6" id="full_path_file_viewer">
      {/* --- Top Banner & Quick Controls --- */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl p-6 shadow-md border border-slate-700 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="p-2.5 bg-indigo-500/20 text-indigo-300 rounded-xl border border-indigo-500/30">
                <FolderTree className="h-6 w-6" />
              </span>
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2 flex-wrap">
                  Repository Full Path Explorer
                  <span className="text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2.5 py-0.5 rounded-full font-mono">
                    {allFiles.length} Total Files
                  </span>
                </h3>
                <p className="text-xs text-slate-300">
                  Recursive view of all repository files with complete relative paths, file sizes, SHA signatures, and quick copy/export tools.
                </p>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2.5 flex-wrap shrink-0">
            <button
              onClick={copyAllPaths}
              disabled={filteredFiles.length === 0}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 transition-all shadow-md active:scale-95 disabled:opacity-50"
              title="Copy all currently filtered full paths as newline separated list"
            >
              {copiedAll ? (
                <>
                  <Check className="h-4 w-4 text-emerald-300" />
                  Copied All Paths!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy All Full Paths
                </>
              )}
            </button>

            <button
              onClick={exportAsText}
              disabled={filteredFiles.length === 0}
              className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-white px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition-all"
              title="Download file paths as .txt file"
            >
              <Download className="h-3.5 w-3.5 text-indigo-400" />
              Export .TXT
            </button>

            <button
              onClick={exportAsJson}
              disabled={filteredFiles.length === 0}
              className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-white px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition-all"
              title="Download file tree metadata as .json file"
            >
              <Database className="h-3.5 w-3.5 text-teal-400" />
              Export .JSON
            </button>

            <button
              onClick={fetchFullPathFiles}
              disabled={isLoading}
              className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-white px-3 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition-all"
              title="Rescan and refresh all repository files"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin text-indigo-400" : ""}`} />
            </button>
          </div>
        </div>

        {/* --- Branch Selector & Stats Bar --- */}
        <div className="mt-5 pt-4 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {/* Branch Picker */}
          <div className="flex items-center gap-2 bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-2">
            <GitBranch className="h-4 w-4 text-indigo-400 shrink-0" />
            <span className="text-slate-400 text-xs font-mono">Branch:</span>
            {availableBranches.length > 0 ? (
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="bg-transparent text-white font-mono text-xs outline-none flex-1 cursor-pointer font-bold"
              >
                {availableBranches.map((b) => (
                  <option key={b} value={b} className="bg-slate-900 text-white">
                    {b}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="bg-transparent text-white font-mono text-xs outline-none flex-1 font-bold"
              />
            )}
          </div>

          {/* Stat 1: Total Directories */}
          <div className="flex items-center gap-2.5 bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-2">
            <Folder className="h-4 w-4 text-amber-400 shrink-0" />
            <div className="flex flex-col">
              <span className="text-slate-400 text-[10px]">Folders / Subdirs</span>
              <span className="font-mono font-bold text-white text-xs">{stats.totalDirectories} directories</span>
            </div>
          </div>

          {/* Stat 2: Total Repo Size */}
          <div className="flex items-center gap-2.5 bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-2">
            <Layers className="h-4 w-4 text-teal-400 shrink-0" />
            <div className="flex flex-col">
              <span className="text-slate-400 text-[10px]">Total File Size</span>
              <span className="font-mono font-bold text-white text-xs">{formatSize(stats.totalBytes)}</span>
            </div>
          </div>

          {/* Stat 3: Matching filter count */}
          <div className="flex items-center gap-2.5 bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-2">
            <Filter className="h-4 w-4 text-pink-400 shrink-0" />
            <div className="flex flex-col">
              <span className="text-slate-400 text-[10px]">Filtered Results</span>
              <span className="font-mono font-bold text-white text-xs">
                {filteredFiles.length} of {allFiles.length} files
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* --- Filter & View Toolbar --- */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by full path, folder, or file name (e.g. src/components, .css, main.tsx)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-9 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-mono"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs p-1"
              >
                ✕
              </button>
            )}
          </div>

          {/* Right Toolbar Controls */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Sort Dropdown */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs">
              <ArrowUpDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <span className="text-slate-500 text-[11px]">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-transparent text-slate-700 font-medium outline-none cursor-pointer text-xs"
              >
                <option value="path-asc">Path (A → Z)</option>
                <option value="path-desc">Path (Z → A)</option>
                <option value="size-desc">Size (Largest first)</option>
                <option value="size-asc">Size (Smallest first)</option>
                <option value="ext">File Extension</option>
              </select>
            </div>

            {/* View Mode Toggle: Flat List vs Tree */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 gap-1 text-xs">
              <button
                onClick={() => setViewMode("flat")}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                  viewMode === "flat"
                    ? "bg-white text-indigo-700 shadow-xs font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                title="View as a flat full path list"
              >
                <FileText className="h-3.5 w-3.5" />
                Full Paths
              </button>
              <button
                onClick={() => setViewMode("tree")}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                  viewMode === "tree"
                    ? "bg-white text-indigo-700 shadow-xs font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
                title="View grouped by folders"
              >
                <FolderTree className="h-3.5 w-3.5" />
                Folder Tree
              </button>
            </div>
          </div>
        </div>

        {/* Extension Filter Chips */}
        {stats.topExtensions.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-slate-100">
            <span className="text-[11px] text-slate-400 font-medium mr-1 flex items-center gap-1">
              <Filter className="h-3 w-3" />
              Extensions:
            </span>
            <button
              onClick={() => setSelectedExt("ALL")}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-mono transition-all ${
                selectedExt === "ALL"
                  ? "bg-slate-900 text-white font-bold"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              All ({allFiles.length})
            </button>
            {stats.topExtensions.map(([ext, count]) => (
              <button
                key={ext}
                onClick={() => setSelectedExt(selectedExt === ext ? "ALL" : ext)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-mono transition-all flex items-center gap-1 ${
                  selectedExt === ext
                    ? "bg-indigo-600 text-white font-bold shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <span>.{ext}</span>
                <span className="text-[10px] opacity-75">({count})</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* --- Loading State --- */}
      {isLoading && (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-xs flex flex-col items-center justify-center gap-3">
          <RefreshCw className="h-8 w-8 text-indigo-600 animate-spin" />
          <p className="text-sm font-semibold text-slate-800 font-mono">
            {scanStatus || "Scanning recursive repository tree..."}
          </p>
          <span className="text-xs text-slate-500">
            Fetching complete file paths for branch <code className="text-indigo-600 font-mono font-bold">{selectedBranch}</code>
          </span>
        </div>
      )}

      {/* --- Error State --- */}
      {error && !isLoading && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center text-red-700 space-y-3">
          <p className="font-bold text-sm">Failed to load repository file paths</p>
          <p className="text-xs text-red-600 font-mono">{error}</p>
          <button
            onClick={fetchFullPathFiles}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold font-mono transition-colors"
          >
            Retry Fetching Files
          </button>
        </div>
      )}

      {/* --- Empty State --- */}
      {!isLoading && !error && filteredFiles.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-xs space-y-3 max-w-lg mx-auto">
          <FolderTree className="h-10 w-10 text-slate-300 mx-auto" />
          <h4 className="font-bold text-slate-800 text-sm">No files found matching criteria</h4>
          <p className="text-xs text-slate-500">
            {searchQuery
              ? `No file path matched "${searchQuery}". Try clearing search or selecting "All" extensions.`
              : "Repository appears to be empty on this branch."}
          </p>
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery("");
                setSelectedExt("ALL");
              }}
              className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* --- View Mode 1: Flat Full-Path List Table --- */}
      {!isLoading && !error && filteredFiles.length > 0 && viewMode === "flat" && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden flex flex-col">
          {/* Table Header */}
          <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-bold text-slate-500 uppercase tracking-wider">
            <div className="flex items-center gap-2">
              <span>Full Path & File Name</span>
              <span className="font-mono text-[10px] text-slate-400 lowercase font-normal">
                ({filteredFiles.length} files)
              </span>
            </div>
            <div className="flex items-center gap-8">
              <span className="hidden sm:inline-block">Size</span>
              <span className="hidden md:inline-block">SHA</span>
              <span>Actions</span>
            </div>
          </div>

          {/* List Rows */}
          <div className="divide-y divide-slate-100">
            {filteredFiles.map((file, idx) => {
              const extDetail = getExtDetails(file.extension);
              const ExtIcon = extDetail.icon;
              const isCopied = copiedId === file.path;

              return (
                <div
                  key={file.path}
                  className="px-5 py-3 hover:bg-indigo-50/40 transition-colors flex items-center justify-between gap-4 group text-xs"
                >
                  {/* Left: Extension Icon + Path Structure */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="text-[11px] font-mono text-slate-400 w-7 shrink-0 text-right">
                      {idx + 1}.
                    </span>

                    <div
                      className={`p-1.5 rounded-lg border shrink-0 ${extDetail.color}`}
                      title={`.${file.extension}`}
                    >
                      <ExtIcon className="h-4 w-4" />
                    </div>

                    <div className="min-w-0 flex-1">
                      {/* Full Path with highlighted filename */}
                      <div className="flex items-center gap-1.5 flex-wrap font-mono text-xs">
                        {file.directory ? (
                          <>
                            <span className="text-slate-400 group-hover:text-slate-500 transition-colors">
                              {file.directory}/
                            </span>
                            <strong className="text-slate-900 group-hover:text-indigo-600 transition-colors">
                              {file.name}
                            </strong>
                          </>
                        ) : (
                          <strong className="text-slate-900 group-hover:text-indigo-600 transition-colors">
                            {file.name}
                          </strong>
                        )}

                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded border font-mono ${extDetail.color}`}
                        >
                          .{file.extension}
                        </span>
                      </div>

                      {/* Small badge showing depth & full path for quick inspection */}
                      <div className="text-[10px] text-slate-400 font-mono truncate mt-0.5 flex items-center gap-2">
                        <span>Path: /{file.path}</span>
                        {file.depth > 0 && (
                          <span className="text-slate-300">• {file.depth} level{file.depth > 1 ? "s" : ""} deep</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Middle / Right: Size, SHA, & Actions */}
                  <div className="flex items-center gap-4 shrink-0">
                    {/* Size badge */}
                    <span className="hidden sm:inline-block font-mono text-slate-500 text-[11px] w-18 text-right">
                      {formatSize(file.size)}
                    </span>

                    {/* SHA badge */}
                    <span
                      className="hidden md:inline-block font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200"
                      title={`Git SHA: ${file.sha}`}
                    >
                      {file.sha.substring(0, 7)}
                    </span>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1">
                      {/* Copy Path */}
                      <button
                        onClick={() => copySinglePath(file.path)}
                        title={`Copy full path: "${file.path}"`}
                        className={`p-1.5 rounded-lg border transition-all ${
                          isCopied
                            ? "bg-emerald-50 border-emerald-300 text-emerald-600"
                            : "bg-white hover:bg-slate-100 border-slate-200 text-slate-600"
                        }`}
                      >
                        {isCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>

                      {/* View / Edit File */}
                      {onViewFile && (
                        <button
                          onClick={() => onViewFile(nodeToRepoItem(file))}
                          title="View / Edit file content"
                          className="p-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-indigo-600 rounded-lg transition-colors"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      )}

                      {/* Download Raw */}
                      <a
                        href={`https://raw.githubusercontent.com/${owner}/${repo}/${selectedBranch}/${file.path}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        download={file.name}
                        title="Download raw file"
                        className="p-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-indigo-600 rounded-lg transition-colors"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </a>

                      {/* Open on GitHub */}
                      <a
                        href={`https://github.com/${owner}/${repo}/blob/${selectedBranch}/${file.path}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="View file on GitHub (new tab)"
                        className="p-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-indigo-600 rounded-lg transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>

                      {/* Delete File */}
                      {onDeleteFile && (
                        <button
                          onClick={() => onDeleteFile(nodeToRepoItem(file))}
                          title="Delete file"
                          className="p-1.5 bg-white hover:bg-red-50 border border-slate-200 hover:border-red-200 text-slate-400 hover:text-red-600 rounded-lg transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* --- View Mode 2: Folder Tree Grouped View --- */}
      {!isLoading && !error && filteredFiles.length > 0 && viewMode === "tree" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between px-2 text-xs">
            <span className="text-slate-500 font-mono">
              Grouped into {Object.keys(treeGroups).length} directory buckets:
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const next: Record<string, boolean> = {};
                  Object.keys(treeGroups).forEach((k) => (next[k] = true));
                  setTreeExpanded(next);
                }}
                className="text-indigo-600 hover:text-indigo-700 font-medium font-mono text-[11px]"
              >
                Expand All Folders
              </button>
              <span className="text-slate-300">•</span>
              <button
                onClick={() => setTreeExpanded({})}
                className="text-slate-500 hover:text-slate-700 font-medium font-mono text-[11px]"
              >
                Collapse All
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {(Object.entries(treeGroups) as [string, FlatFileNode[]][]).map(([dirName, filesInDir]) => {
              const isOpen = treeExpanded[dirName] ?? true;

              return (
                <div
                  key={dirName}
                  className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs"
                >
                  {/* Folder Group Header */}
                  <div
                    onClick={() =>
                      setTreeExpanded((prev) => ({ ...prev, [dirName]: !isOpen }))
                    }
                    className="p-3.5 bg-slate-50/90 hover:bg-slate-100/90 cursor-pointer flex items-center justify-between border-b border-slate-200 select-none transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-slate-400 p-1">
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </span>
                      <Folder className="h-4 w-4 text-amber-500 shrink-0" />
                      <span className="font-mono font-bold text-xs text-slate-800 truncate">
                        {dirName === "(root)" ? "Root Folder (./)" : dirName}
                      </span>
                      <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-mono">
                        {filesInDir.length} file{filesInDir.length === 1 ? "" : "s"}
                      </span>
                    </div>

                    <div
                      className="flex items-center gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => {
                          const paths = filesInDir.map((f) => f.path).join("\n");
                          navigator.clipboard.writeText(paths);
                          setCopiedId(dirName);
                          setTimeout(() => setCopiedId(null), 2000);
                        }}
                        className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-mono text-slate-600 transition-colors flex items-center gap-1"
                        title="Copy full paths in this folder"
                      >
                        {copiedId === dirName ? (
                          <>
                            <Check className="h-3 w-3 text-emerald-600" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            Copy Paths
                          </>
                        )}
                      </button>

                      {onNavigateToFolder && dirName !== "(root)" && (
                        <button
                          onClick={() => onNavigateToFolder(dirName)}
                          className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-mono text-indigo-600 transition-colors"
                          title="Open this folder in Repository Explorer"
                        >
                          Open in Explorer ↗
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Folder Contents */}
                  {isOpen && (
                    <div className="divide-y divide-slate-100">
                      {filesInDir.map((file) => {
                        const extDetail = getExtDetails(file.extension);
                        const ExtIcon = extDetail.icon;
                        const isCopied = copiedId === file.path;

                        return (
                          <div
                            key={file.path}
                            className="px-5 py-2.5 hover:bg-indigo-50/30 transition-colors flex items-center justify-between gap-4 text-xs pl-9"
                          >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <ExtIcon className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                              <span className="font-mono text-xs text-slate-800 font-medium truncate">
                                {file.name}
                              </span>
                              <span
                                className={`text-[10px] px-1.5 py-0.2 rounded border font-mono ${extDetail.color}`}
                              >
                                {formatSize(file.size)}
                              </span>
                              <span className="text-[10px] font-mono text-slate-400 truncate hidden lg:inline">
                                → {file.path}
                              </span>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => copySinglePath(file.path)}
                                title={`Copy full path: "${file.path}"`}
                                className={`p-1.5 rounded-lg border transition-all ${
                                  isCopied
                                    ? "bg-emerald-50 border-emerald-300 text-emerald-600"
                                    : "bg-white hover:bg-slate-100 border-slate-200 text-slate-600"
                                }`}
                              >
                                {isCopied ? (
                                  <Check className="h-3 w-3" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </button>

                              {onViewFile && (
                                <button
                                  onClick={() => onViewFile(nodeToRepoItem(file))}
                                  title="View / Edit file"
                                  className="p-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-indigo-600 rounded-lg transition-colors"
                                >
                                  <Eye className="h-3 w-3" />
                                </button>
                              )}

                              <a
                                href={`https://github.com/${owner}/${repo}/blob/${selectedBranch}/${file.path}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Open on GitHub"
                                className="p-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-indigo-600 rounded-lg transition-colors"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
