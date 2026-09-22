/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { 
  FileText, 
  Copy, 
  Download, 
  X, 
  RefreshCw, 
  Check, 
  Edit3 
} from "lucide-react";
import { RepoItem } from "../utils/githubHelpers";

interface FileViewerModalProps {
  selectedItem: RepoItem | null;
  selectedFileContent: string;
  isFileContentLoading: boolean;
  isEditing: boolean;
  editedContent: string;
  editCommitMsg: string;
  isSavingEdit: boolean;
  setSelectedItem: (item: RepoItem | null) => void;
  setIsEditing: (editing: boolean) => void;
  setEditedContent: (content: string) => void;
  setEditCommitMsg: (msg: string) => void;
  handleSaveEdit: () => void;
  copyToClipboard: (text: string) => void;
}

export const FileViewerModal: React.FC<FileViewerModalProps> = ({
  selectedItem,
  selectedFileContent,
  isFileContentLoading,
  isEditing,
  editedContent,
  editCommitMsg,
  isSavingEdit,
  setSelectedItem,
  setIsEditing,
  setEditedContent,
  setEditCommitMsg,
  handleSaveEdit,
  copyToClipboard,
}) => {
  if (!selectedItem) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" id="view_modal">
      <div className="bg-white border border-slate-200 w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50 rounded-t-2xl">
          <div className="min-w-0 flex-1 mr-4">
            <h3 className="font-bold text-slate-800 text-sm md:text-base truncate flex items-center gap-2 font-mono">
              <FileText className="h-4 w-4 text-teal-600 shrink-0" />
              {selectedItem.path}
            </h3>
            <p className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">
              SHA: {selectedItem.sha} • Size: {(selectedItem.size / 1024).toFixed(2)} KB
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => copyToClipboard(selectedItem.path)}
              title="Copy Path"
              className="p-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl text-slate-600 hover:text-slate-950 transition-all text-xs flex items-center gap-1.5 font-medium"
            >
              <Copy className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Copy Path</span>
            </button>
            {selectedItem.download_url && (
              <a
                href={selectedItem.download_url}
                target="_blank"
                rel="noreferrer"
                referrerPolicy="no-referrer"
                className="p-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl text-slate-600 hover:text-slate-950 transition-all text-xs flex items-center gap-1.5 font-medium"
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Raw</span>
              </a>
            )}
            <button
              onClick={() => setSelectedItem(null)}
              className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-700 transition-all"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col">
          {isFileContentLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <RefreshCw className="h-8 w-8 text-teal-600 animate-spin" />
              <p className="text-xs text-slate-500 font-mono">Loading file contents...</p>
            </div>
          ) : isEditing ? (
            /* Editable text-area */
            <div className="flex-1 flex flex-col gap-4">
              <div className="flex-1 min-h-[300px]">
                <textarea
                  value={editedContent}
                  onChange={(e) => setEditedContent(e.target.value)}
                  className="w-full h-full bg-slate-50 text-slate-800 p-4 rounded-xl border border-slate-200 focus:border-teal-500 focus:bg-white outline-none font-mono text-xs leading-relaxed resize-none shadow-inner"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                <div className="md:col-span-8">
                  <label className="text-[10px] font-bold text-slate-500 block mb-1 font-mono">
                    COMMIT MESSAGE
                  </label>
                  <input
                    type="text"
                    value={editCommitMsg}
                    onChange={(e) => setEditCommitMsg(e.target.value)}
                    placeholder={`Update ${selectedItem.name}`}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-teal-500 focus:bg-white rounded-xl px-3 py-2 text-xs text-slate-800 outline-none shadow-inner"
                  />
                </div>
                <div className="md:col-span-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="w-1/2 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 py-2 rounded-xl text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    disabled={isSavingEdit}
                    className="w-1/2 bg-teal-600 hover:bg-teal-500 disabled:bg-teal-400/60 text-white py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    {isSavingEdit ? (
                      <RefreshCw className="h-3 w-3 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    Save
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Read-only view */
            <div className="flex-1 flex flex-col">
              <div className="flex-1 bg-slate-50 p-4 rounded-xl border border-slate-200 overflow-x-auto max-h-[350px] shadow-inner">
                <pre className="text-slate-700 font-mono text-xs leading-relaxed whitespace-pre-wrap">
                  {selectedFileContent || "Empty file."}
                </pre>
              </div>
              
              <div className="mt-5 flex justify-end gap-3">
                <button
                  onClick={() => setIsEditing(true)}
                  className="bg-teal-600 hover:bg-teal-500 text-white font-bold px-5 py-2 rounded-xl text-xs transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  Edit File Content
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
