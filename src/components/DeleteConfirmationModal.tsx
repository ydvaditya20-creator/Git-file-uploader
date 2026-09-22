/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { 
  Trash2, 
  RefreshCw, 
  X, 
  Search 
} from "lucide-react";
import { RepoItem } from "../utils/githubHelpers";

interface DeleteConfirmationModalProps {
  // Single delete
  deletingItem: RepoItem | null;
  deleteCommitMsg: string;
  isDeleting: boolean;
  setDeletingItem: (item: RepoItem | null) => void;
  setDeleteCommitMsg: (msg: string) => void;
  handleDeleteConfirm: () => void;

  // Bulk delete
  isBulkDeleteModalOpen: boolean;
  isFetchingBulkDeleteList: boolean;
  isBulkDeleting: boolean;
  bulkDeleteItems: { path: string; sha: string; checked: boolean }[];
  bulkDeleteSearchQuery: string;
  bulkDeleteCommitMsg: string;
  bulkDeleteProgress: { current: number; total: number };
  setIsBulkDeleteModalOpen: (open: boolean) => void;
  setBulkDeleteSearchQuery: (query: string) => void;
  setBulkDeleteItems: React.Dispatch<React.SetStateAction<{ path: string; sha: string; checked: boolean }[]>>;
  setBulkDeleteCommitMsg: (msg: string) => void;
  handleBulkDeleteConfirm: () => void;
}

export const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({
  deletingItem,
  deleteCommitMsg,
  isDeleting,
  setDeletingItem,
  setDeleteCommitMsg,
  handleDeleteConfirm,

  isBulkDeleteModalOpen,
  isFetchingBulkDeleteList,
  isBulkDeleting,
  bulkDeleteItems,
  bulkDeleteSearchQuery,
  bulkDeleteCommitMsg,
  bulkDeleteProgress,
  setIsBulkDeleteModalOpen,
  setBulkDeleteSearchQuery,
  setBulkDeleteItems,
  setBulkDeleteCommitMsg,
  handleBulkDeleteConfirm,
}) => {
  return (
    <>
      {/* --- Single Delete modal --- */}
      {deletingItem && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" id="delete_modal">
          <div className="bg-white border border-rose-200 max-w-md w-full rounded-2xl shadow-2xl overflow-hidden p-6">
            <div className="text-center mb-5">
              <div className="p-3 bg-rose-50 text-rose-600 rounded-full inline-block mb-3 border border-rose-100 shadow-sm">
                <Trash2 className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">Delete File?</h3>
              <p className="text-slate-500 text-xs mt-1.5">
                Are you absolutely sure you want to delete <code className="bg-rose-50 font-mono text-rose-700 px-1.5 py-0.5 rounded border border-rose-100">{deletingItem.path}</code>? This action cannot be undone on GitHub.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-500 block mb-1 font-mono">
                  COMMIT MESSAGE
                </label>
                <input
                  type="text"
                  value={deleteCommitMsg}
                  onChange={(e) => setDeleteCommitMsg(e.target.value)}
                  placeholder={`Delete ${deletingItem.name}`}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-teal-500 focus:bg-white rounded-xl px-3 py-2 text-xs text-slate-800 outline-none shadow-inner"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setDeletingItem(null)}
                  className="w-1/2 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 py-2.5 rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteConfirm}
                  disabled={isDeleting}
                  className="w-1/2 bg-rose-600 hover:bg-rose-500 disabled:bg-rose-500/40 text-white py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm"
                >
                  {isDeleting ? (
                    <RefreshCw className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  Confirm Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- Bulk Delete Manager modal --- */}
      {isBulkDeleteModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" id="bulk_delete_modal">
          <div className="bg-white border border-slate-200 w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50 rounded-t-2xl">
              <div className="flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-red-600" />
                <h3 className="font-bold text-slate-800 text-base">Bulk Repository File Manager</h3>
              </div>
              <button
                onClick={() => setIsBulkDeleteModalOpen(false)}
                disabled={isBulkDeleting}
                className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-700 transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 flex-1 overflow-y-auto flex flex-col gap-4">
              
              {/* Fetching overlay */}
              {isFetchingBulkDeleteList ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <RefreshCw className="h-8 w-8 text-red-600 animate-spin" />
                  <p className="text-xs text-slate-500 font-mono">Loading full directory tree recursively...</p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Below is the live list of all items inside the repository. Check or uncheck files to choose what to delete from the GitHub server.
                  </p>

                  {/* Search and Bulk Toggle buttons */}
                  <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                    <div className="relative w-full sm:w-64">
                      <input
                        type="text"
                        value={bulkDeleteSearchQuery}
                        onChange={(e) => setBulkDeleteSearchQuery(e.target.value)}
                        placeholder="Search recursive paths..."
                        className="w-full bg-slate-50 border border-slate-200 focus:border-teal-500 focus:bg-white rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-800 outline-none shadow-inner"
                      />
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                      {bulkDeleteSearchQuery && (
                        <button
                          onClick={() => setBulkDeleteSearchQuery("")}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>

                    <div className="flex gap-2 w-full sm:w-auto shrink-0 justify-end text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          const filteredPaths = bulkDeleteItems
                            .filter(i => i.path.toLowerCase().includes(bulkDeleteSearchQuery.toLowerCase()))
                            .map(i => i.path);
                          const allFilteredAreChecked = bulkDeleteItems
                            .filter(i => filteredPaths.includes(i.path))
                            .every(i => i.checked);

                          setBulkDeleteItems(prev =>
                            prev.map(i =>
                              filteredPaths.includes(i.path)
                                ? { ...i, checked: !allFilteredAreChecked }
                                : i
                            )
                          );
                        }}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg text-slate-700 font-semibold"
                      >
                        Toggle Filtered Selection
                      </button>
                    </div>
                  </div>

                  {/* Progress tracker inside modal during active deletes */}
                  {isBulkDeleting && (
                    <div className="bg-red-50 border border-red-100 rounded-xl p-4 animate-pulse">
                      <div className="flex items-center justify-between text-xs font-bold text-red-700 mb-1.5">
                        <span className="flex items-center gap-1.5">
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          Deletions in Progress...
                        </span>
                        <span>{bulkDeleteProgress.current} of {bulkDeleteProgress.total}</span>
                      </div>
                      <div className="w-full bg-red-100 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-red-600 h-full transition-all duration-300"
                          style={{ width: `${(bulkDeleteProgress.current / bulkDeleteProgress.total) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Scrollable checklists */}
                  <div className="border border-slate-200 rounded-xl bg-slate-50/50 max-h-60 overflow-y-auto divide-y divide-slate-100">
                    {bulkDeleteItems.filter(item =>
                      item.path.toLowerCase().includes(bulkDeleteSearchQuery.toLowerCase())
                    ).length === 0 ? (
                      <div className="p-8 text-center text-slate-400 text-xs">
                        No files found matching "{bulkDeleteSearchQuery}"
                      </div>
                    ) : (
                      bulkDeleteItems
                        .filter(item => item.path.toLowerCase().includes(bulkDeleteSearchQuery.toLowerCase()))
                        .map(item => (
                          <label
                            key={item.path}
                            className="flex items-center gap-3 px-4 py-2.5 hover:bg-white transition-colors cursor-pointer text-xs text-slate-700 select-none font-mono"
                          >
                            <input
                              type="checkbox"
                              checked={item.checked}
                              disabled={isBulkDeleting}
                              onChange={() => {
                                setBulkDeleteItems(prev =>
                                  prev.map(f => (f.path === item.path ? { ...f, checked: !f.checked } : f))
                                );
                              }}
                              className="rounded border-slate-300 text-red-600 focus:ring-red-500 bg-white h-4 w-4 cursor-pointer"
                            />
                            <span className="truncate flex-1">{item.path}</span>
                          </label>
                        ))
                    )}
                  </div>

                  {/* Count indicator */}
                  <div className="text-xs text-slate-500 font-semibold font-mono bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                    Checked files: {bulkDeleteItems.filter(i => i.checked).length} of {bulkDeleteItems.length} total files
                  </div>

                  {/* Commit message field */}
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-1 font-mono uppercase">
                      BULK DELETE COMMIT MESSAGE
                    </label>
                    <input
                      type="text"
                      value={bulkDeleteCommitMsg}
                      disabled={isBulkDeleting}
                      onChange={(e) => setBulkDeleteCommitMsg(e.target.value)}
                      placeholder="e.g. Clean up unnecessary logs and duplicates"
                      className="w-full bg-slate-50 border border-slate-200 focus:border-teal-500 focus:bg-white rounded-lg px-3 py-2 text-xs text-slate-800 outline-none shadow-inner"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/50 rounded-b-2xl flex items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setIsBulkDeleteModalOpen(false)}
                disabled={isBulkDeleting}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl text-xs text-slate-700 font-semibold transition-all disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBulkDeleteConfirm}
                disabled={isBulkDeleting || isFetchingBulkDeleteList || bulkDeleteItems.filter(i => i.checked).length === 0}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-red-300 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
              >
                {isBulkDeleting ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    Deleting {bulkDeleteProgress.current}/{bulkDeleteProgress.total}...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-3.5 w-3.5" />
                    Bulk Delete Checked ({bulkDeleteItems.filter(i => i.checked).length})
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
};
