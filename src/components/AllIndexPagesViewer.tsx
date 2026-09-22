/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Globe,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  Folder,
  FileCode,
  ChevronDown,
  Code,
  Maximize2,
  Minimize2,
  Sparkles,
  AlertCircle,
  Search,
  CheckSquare,
  Square,
  ArrowUpRight,
  Monitor,
  Tablet,
  Smartphone,
  GitBranch,
  Filter,
  Plus,
  Info
} from "lucide-react";
import { Octokit } from "octokit";
import { decodeBase64Utf8 } from "../utils/githubHelpers";

export interface IndexFileItem {
  path: string;
  sha: string;
  size: number;
  content?: string;
  loading?: boolean;
  error?: string | null;
  sourceMethod?: string;
}

interface AllIndexPagesViewerProps {
  owner: string;
  repo: string;
  branch: string;
  token?: string;
  getOctokit: () => Octokit;
}

export const AllIndexPagesViewer: React.FC<AllIndexPagesViewerProps> = ({
  owner,
  repo,
  branch: initialBranch,
  token,
  getOctokit,
}) => {
  // Branch State
  const [selectedBranch, setSelectedBranch] = useState<string>(initialBranch || "main");
  const [availableBranches, setAvailableBranches] = useState<string[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState<boolean>(false);

  // Files & Scanning State
  const [indexFiles, setIndexFiles] = useState<IndexFileItem[]>([]);
  const [isLoadingTree, setIsLoadingTree] = useState<boolean>(true);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterMode, setFilterMode] = useState<"index_only" | "all_html">("index_only");

  // Custom manual path input
  const [manualPathInput, setManualPathInput] = useState<string>("");
  const [isAddingManualPath, setIsAddingManualPath] = useState<boolean>(false);
  const [manualPathError, setManualPathError] = useState<string | null>(null);

  // UI Interactive States
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({});
  const [viewSourceMap, setViewSourceMap] = useState<Record<string, boolean>>({});
  const [viewportMap, setViewportMap] = useState<Record<string, "desktop" | "tablet" | "mobile">>({});
  const [fullscreenFile, setFullscreenFile] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Keep selectedBranch synced if initialBranch prop changes
  useEffect(() => {
    if (initialBranch && initialBranch !== selectedBranch) {
      setSelectedBranch(initialBranch);
    }
  }, [initialBranch]);

  // Fetch list of branches for the repository
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
      if (names.length > 0 && !names.includes(selectedBranch)) {
        // If current selectedBranch is not in list, keep default or pick first
        if (names.includes("main")) setSelectedBranch("main");
        else if (names.includes("master")) setSelectedBranch("master");
      }
    } catch (e) {
      console.warn("Could not list branches:", e);
    } finally {
      setIsLoadingBranches(false);
    }
  };

  useEffect(() => {
    fetchBranches();
  }, [owner, repo]);

  // Helper: check whether a file path matches our target filter
  const isTargetHtmlFile = (filePath: string, mode: "index_only" | "all_html"): boolean => {
    const lower = filePath.toLowerCase();
    if (mode === "index_only") {
      // Matches index.html, index.htm, folder/index.html, folder/sub/index.htm
      return /(^|\/)index\.html?$/i.test(lower);
    }
    // All HTML files
    return lower.endsWith(".html") || lower.endsWith(".htm");
  };

  // Helper to fetch content for a specific file with multiple fallbacks
  const fetchSingleFileContent = async (
    filePath: string,
    fileSha: string,
    activeBranch: string
  ): Promise<string> => {
    const octokit = getOctokit();

    // Strategy 1: repos.getContent
    try {
      const res = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: filePath,
        ref: activeBranch,
      });

      if (!Array.isArray(res.data) && res.data.type === "file" && res.data.content) {
        return decodeBase64Utf8(res.data.content);
      }
    } catch (e1) {
      console.warn(`repos.getContent failed for ${filePath}, trying blob fallback`, e1);
    }

    // Strategy 2: git.getBlob using sha
    if (fileSha) {
      try {
        const blobRes = await octokit.rest.git.getBlob({
          owner,
          repo,
          file_sha: fileSha,
        });
        if (blobRes.data.content) {
          return decodeBase64Utf8(blobRes.data.content);
        }
      } catch (e2) {
        console.warn(`git.getBlob failed for ${filePath}`, e2);
      }
    }

    // Strategy 3: direct raw GitHub URL fetch
    try {
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${activeBranch}/${filePath}`;
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const rawRes = await fetch(rawUrl, { headers });
      if (rawRes.ok) {
        return await rawRes.text();
      }
    } catch (e3) {
      console.warn(`raw fetch failed for ${filePath}`, e3);
    }

    throw new Error("Unable to fetch file content across all GitHub endpoints.");
  };

  // Scan repository using multi-strategy discovery
  const scanAllIndexFiles = async () => {
    if (!owner || !repo) return;
    setIsLoadingTree(true);
    setTreeError(null);
    setScanStatus(`Scanning branch "${selectedBranch}" for HTML files...`);

    const discoveredMap = new Map<string, { path: string; sha: string; size: number; method: string }>();

    try {
      const octokit = getOctokit();

      // --- Strategy 1: Recursive Git Tree ---
      // We resolve the branch to its commit tree sha first to prevent 404/422 errors
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
        console.warn("Could not resolve branch tree sha, trying direct branch ref", bErr);
      }

      try {
        setScanStatus(`Fetching repository tree via Git API (${selectedBranch})...`);
        const treeRes = await octokit.rest.git.getTree({
          owner,
          repo,
          tree_sha: resolvedTreeSha,
          recursive: "1",
        });

        const allNodes = treeRes.data.tree || [];
        for (const node of allNodes) {
          if (node.type === "blob" && node.path && isTargetHtmlFile(node.path, filterMode)) {
            discoveredMap.set(node.path, {
              path: node.path,
              sha: node.sha,
              size: node.size || 0,
              method: "git_tree",
            });
          }
        }
      } catch (treeErr: any) {
        console.warn("Git Tree API failed, will try alternative discovery methods", treeErr);
      }

      // --- Strategy 2: Code Search API (Finds index.html anywhere in repository) ---
      try {
        setScanStatus("Running GitHub Search for index.html files...");
        const searchTerms = filterMode === "index_only"
          ? [`filename:index extension:html repo:${owner}/${repo}`, `filename:index extension:htm repo:${owner}/${repo}`]
          : [`extension:html repo:${owner}/${repo}`];

        for (const q of searchTerms) {
          try {
            const searchRes = await octokit.rest.search.code({
              q,
              per_page: 100,
            });
            const items = searchRes.data.items || [];
            for (const item of items) {
              if (item.path && isTargetHtmlFile(item.path, filterMode)) {
                if (!discoveredMap.has(item.path)) {
                  discoveredMap.set(item.path, {
                    path: item.path,
                    sha: item.sha,
                    size: 0,
                    method: "code_search",
                  });
                }
              }
            }
          } catch (qErr) {
            // Code search can fail if unauthenticated or rate limited, which is fine as fallback
            console.warn("Code search term skipped:", q, qErr);
          }
        }
      } catch (searchErr) {
        console.warn("GitHub search fallback completed or skipped", searchErr);
      }

      // --- Strategy 3: Recursive Contents Walk (Fallback if tree returned 0 or truncated) ---
      if (discoveredMap.size === 0) {
        setScanStatus("Performing directory walk via GitHub Contents API...");
        const walkQueue: string[] = [""];
        const visitedDirs = new Set<string>();
        let scannedCount = 0;

        while (walkQueue.length > 0 && scannedCount < 40) {
          const dirPath = walkQueue.shift()!;
          if (visitedDirs.has(dirPath)) continue;
          visitedDirs.add(dirPath);
          scannedCount++;

          try {
            const dirContents = await octokit.rest.repos.getContent({
              owner,
              repo,
              path: dirPath,
              ref: selectedBranch,
            });

            if (Array.isArray(dirContents.data)) {
              for (const item of dirContents.data) {
                if (item.type === "file" && isTargetHtmlFile(item.path, filterMode)) {
                  discoveredMap.set(item.path, {
                    path: item.path,
                    sha: item.sha,
                    size: item.size || 0,
                    method: "contents_walk",
                  });
                } else if (item.type === "dir" && !item.name.startsWith(".")) {
                  // Ignore hidden folders like .git
                  walkQueue.push(item.path);
                }
              }
            }
          } catch (walkErr) {
            console.warn(`Could not read directory ${dirPath}`, walkErr);
          }
        }
      }

      // Convert map to sorted list
      const matchedFiles: IndexFileItem[] = Array.from(discoveredMap.values()).map((f) => ({
        path: f.path,
        sha: f.sha,
        size: f.size,
        loading: true,
        sourceMethod: f.method,
      }));

      // Sort: Root index.html first, then subfolders alphabetically
      matchedFiles.sort((a, b) => {
        const aIsRoot = /^index\.html?$/i.test(a.path);
        const bIsRoot = /^index\.html?$/i.test(b.path);
        if (aIsRoot && !bIsRoot) return -1;
        if (!aIsRoot && bIsRoot) return 1;
        return a.path.localeCompare(b.path);
      });

      setIndexFiles(matchedFiles);

      // Expand all details by default
      const initialExpanded: Record<string, boolean> = {};
      matchedFiles.forEach((item) => {
        initialExpanded[item.path] = true;
      });
      setExpandedPaths(initialExpanded);

      if (matchedFiles.length === 0) {
        setIsLoadingTree(false);
        setScanStatus(`Scanned branch "${selectedBranch}", but no matching HTML files were found.`);
        return;
      }

      setScanStatus(`Discovered ${matchedFiles.length} HTML files. Fetching page contents...`);

      // Fetch contents progressively so user sees results appear immediately
      for (let i = 0; i < matchedFiles.length; i++) {
        const file = matchedFiles[i];
        try {
          const content = await fetchSingleFileContent(file.path, file.sha, selectedBranch);
          setIndexFiles((prev) =>
            prev.map((f) =>
              f.path === file.path ? { ...f, content, loading: false, error: null } : f
            )
          );
        } catch (contentErr: any) {
          setIndexFiles((prev) =>
            prev.map((f) =>
              f.path === file.path
                ? { ...f, loading: false, error: contentErr.message || "Failed to fetch content" }
                : f
            )
          );
        }
      }

      setIsLoadingTree(false);
      setScanStatus(`Completed: Ready with ${matchedFiles.length} file(s).`);
    } catch (err: any) {
      console.error("Failed to scan index.html files:", err);
      setTreeError(err.message || "Failed to scan repository for index.html files.");
      setIsLoadingTree(false);
    }
  };

  // Reload an individual index.html
  const reloadSingleFile = async (filePath: string, fileSha: string) => {
    setIndexFiles((prev) =>
      prev.map((f) => (f.path === filePath ? { ...f, loading: true, error: null } : f))
    );

    try {
      const content = await fetchSingleFileContent(filePath, fileSha, selectedBranch);
      setIndexFiles((prev) =>
        prev.map((f) =>
          f.path === filePath ? { ...f, content, loading: false, error: null } : f
        )
      );
    } catch (err: any) {
      setIndexFiles((prev) =>
        prev.map((f) =>
          f.path === filePath ? { ...f, loading: false, error: err.message || "Failed to reload" } : f
        )
      );
    }
  };

  // Add custom manual file path
  const handleAddManualPath = async () => {
    const clean = manualPathInput.trim().replace(/^\//, "");
    if (!clean) return;

    if (indexFiles.some((f) => f.path.toLowerCase() === clean.toLowerCase())) {
      setManualPathError(`"${clean}" is already in the list.`);
      return;
    }

    setIsAddingManualPath(true);
    setManualPathError(null);

    try {
      const content = await fetchSingleFileContent(clean, "", selectedBranch);
      const newItem: IndexFileItem = {
        path: clean,
        sha: "",
        size: content.length,
        content,
        loading: false,
        sourceMethod: "manual_entry",
      };

      setIndexFiles((prev) => [newItem, ...prev]);
      setExpandedPaths((prev) => ({ ...prev, [clean]: true }));
      setManualPathInput("");
    } catch (err: any) {
      setManualPathError(`File not found at "${clean}" on branch "${selectedBranch}".`);
    } finally {
      setIsAddingManualPath(false);
    }
  };

  useEffect(() => {
    scanAllIndexFiles();
  }, [owner, repo, selectedBranch, filterMode]);

  // Construct iframe srcdoc with injected base URL so relative images, css, scripts resolve properly
  const getProcessedHtmlDoc = (file: IndexFileItem) => {
    if (!file.content) return "";

    const folder = file.path.includes("/")
      ? file.path.substring(0, file.path.lastIndexOf("/") + 1)
      : "";
    const rawBaseUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${selectedBranch}/${folder}`;

    let doc = file.content;
    if (!doc.includes("<base ")) {
      if (doc.includes("<head>")) {
        doc = doc.replace("<head>", `<head><base href="${rawBaseUrl}" />`);
      } else if (doc.includes("<html>")) {
        doc = doc.replace("<html>", `<html><head><base href="${rawBaseUrl}" /></head>`);
      } else {
        doc = `<base href="${rawBaseUrl}" />` + doc;
      }
    }
    return doc;
  };

  // Generate a complete standalone HTML document for the blank target page
  const generateStandaloneHtml = () => {
    const count = indexFiles.length;

    const sectionsHtml = indexFiles
      .map((file, i) => {
        const folder = file.path.includes("/")
          ? file.path.substring(0, file.path.lastIndexOf("/") + 1)
          : "";
        const ghPagesUrl = `https://${owner.toLowerCase()}.github.io/${repo}/${folder}`;
        const rawGithubUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${selectedBranch}/${file.path}`;
        const githubBlobUrl = `https://github.com/${owner}/${repo}/blob/${selectedBranch}/${file.path}`;

        const processedContent = getProcessedHtmlDoc(file)
          .replace(/&/g, "&amp;")
          .replace(/"/g, "&quot;");

        return `
      <details open class="index-card" id="details-${i}">
        <summary class="index-summary">
          <div class="summary-left">
            <span class="chevron">▶</span>
            <span class="file-icon">📄</span>
            <strong class="file-path">${file.path}</strong>
            <span class="badge size-badge">${(file.size / 1024).toFixed(1)} KB</span>
            ${/(^|\/)index\.html?$/i.test(file.path) ? '<span class="badge root-badge">Index File</span>' : ""}
          </div>
          <div class="summary-right">
            <a href="${ghPagesUrl}" target="_blank" rel="noopener noreferrer" class="link-btn" title="Open in GitHub Pages">
              🌐 Live Link ↗
            </a>
            <a href="${githubBlobUrl}" target="_blank" rel="noopener noreferrer" class="link-btn" title="View on GitHub">
              🐙 GitHub ↗
            </a>
            <a href="${rawGithubUrl}" target="_blank" rel="noopener noreferrer" class="link-btn" title="Raw HTML">
              Raw File ↗
            </a>
          </div>
        </summary>
        <div class="iframe-wrapper">
          <div class="iframe-bar">
            <div class="dots">
              <span class="dot red"></span>
              <span class="dot yellow"></span>
              <span class="dot green"></span>
            </div>
            <div class="address">
              <span>https://${owner.toLowerCase()}.github.io/${repo}/${file.path}</span>
            </div>
            <button class="reload-btn" onclick="document.getElementById('frame-${i}').srcdoc = document.getElementById('frame-${i}').srcdoc">
              🔄 Reload
            </button>
          </div>
          <iframe
            id="frame-${i}"
            class="site-frame"
            srcdoc="${processedContent}"
            sandbox="allow-scripts allow-same-origin allow-modals allow-forms allow-popups"
            loading="lazy"
          ></iframe>
        </div>
      </details>`;
      })
      .join("\n");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>All HTML & Index Pages - ${owner}/${repo} (${selectedBranch})</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --summary-bg: #1e293b;
      --summary-hover: #334155;
      --border: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --accent: #0d9488;
      --accent-hover: #14b8a6;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      padding-bottom: 80px;
    }
    .sticky-header {
      position: sticky;
      top: 0;
      z-index: 100;
      background: rgba(15, 23, 42, 0.95);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border);
      padding: 16px 24px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .header-title {
      font-size: 18px;
      font-weight: 700;
      color: #fff;
    }
    .header-subtitle {
      font-size: 12px;
      color: var(--text-muted);
      font-family: monospace;
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .btn {
      padding: 8px 14px;
      font-size: 13px;
      font-weight: 600;
      border-radius: 8px;
      cursor: pointer;
      border: 1px solid var(--border);
      background: var(--card-bg);
      color: var(--text);
      transition: all 0.15s ease;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      text-decoration: none;
    }
    .btn:hover {
      background: #334155;
      border-color: #475569;
    }
    .btn-primary {
      background: var(--accent);
      border-color: var(--accent);
      color: #ffffff;
    }
    .btn-primary:hover {
      background: var(--accent-hover);
    }
    .container {
      max-width: 1400px;
      margin: 24px auto;
      padding: 0 20px;
      display: flex;
      gap: 24px;
      flex-direction: column;
    }
    details.index-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
      transition: border-color 0.2s ease;
    }
    details.index-card[open] {
      border-color: #0d9488;
    }
    summary.index-summary {
      cursor: pointer;
      list-style: none;
      padding: 14px 18px;
      background: var(--summary-bg);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      user-select: none;
      border-bottom: 1px solid transparent;
      transition: background 0.15s ease;
    }
    summary.index-summary::-webkit-details-marker {
      display: none;
    }
    details[open] summary.index-summary {
      border-bottom-color: var(--border);
      background: #1e293b;
    }
    summary.index-summary:hover {
      background: var(--summary-hover);
    }
    .summary-left {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .chevron {
      font-size: 11px;
      color: var(--text-muted);
      transition: transform 0.2s ease;
      display: inline-block;
    }
    details[open] .chevron {
      transform: rotate(90deg);
      color: #14b8a6;
    }
    .file-icon {
      font-size: 16px;
    }
    .file-path {
      font-family: monospace;
      font-size: 14px;
      color: #38bdf8;
    }
    .badge {
      font-size: 11px;
      font-family: monospace;
      padding: 2px 8px;
      border-radius: 9999px;
      border: 1px solid;
    }
    .size-badge {
      background: #0f172a;
      border-color: #334155;
      color: #94a3b8;
    }
    .root-badge {
      background: rgba(13, 148, 136, 0.2);
      border-color: rgba(13, 148, 136, 0.4);
      color: #2dd4bf;
    }
    .summary-right {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .link-btn {
      font-size: 11px;
      font-family: monospace;
      padding: 4px 8px;
      border-radius: 6px;
      background: #0f172a;
      color: #cbd5e1;
      border: 1px solid #334155;
      text-decoration: none;
      transition: all 0.15s ease;
    }
    .link-btn:hover {
      background: #334155;
      color: #fff;
    }
    .iframe-wrapper {
      background: #020617;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .iframe-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      background: #0f172a;
      padding: 6px 12px;
      border-radius: 8px;
      border: 1px solid #1e293b;
      font-family: monospace;
      font-size: 11px;
      color: #94a3b8;
    }
    .dots {
      display: flex;
      gap: 6px;
    }
    .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }
    .dot.red { background: #f43f5e; }
    .dot.yellow { background: #eab308; }
    .dot.green { background: #10b981; }
    .address {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: #38bdf8;
    }
    .reload-btn {
      background: #1e293b;
      border: 1px solid #334155;
      color: #cbd5e1;
      border-radius: 6px;
      padding: 3px 8px;
      font-size: 11px;
      cursor: pointer;
    }
    .reload-btn:hover {
      background: #334155;
      color: #fff;
    }
    .site-frame {
      width: 100%;
      height: 600px;
      border: 1px solid #1e293b;
      border-radius: 8px;
      background: #ffffff;
    }
  </style>
</head>
<body>

  <header class="sticky-header">
    <div class="header-left">
      <div>
        <div class="header-title">🌐 Multi-Index Artifact Viewer</div>
        <div class="header-subtitle">${owner}/${repo} • branch: ${selectedBranch} • ${count} files loaded</div>
      </div>
    </div>
    <div class="header-actions">
      <button class="btn" onclick="document.querySelectorAll('details.index-card').forEach(d => d.open = true)">
        ➕ Expand All
      </button>
      <button class="btn" onclick="document.querySelectorAll('details.index-card').forEach(d => d.open = false)">
        ➖ Collapse All
      </button>
      <button class="btn btn-primary" onclick="window.location.reload()">
        🔄 Reload Page
      </button>
    </div>
  </header>

  <main class="container">
    ${sectionsHtml}
  </main>

</body>
</html>`;
  };

  // Open the standalone generated page in target="_blank"
  const handleOpenBlankTarget = () => {
    const html = generateStandaloneHtml();
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    setBlobUrl(url);

    const win = window.open(url, "_blank");
    if (!win) {
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  // Update blobUrl whenever files change
  useEffect(() => {
    if (indexFiles.length > 0 && !isLoadingTree) {
      const html = generateStandaloneHtml();
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    }
  }, [indexFiles, isLoadingTree, owner, repo, selectedBranch]);

  // Expand All / Collapse All controls
  const handleExpandAll = () => {
    const next: Record<string, boolean> = {};
    indexFiles.forEach((f) => {
      next[f.path] = true;
    });
    setExpandedPaths(next);
  };

  const handleCollapseAll = () => {
    const next: Record<string, boolean> = {};
    indexFiles.forEach((f) => {
      next[f.path] = false;
    });
    setExpandedPaths(next);
  };

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  // Filter items by search query
  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return indexFiles;
    const q = searchQuery.toLowerCase();
    return indexFiles.filter((f) => f.path.toLowerCase().includes(q));
  }, [indexFiles, searchQuery]);

  return (
    <div className="flex flex-col gap-6" ref={containerRef} id="all_index_pages_viewer">
      {/* --- Top Header & Action Banner --- */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-teal-950 text-white rounded-2xl p-6 shadow-md border border-slate-700 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="p-2.5 bg-teal-500/20 text-teal-300 rounded-xl border border-teal-500/30">
                <Sparkles className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2 flex-wrap">
                  All <code className="text-teal-300 font-mono bg-slate-800 px-1.5 py-0.5 rounded text-sm">index.html</code> Multi-View
                  <span className="text-xs bg-teal-500/20 text-teal-300 border border-teal-500/30 px-2.5 py-0.5 rounded-full font-mono">
                    {indexFiles.length} file{indexFiles.length === 1 ? "" : "s"} found
                  </span>
                </h3>
                <p className="text-xs text-slate-300">
                  Collapsible <code className="bg-slate-800 px-1.5 py-0.5 rounded text-teal-300">&lt;details&gt;</code> tags for every HTML entry in <span className="font-mono text-white font-bold">{owner}/{repo}</span> with live iframe preview & standalone blank target page.
                </p>
              </div>
            </div>
          </div>

          {/* Blank Target Button & Controls */}
          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            <a
              href={blobUrl || "#"}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                if (!blobUrl) {
                  e.preventDefault();
                  handleOpenBlankTarget();
                }
              }}
              className="bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 transition-all shadow-md active:scale-95"
              title="Open standalone page with all index.html iframes in new browser tab"
              id="open_blank_target_btn"
            >
              <ArrowUpRight className="h-4 w-4 stroke-[2.5]" />
              Open Page in Blank Tab (target="_blank")
            </a>

            <button
              onClick={scanAllIndexFiles}
              disabled={isLoadingTree}
              className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-white px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition-all"
              title="Rescan and refresh all files"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoadingTree ? "animate-spin text-teal-400" : ""}`} />
              Rescan
            </button>
          </div>
        </div>

        {/* --- Multi-Branch, Filter Mode & Manual Path Row --- */}
        <div className="mt-5 pt-4 border-t border-slate-800 grid grid-cols-1 md:grid-cols-12 gap-3 text-xs">
          {/* Branch Selector */}
          <div className="md:col-span-4 flex items-center gap-2 bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-2">
            <GitBranch className="h-4 w-4 text-teal-400 shrink-0" />
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
                placeholder="Branch name"
                className="bg-transparent text-white font-mono text-xs outline-none flex-1 font-bold"
              />
            )}
          </div>

          {/* Filter Scope Toggle */}
          <div className="md:col-span-4 flex items-center bg-slate-800/90 border border-slate-700 rounded-xl p-1 gap-1">
            <button
              onClick={() => setFilterMode("index_only")}
              className={`flex-1 py-1.5 px-2 rounded-lg font-mono text-[11px] transition-all flex items-center justify-center gap-1.5 ${
                filterMode === "index_only"
                  ? "bg-teal-600 text-white font-bold shadow-xs"
                  : "text-slate-400 hover:text-white"
              }`}
              title="Filter strictly for index.html and index.htm files"
            >
              <Filter className="h-3 w-3" />
              index.html only
            </button>
            <button
              onClick={() => setFilterMode("all_html")}
              className={`flex-1 py-1.5 px-2 rounded-lg font-mono text-[11px] transition-all flex items-center justify-center gap-1.5 ${
                filterMode === "all_html"
                  ? "bg-teal-600 text-white font-bold shadow-xs"
                  : "text-slate-400 hover:text-white"
              }`}
              title="Include all .html and .htm files in repository"
            >
              <Globe className="h-3 w-3" />
              All *.html files
            </button>
          </div>

          {/* Manual Path Entry (If file isn't in tree or search) */}
          <div className="md:col-span-4 flex items-center gap-2 bg-slate-800/90 border border-slate-700 rounded-xl px-2.5 py-1">
            <Plus className="h-3.5 w-3.5 text-teal-400 shrink-0" />
            <input
              type="text"
              placeholder="Add path (e.g. dist/index.html)"
              value={manualPathInput}
              onChange={(e) => {
                setManualPathInput(e.target.value);
                setManualPathError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddManualPath();
              }}
              className="bg-transparent text-white placeholder-slate-400 outline-none w-full font-mono text-xs"
            />
            <button
              onClick={handleAddManualPath}
              disabled={isAddingManualPath || !manualPathInput.trim()}
              className="px-2.5 py-1 bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white font-bold rounded-lg text-[11px] transition-colors shrink-0"
            >
              {isAddingManualPath ? "Adding..." : "+ Add"}
            </button>
          </div>
        </div>

        {/* Status message or error banner */}
        {manualPathError && (
          <div className="mt-2 text-[11px] text-rose-300 flex items-center gap-1 font-mono">
            <AlertCircle className="h-3.5 w-3.5" />
            {manualPathError}
          </div>
        )}

        {/* Toolbar: Expand/Collapse & Filter Search */}
        <div className="mt-3 pt-3 border-t border-slate-800/70 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleExpandAll}
              className="px-3 py-1.5 bg-slate-800/90 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 flex items-center gap-1.5 transition-colors"
            >
              <CheckSquare className="h-3.5 w-3.5 text-teal-400" />
              Expand All (&lt;details open&gt;)
            </button>

            <button
              onClick={handleCollapseAll}
              className="px-3 py-1.5 bg-slate-800/90 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 flex items-center gap-1.5 transition-colors"
            >
              <Square className="h-3.5 w-3.5 text-slate-400" />
              Collapse All
            </button>

            {scanStatus && (
              <span className="text-[11px] text-slate-400 font-mono hidden sm:inline-flex items-center gap-1">
                <Info className="h-3 w-3 text-teal-400" />
                {scanStatus}
              </span>
            )}
          </div>

          {/* Search/Filter by path */}
          {indexFiles.length > 1 && (
            <div className="flex items-center gap-2 bg-slate-800/90 border border-slate-700 rounded-lg px-3 py-1.5 text-xs">
              <Search className="h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Filter by path..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent text-white placeholder-slate-400 outline-none w-36 font-mono text-xs"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="text-slate-400 hover:text-white text-xs ml-1"
                >
                  ✕
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* --- Scanning State with Progress Feedback --- */}
      {isLoadingTree && (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center shadow-xs flex flex-col items-center justify-center gap-3">
          <RefreshCw className="h-8 w-8 text-teal-600 animate-spin" />
          <p className="text-sm font-semibold text-slate-800 font-mono">
            {scanStatus || "Scanning repository for all HTML files..."}
          </p>
          <span className="text-xs text-slate-500">
            Checking Git tree, code search index, and folder hierarchy on branch{" "}
            <code className="text-teal-700 font-bold font-mono">{selectedBranch}</code>
          </span>
        </div>
      )}

      {/* --- Error State --- */}
      {treeError && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center text-red-700 space-y-2">
          <AlertCircle className="h-8 w-8 text-red-500 mx-auto" />
          <h4 className="font-bold">Error scanning files</h4>
          <p className="text-xs">{treeError}</p>
          <div className="pt-2">
            <button
              onClick={scanAllIndexFiles}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold font-mono"
            >
              Retry Scan
            </button>
          </div>
        </div>
      )}

      {/* --- Empty State with Helpful Remedies --- */}
      {!isLoadingTree && !treeError && indexFiles.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center shadow-xs space-y-4 max-w-2xl mx-auto">
          <FileCode className="h-12 w-12 text-slate-300 mx-auto" />
          <div>
            <h4 className="font-bold text-slate-800 text-base">
              No matching HTML files found on branch "{selectedBranch}"
            </h4>
            <p className="text-xs text-slate-500 mt-1">
              {filterMode === "index_only"
                ? "Could not find files named index.html or index.htm."
                : "No .html files were discovered on this branch."}
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-left text-xs space-y-2 text-slate-600">
            <div className="font-bold text-slate-800 flex items-center gap-1.5">
              <Info className="h-4 w-4 text-teal-600" />
              Quick fixes:
            </div>
            <ul className="list-disc list-inside space-y-1 text-slate-600">
              <li>
                <strong>Try changing branch</strong>: Check if your files are on{" "}
                <code className="font-mono bg-slate-200 px-1 rounded">main</code>,{" "}
                <code className="font-mono bg-slate-200 px-1 rounded">master</code>, or{" "}
                <code className="font-mono bg-slate-200 px-1 rounded">gh-pages</code> using the branch dropdown above.
              </li>
              <li>
                <strong>Switch filter mode</strong>: Click{" "}
                <button
                  onClick={() => setFilterMode("all_html")}
                  className="text-teal-700 font-bold underline hover:text-teal-800"
                >
                  "All *.html files"
                </button>{" "}
                above to discover HTML files with other names.
              </li>
              <li>
                <strong>Add path directly</strong>: Enter the exact relative path in the "+ Add path" box above.
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* --- Main Stack of <details> Tags (One Below The Other) --- */}
      {!isLoadingTree && !treeError && filteredFiles.length > 0 && (
        <div className="flex flex-col gap-6" id="index_details_stack">
          {filteredFiles.map((file, idx) => {
            const isExpanded = expandedPaths[file.path] ?? true;
            const isSourceOpen = viewSourceMap[file.path] ?? false;
            const currentViewport = viewportMap[file.path] ?? "desktop";
            const folder = file.path.includes("/")
              ? file.path.substring(0, file.path.lastIndexOf("/") + 1)
              : "";
            const ghPagesUrl = `https://${owner.toLowerCase()}.github.io/${repo}/${folder}`;
            const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${selectedBranch}/${file.path}`;

            const getViewportWidth = () => {
              if (currentViewport === "mobile") return "max-w-[375px] mx-auto";
              if (currentViewport === "tablet") return "max-w-[768px] mx-auto";
              return "w-full";
            };

            return (
              <details
                key={file.path}
                open={isExpanded}
                onToggle={(e) => {
                  const target = e.currentTarget as HTMLDetailsElement;
                  setExpandedPaths((prev) => ({
                    ...prev,
                    [file.path]: target.open,
                  }));
                }}
                className="group bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden transition-all duration-200 hover:border-slate-300"
                id={`details_${idx}`}
              >
                {/* --- <summary> tag header --- */}
                <summary className="cursor-pointer list-none flex flex-wrap items-center justify-between p-4 sm:p-5 bg-slate-50/80 hover:bg-slate-100/90 border-b border-slate-200 transition-colors select-none gap-4">
                  {/* Left: Path, indicator & badge */}
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`p-1.5 rounded-lg border text-slate-500 transition-transform duration-200 ${
                        isExpanded ? "rotate-90 bg-teal-50 border-teal-200 text-teal-700" : "bg-white border-slate-200"
                      }`}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </span>

                    <div className="p-2 bg-teal-50 text-teal-600 rounded-xl border border-teal-200 shrink-0">
                      <FileCode className="h-4 w-4" />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-sm text-slate-800 hover:text-teal-700 truncate">
                          {file.path}
                        </span>
                        {/(^|\/)index\.html?$/i.test(file.path) && (
                          <span className="bg-teal-100 text-teal-800 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border border-teal-200">
                            Index
                          </span>
                        )}
                        {file.size > 0 && (
                          <span className="text-slate-400 text-xs font-mono">
                            ({(file.size / 1024).toFixed(1)} KB)
                          </span>
                        )}
                        {file.sourceMethod && (
                          <span className="text-slate-400 text-[10px] font-mono bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                            {file.sourceMethod}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1.5">
                        <Folder className="h-3 w-3 text-slate-400" />
                        Directory: <span className="text-slate-700">{folder || "Root (./)"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Quick actions on summary bar */}
                  <div
                    className="flex items-center gap-2 shrink-0 flex-wrap"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Viewport size buttons */}
                    <div className="flex items-center bg-white border border-slate-200 p-0.5 rounded-lg gap-0.5">
                      <button
                        onClick={() =>
                          setViewportMap((prev) => ({ ...prev, [file.path]: "desktop" }))
                        }
                        title="Desktop view (100%)"
                        className={`p-1 rounded ${
                          currentViewport === "desktop"
                            ? "bg-slate-100 text-teal-700 font-bold"
                            : "text-slate-400 hover:text-slate-700"
                        }`}
                      >
                        <Monitor className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() =>
                          setViewportMap((prev) => ({ ...prev, [file.path]: "tablet" }))
                        }
                        title="Tablet view (768px)"
                        className={`p-1 rounded ${
                          currentViewport === "tablet"
                            ? "bg-slate-100 text-teal-700 font-bold"
                            : "text-slate-400 hover:text-slate-700"
                        }`}
                      >
                        <Tablet className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() =>
                          setViewportMap((prev) => ({ ...prev, [file.path]: "mobile" }))
                        }
                        title="Mobile view (375px)"
                        className={`p-1 rounded ${
                          currentViewport === "mobile"
                            ? "bg-slate-100 text-teal-700 font-bold"
                            : "text-slate-400 hover:text-slate-700"
                        }`}
                      >
                        <Smartphone className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Source toggle button */}
                    <button
                      onClick={() =>
                        setViewSourceMap((prev) => ({ ...prev, [file.path]: !isSourceOpen }))
                      }
                      title="Inspect HTML Source Code"
                      className={`px-2.5 py-1 text-xs rounded-lg border font-mono flex items-center gap-1 transition-colors ${
                        isSourceOpen
                          ? "bg-teal-50 border-teal-300 text-teal-700 font-bold"
                          : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      <Code className="h-3 w-3" />
                      Source
                    </button>

                    {/* Direct Live Link button */}
                    <a
                      href={ghPagesUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 flex items-center gap-1 font-mono transition-colors"
                      title="Open in GitHub Pages (target='_blank')"
                    >
                      <Globe className="h-3 w-3 text-teal-600" />
                      Live Site
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>

                    {/* Copy Link */}
                    <button
                      onClick={() => copyText(ghPagesUrl, file.path)}
                      title="Copy live site URL"
                      className="p-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-600 transition-colors"
                    >
                      {copiedId === file.path ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>

                    {/* Reload iframe */}
                    <button
                      onClick={() => reloadSingleFile(file.path, file.sha)}
                      disabled={file.loading}
                      title="Reload this iframe"
                      className="p-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-600 hover:text-teal-700 transition-colors disabled:opacity-40"
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 ${file.loading ? "animate-spin text-teal-600" : ""}`}
                      />
                    </button>

                    {/* Fullscreen Modal Toggle */}
                    <button
                      onClick={() => setFullscreenFile(file.path)}
                      title="View fullscreen"
                      className="p-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-600 hover:text-slate-900 transition-colors"
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </summary>

                {/* --- Inside <details> Content: The wrapped iframe --- */}
                <div className="p-4 sm:p-6 bg-slate-900/5">
                  {file.loading ? (
                    <div className="h-[400px] bg-white rounded-xl border border-slate-200 flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="h-6 w-6 text-teal-600 animate-spin" />
                      <span className="text-xs font-mono text-slate-500">Loading {file.path}...</span>
                    </div>
                  ) : file.error ? (
                    <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-center text-red-600 space-y-1">
                      <AlertCircle className="h-6 w-6 mx-auto text-red-500" />
                      <p className="font-bold text-xs">{file.error}</p>
                      <button
                        onClick={() => reloadSingleFile(file.path, file.sha)}
                        className="text-xs text-red-700 font-bold underline mt-2"
                      >
                        Retry Loading
                      </button>
                    </div>
                  ) : isSourceOpen ? (
                    /* Source Code view */
                    <div className="bg-slate-900 rounded-xl border border-slate-800 text-slate-200 p-4 font-mono text-xs overflow-auto max-h-[500px] shadow-inner">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2 text-slate-400">
                        <span className="font-bold text-teal-400">{file.path}</span>
                        <span>{file.content?.length || 0} bytes</span>
                      </div>
                      <pre className="whitespace-pre-wrap leading-relaxed">{file.content}</pre>
                    </div>
                  ) : (
                    /* Live Iframe View wrapped in clean device container */
                    <div
                      className={`transition-all duration-300 bg-white rounded-xl border border-slate-300 shadow-md overflow-hidden flex flex-col ${getViewportWidth()}`}
                    >
                      {/* Browser address header inside frame container */}
                      <div className="bg-slate-100 border-b border-slate-200 px-3 py-1.5 flex items-center justify-between text-[11px] font-mono text-slate-500">
                        <div className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-rose-400" />
                          <span className="h-2 w-2 rounded-full bg-amber-400" />
                          <span className="h-2 w-2 rounded-full bg-emerald-400" />
                        </div>
                        <div className="truncate max-w-sm sm:max-w-md text-slate-600">
                          https://{owner.toLowerCase()}.github.io/{repo}/{file.path}
                        </div>
                        <div className="text-[10px] text-slate-400 uppercase">{currentViewport}</div>
                      </div>

                      {/* Actual <iframe> */}
                      <iframe
                        title={`Iframe for ${file.path}`}
                        srcDoc={getProcessedHtmlDoc(file)}
                        sandbox="allow-scripts allow-same-origin allow-modals allow-forms allow-popups"
                        loading="lazy"
                        className="w-full h-[550px] border-none bg-white"
                      />
                    </div>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      )}

      {/* --- Fullscreen Modal for an individual iframe --- */}
      {fullscreenFile && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-sm p-4 sm:p-6 flex flex-col">
          <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-t-xl px-4 py-3 text-white">
            <div className="flex items-center gap-2 font-mono text-sm">
              <FileCode className="h-4 w-4 text-teal-400" />
              <span>{fullscreenFile}</span>
            </div>
            <button
              onClick={() => setFullscreenFile(null)}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 hover:text-white transition-colors"
            >
              <Minimize2 className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 bg-white rounded-b-xl overflow-hidden">
            {(() => {
              const file = indexFiles.find((f) => f.path === fullscreenFile);
              if (!file) return null;
              return (
                <iframe
                  title={`Fullscreen Iframe for ${file.path}`}
                  srcDoc={getProcessedHtmlDoc(file)}
                  sandbox="allow-scripts allow-same-origin allow-modals allow-forms allow-popups"
                  className="w-full h-full border-none"
                />
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};
