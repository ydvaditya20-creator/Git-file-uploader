/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  Globe, 
  ExternalLink, 
  Copy, 
  Check, 
  RefreshCw, 
  Monitor, 
  Tablet, 
  Smartphone, 
  Maximize2, 
  Minimize2, 
  Code, 
  AlertCircle, 
  FileCode, 
  Sparkles, 
  Layers,
  Info,
  Github,
  Play
} from "lucide-react";
import { Octokit } from "octokit";
import { decodeBase64Utf8 } from "../utils/githubHelpers";

interface ArtifactScreenProps {
  owner: string;
  repo: string;
  branch: string;
  token?: string;
  getOctokit: () => Octokit;
  onRefreshFiles?: () => void;
}

export const ArtifactScreen: React.FC<ArtifactScreenProps> = ({
  owner,
  repo,
  branch,
  token,
  getOctokit,
}) => {
  const [viewport, setViewport] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [previewMode, setPreviewMode] = useState<"sandbox" | "ghpages" | "htmlpreview">("sandbox");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  
  // HTML Artifact State
  const [htmlContent, setHtmlContent] = useState<string>("");
  const [availableHtmlFiles, setAvailableHtmlFiles] = useState<string[]>([]);
  const [selectedHtmlFile, setSelectedHtmlFile] = useState<string>("index.html");
  const [isLoadingArtifact, setIsLoadingArtifact] = useState<boolean>(false);
  const [artifactError, setArtifactError] = useState<string | null>(null);
  const [showCodeSource, setShowCodeSource] = useState<boolean>(false);
  
  // GitHub Pages State
  const [pagesStatus, setPagesStatus] = useState<{
    enabled: boolean;
    status?: string;
    url?: string;
    checking: boolean;
  }>({
    enabled: false,
    checking: false,
  });

  const ghPagesUrl = `https://${owner.toLowerCase()}.github.io/${repo}/`;
  const repoGithubUrl = `https://github.com/${owner}/${repo}`;
  const htmlPreviewUrl = `https://htmlpreview.github.io/?https://github.com/${owner}/${repo}/blob/${branch}/${selectedHtmlFile}`;

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLink(id);
    setTimeout(() => setCopiedLink(null), 2500);
  };

  // Check GitHub Pages Status via Octokit API
  const checkPagesStatus = async () => {
    setPagesStatus(prev => ({ ...prev, checking: true }));
    try {
      const octokit = getOctokit();
      const res = await octokit.rest.repos.getPages({
        owner,
        repo,
      });
      if (res.data) {
        setPagesStatus({
          enabled: true,
          status: res.data.status || "built",
          url: res.data.html_url || ghPagesUrl,
          checking: false,
        });
      }
    } catch (e: any) {
      // 404 means GitHub Pages is not enabled for this repo
      setPagesStatus({
        enabled: false,
        checking: false,
      });
    }
  };

  // Find all HTML files in repo & load the index.html or selected HTML
  const loadRepoArtifactFiles = async () => {
    if (!owner || !repo) return;
    setIsLoadingArtifact(true);
    setArtifactError(null);

    try {
      const octokit = getOctokit();

      // Resolve branch to tree SHA for robust recursive git tree resolution
      let resolvedTreeSha = branch;
      try {
        const branchInfo = await octokit.rest.repos.getBranch({ owner, repo, branch });
        if (branchInfo.data?.commit?.commit?.tree?.sha) {
          resolvedTreeSha = branchInfo.data.commit.commit.tree.sha;
        } else if (branchInfo.data?.commit?.sha) {
          resolvedTreeSha = branchInfo.data.commit.sha;
        }
      } catch (bErr) {
        console.warn("Could not resolve branch tree sha in ArtifactScreen", bErr);
      }

      let htmlFiles: string[] = [];

      // Scan git tree for all .html and .htm files
      try {
        const treeRes = await octokit.rest.git.getTree({
          owner,
          repo,
          tree_sha: resolvedTreeSha,
          recursive: "1",
        });

        htmlFiles = (treeRes.data.tree || [])
          .filter((node: any) => node.type === "blob" && node.path && (node.path.toLowerCase().endsWith(".html") || node.path.toLowerCase().endsWith(".htm")))
          .map((node: any) => node.path);
      } catch (treeErr) {
        console.warn("ArtifactScreen git.getTree failed, trying search fallback", treeErr);
      }

      // Fallback if tree returned nothing: GitHub code search
      if (htmlFiles.length === 0) {
        try {
          const searchRes = await octokit.rest.search.code({
            q: `extension:html repo:${owner}/${repo}`,
            per_page: 50,
          });
          htmlFiles = (searchRes.data.items || []).map((item: any) => item.path);
        } catch (searchErr) {
          console.warn("ArtifactScreen code search fallback failed", searchErr);
        }
      }

      // If still empty, assume at least index.html
      if (htmlFiles.length === 0) {
        htmlFiles = ["index.html"];
      }

      setAvailableHtmlFiles(htmlFiles);

      // Determine which file to load
      let targetFile = selectedHtmlFile;
      if (!htmlFiles.includes(targetFile)) {
        if (htmlFiles.includes("index.html")) {
          targetFile = "index.html";
        } else if (htmlFiles.length > 0) {
          targetFile = htmlFiles[0];
        } else {
          targetFile = "index.html";
        }
        setSelectedHtmlFile(targetFile);
      }

      // Fetch the selected HTML content
      const fileRes = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: targetFile,
        ref: branch,
      });

      if (!Array.isArray(fileRes.data) && fileRes.data.type === "file" && fileRes.data.content) {
        const decoded = decodeBase64Utf8(fileRes.data.content);
        setHtmlContent(decoded);
      } else {
        setHtmlContent("");
        setArtifactError(`Could not find or read ${targetFile} in branch ${branch}.`);
      }
    } catch (err: any) {
      console.warn("Artifact load error:", err);
      setHtmlContent("");
      setArtifactError(err.message || "Failed to load live HTML artifact from GitHub.");
    } finally {
      setIsLoadingArtifact(false);
    }
  };

  useEffect(() => {
    checkPagesStatus();
    loadRepoArtifactFiles();
  }, [owner, repo, branch, selectedHtmlFile]);

  // Construct iframe srcdoc with injected base URL so relative images and css resolve
  const getProcessedHtmlDoc = () => {
    if (!htmlContent) return "";
    
    // Add base tag for raw content resolution if not present
    const rawBaseUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/`;
    
    // If the HTML has a <head>, insert <base href="...">
    let doc = htmlContent;
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

  const getViewportWidthClass = () => {
    switch (viewport) {
      case "mobile":
        return "w-[375px] max-w-full";
      case "tablet":
        return "w-[768px] max-w-full";
      case "desktop":
      default:
        return "w-full";
    }
  };

  return (
    <div className={`flex flex-col gap-6 transition-all ${isFullscreen ? "fixed inset-0 z-50 bg-slate-900/95 p-4 sm:p-6 overflow-y-auto" : ""}`} id="artifact_screen_container">
      
      {/* --- Live Links Quick Navigation Header --- */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-teal-950 text-white rounded-2xl p-6 shadow-md border border-slate-700 relative overflow-hidden" id="live_links_banner">
        <div className="absolute right-0 top-0 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          {/* Left: Info */}
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="p-2 bg-teal-500/20 text-teal-400 rounded-xl border border-teal-500/30">
                <Globe className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  Live Repository & Artifact Screen
                  <span className="text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-mono">
                    Active Link
                  </span>
                </h3>
                <p className="text-xs text-slate-300">
                  Real-time live deployment & interactive artifact preview for <span className="font-mono text-teal-300 font-bold">{owner}/{repo}</span> ({branch})
                </p>
              </div>
            </div>

            {/* Links Bar */}
            <div className="flex flex-wrap items-center gap-2.5 pt-2">
              {/* GitHub Pages Live Link */}
              <div className="flex items-center bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-1.5 gap-2 text-xs">
                <span className="text-slate-400 font-semibold flex items-center gap-1 font-mono">
                  <Globe className="h-3.5 w-3.5 text-teal-400" />
                  Live URL:
                </span>
                <a
                  href={ghPagesUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-teal-300 hover:text-teal-200 underline truncate max-w-[240px] sm:max-w-xs"
                  title={ghPagesUrl}
                >
                  {ghPagesUrl}
                </a>
                <button
                  onClick={() => copyText(ghPagesUrl, "ghpages")}
                  title="Copy Live URL"
                  className="p-1 hover:bg-slate-700 rounded text-slate-300 hover:text-white transition-colors"
                >
                  {copiedLink === "ghpages" ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
                <a
                  href={ghPagesUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 hover:bg-slate-700 rounded text-slate-300 hover:text-white transition-colors"
                  title="Open Live Site in New Tab"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>

              {/* GitHub Repo Link */}
              <div className="flex items-center bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-1.5 gap-2 text-xs">
                <span className="text-slate-400 font-semibold flex items-center gap-1 font-mono">
                  <Github className="h-3.5 w-3.5 text-slate-300" />
                  GitHub:
                </span>
                <a
                  href={repoGithubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-slate-200 hover:text-white underline truncate max-w-[200px]"
                >
                  github.com/{owner}/{repo}
                </a>
                <button
                  onClick={() => copyText(repoGithubUrl, "repo")}
                  title="Copy GitHub Repo Link"
                  className="p-1 hover:bg-slate-700 rounded text-slate-300 hover:text-white transition-colors"
                >
                  {copiedLink === "repo" ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
                <a
                  href={repoGithubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 hover:bg-slate-700 rounded text-slate-300 hover:text-white transition-colors"
                  title="Open GitHub Repository"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          </div>

          {/* Right: Quick Action Buttons */}
          <div className="flex items-center gap-3 shrink-0">
            <a
              href={ghPagesUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 transition-all shadow-md active:scale-95"
            >
              <Globe className="h-4 w-4" />
              Open Live Site
              <ExternalLink className="h-3 w-3" />
            </a>

            <button
              onClick={() => {
                loadRepoArtifactFiles();
                checkPagesStatus();
              }}
              disabled={isLoadingArtifact}
              title="Reload Live Artifact"
              className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-white px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition-all"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoadingArtifact ? "animate-spin text-teal-400" : ""}`} />
              Sync Artifact
            </button>
          </div>
        </div>

        {/* GitHub Pages Status Helper */}
        <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-300">
            <span className={`h-2 w-2 rounded-full ${pagesStatus.enabled ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
            <span>GitHub Pages:</span>
            <strong className={pagesStatus.enabled ? "text-emerald-300" : "text-amber-300"}>
              {pagesStatus.enabled ? `Active (${pagesStatus.status || "Deployed"})` : "Standard URL Ready (Enable in GitHub Repo > Settings > Pages)"}
            </strong>
          </div>
          
          <div className="text-[11px] text-slate-400">
            💡 Tip: Any commits to <code className="bg-slate-800 text-teal-300 px-1 rounded font-mono">{branch}</code> will automatically reflect in the live artifact screen below.
          </div>
        </div>
      </div>

      {/* --- Interactive Artifact Screen Container --- */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden" id="artifact_viewer_window">
        
        {/* Top Control Bar of Artifact Screen */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/80 flex flex-wrap items-center justify-between gap-4">
          
          {/* Left: Mode Switcher & HTML File Selector */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center bg-slate-200/80 p-1 rounded-xl gap-1 text-xs">
              <button
                onClick={() => setPreviewMode("sandbox")}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                  previewMode === "sandbox"
                    ? "bg-white text-teal-700 shadow-sm font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Sparkles className="h-3.5 w-3.5 text-teal-600" />
                Live Sandbox Artifact
              </button>
              
              <button
                onClick={() => setPreviewMode("ghpages")}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                  previewMode === "ghpages"
                    ? "bg-white text-teal-700 shadow-sm font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Globe className="h-3.5 w-3.5 text-teal-600" />
                GitHub Pages Frame
              </button>

              <button
                onClick={() => setPreviewMode("htmlpreview")}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                  previewMode === "htmlpreview"
                    ? "bg-white text-teal-700 shadow-sm font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Layers className="h-3.5 w-3.5 text-teal-600" />
                HTML Preview
              </button>
            </div>

            {/* File Selector if multiple HTML files exist */}
            {availableHtmlFiles.length > 1 && (
              <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs shadow-inner">
                <FileCode className="h-3.5 w-3.5 text-teal-600" />
                <span className="text-slate-500 font-medium">Entry File:</span>
                <select
                  value={selectedHtmlFile}
                  onChange={(e) => setSelectedHtmlFile(e.target.value)}
                  className="bg-transparent font-mono font-semibold text-slate-800 outline-none cursor-pointer"
                >
                  {availableHtmlFiles.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Right: Viewport Controls, Code Inspector, Refresh, Fullscreen */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Viewport size switcher */}
            <div className="flex items-center bg-slate-200/80 p-1 rounded-xl gap-1 text-xs">
              <button
                onClick={() => setViewport("desktop")}
                title="Desktop View (100%)"
                className={`p-1.5 rounded-lg transition-all ${
                  viewport === "desktop" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <Monitor className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewport("tablet")}
                title="Tablet View (768px)"
                className={`p-1.5 rounded-lg transition-all ${
                  viewport === "tablet" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <Tablet className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewport("mobile")}
                title="Mobile View (375px)"
                className={`p-1.5 rounded-lg transition-all ${
                  viewport === "mobile" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <Smartphone className="h-4 w-4" />
              </button>
            </div>

            {/* View Source Code Button */}
            {previewMode === "sandbox" && (
              <button
                onClick={() => setShowCodeSource(!showCodeSource)}
                title="Inspect Artifact HTML Source"
                className={`p-2 border rounded-xl text-xs flex items-center gap-1.5 transition-all ${
                  showCodeSource
                    ? "bg-teal-50 border-teal-300 text-teal-700 font-bold"
                    : "bg-white hover:bg-slate-100 border-slate-200 text-slate-600"
                }`}
              >
                <Code className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Source</span>
              </button>
            )}

            {/* Refresh Frame */}
            <button
              onClick={loadRepoArtifactFiles}
              disabled={isLoadingArtifact}
              title="Refresh Preview"
              className="p-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-600 hover:text-teal-700 transition-colors disabled:opacity-40"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoadingArtifact ? "animate-spin text-teal-600" : ""}`} />
            </button>

            {/* Fullscreen Toggle */}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Artifact View"}
              className="p-2 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-600 hover:text-slate-900 transition-colors"
            >
              {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {/* Browser-like Address Bar */}
        <div className="px-6 py-2.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 flex-1 min-w-0 bg-white px-3 py-1.5 rounded-lg border border-slate-200 font-mono text-slate-600 shadow-inner">
            <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
            <span className="text-slate-400 select-none">https://</span>
            <span className="truncate text-slate-700">
              {previewMode === "sandbox"
                ? `artifact://${owner}/${repo}/${selectedHtmlFile}`
                : previewMode === "ghpages"
                ? `${owner.toLowerCase()}.github.io/${repo}/`
                : `htmlpreview.github.io/?...${selectedHtmlFile}`}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                const targetUrl = previewMode === "ghpages" ? ghPagesUrl : previewMode === "htmlpreview" ? htmlPreviewUrl : ghPagesUrl;
                window.open(targetUrl, "_blank");
              }}
              className="text-teal-600 hover:text-teal-800 font-semibold flex items-center gap-1 hover:underline text-xs"
            >
              Open Tab
              <ExternalLink className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Artifact Screen Frame Area */}
        <div className="bg-slate-900/5 p-4 sm:p-6 flex justify-center items-start min-h-[600px] overflow-x-auto relative">
          
          {/* If Loading */}
          {isLoadingArtifact && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-xs flex flex-col items-center justify-center gap-3 z-20">
              <RefreshCw className="h-10 w-10 text-teal-600 animate-spin" />
              <p className="text-sm font-semibold text-slate-700 font-mono">Rendering Live Artifact...</p>
            </div>
          )}

          {/* If Error */}
          {artifactError && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-8 max-w-xl mx-auto my-12 text-center space-y-3">
              <AlertCircle className="h-10 w-10 text-red-500 mx-auto" />
              <h4 className="font-bold text-red-800 text-base">Artifact File Not Found</h4>
              <p className="text-xs text-red-600 max-w-md mx-auto">
                {artifactError}
              </p>
              <div className="pt-2 text-xs text-slate-600">
                To view a live web artifact, please create an <code className="bg-white border border-slate-200 px-1.5 py-0.5 rounded font-mono font-bold">index.html</code> file in your repository using the file creator panel.
              </div>
            </div>
          )}

          {/* If Source Code mode is enabled */}
          {showCodeSource && previewMode === "sandbox" ? (
            <div className="w-full bg-slate-900 rounded-2xl border border-slate-800 text-slate-200 p-4 font-mono text-xs overflow-auto max-h-[650px] shadow-lg">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3 text-slate-400">
                <span className="font-bold text-teal-400">Source: {selectedHtmlFile}</span>
                <span>{htmlContent.length} bytes</span>
              </div>
              <pre className="whitespace-pre-wrap leading-relaxed">{htmlContent}</pre>
            </div>
          ) : (
            /* Live Iframe Screen Container */
            <div className={`transition-all duration-300 bg-white rounded-2xl border border-slate-300 shadow-xl overflow-hidden flex flex-col ${getViewportWidthClass()}`}>
              
              {/* Frame Header Decoration */}
              <div className="bg-slate-100 border-b border-slate-200 px-4 py-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                  <div className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                  <div className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                </div>
                <div className="text-[11px] font-mono text-slate-500 font-medium truncate max-w-xs">
                  {selectedHtmlFile} • {viewport.toUpperCase()}
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  {viewport === "mobile" ? "375px" : viewport === "tablet" ? "768px" : "100%"}
                </div>
              </div>

              {/* Render Selected Preview Mode */}
              {previewMode === "sandbox" ? (
                htmlContent ? (
                  <iframe
                    title="Live Artifact Sandbox Screen"
                    srcDoc={getProcessedHtmlDoc()}
                    sandbox="allow-scripts allow-same-origin allow-modals allow-forms allow-popups"
                    className="w-full h-[650px] border-none bg-white"
                  />
                ) : (
                  <div className="p-16 text-center space-y-3 bg-white">
                    <FileCode className="h-12 w-12 text-slate-300 mx-auto" />
                    <h5 className="font-bold text-slate-700">No HTML Content Loaded</h5>
                    <p className="text-xs text-slate-400 max-w-md mx-auto">
                      Create or upload an <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">index.html</code> file to see it run here live.
                    </p>
                  </div>
                )
              ) : previewMode === "ghpages" ? (
                <iframe
                  title="GitHub Pages Live Frame"
                  src={ghPagesUrl}
                  className="w-full h-[650px] border-none bg-white"
                />
              ) : (
                <iframe
                  title="HTML Preview Frame"
                  src={htmlPreviewUrl}
                  className="w-full h-[650px] border-none bg-white"
                />
              )}
            </div>
          )}

        </div>

      </div>

    </div>
  );
};
