/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// --- Types ---
export interface RepoItem {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: "file" | "dir";
  download_url: string | null;
  html_url: string;
}

export interface UploadingFile {
  id: string;
  file: File;
  path: string;
  status: "pending" | "uploading" | "success" | "error";
  checked: boolean;
  error?: string;
}

// --- Helper to recursively traverse entries and extract files with relative paths (stripping top-level folder name) ---
export const traverseFileTree = async (item: any, path: string = "", isTopLevel: boolean = true): Promise<File[]> => {
  return new Promise((resolve) => {
    if (item.isFile) {
      item.file((file: File) => {
        Object.defineProperty(file, "relativePath", {
          value: path + file.name,
          writable: true,
          enumerable: true,
          configurable: true
        });
        resolve([file]);
      });
    } else if (item.isDirectory) {
      const dirReader = item.createReader();
      const readAllEntries = async () => {
        let entries: any[] = [];
        const readEntries = async (): Promise<any[]> => {
          return new Promise((resolveEntries) => {
            dirReader.readEntries((result: any[]) => {
              resolveEntries(result || []);
            });
          });
        };
        
        let chunk = await readEntries();
        while (chunk.length > 0) {
          entries = entries.concat(chunk);
          chunk = await readEntries();
        }
        
        // If it's the top level directory, we do not prepend the directory's own name to its children's relative path.
        // This ensures the files and subfolders inside are uploaded directly without creating the top-level folder wrapper on Github.
        const nextPath = isTopLevel ? "" : path + item.name + "/";
        
        const filesPromises = entries.map(entry => 
          traverseFileTree(entry, nextPath, false)
        );
        const filesArrays = await Promise.all(filesPromises);
        resolve(filesArrays.flat());
      };
      readAllEntries();
    } else {
      resolve([]);
    }
  });
};

// --- Helper to Decode Base64 safely to UTF-8 ---
export const decodeBase64Utf8 = (base64Str: string): string => {
  try {
    const cleanBase64 = base64Str.replace(/\s/g, "");
    return decodeURIComponent(escape(atob(cleanBase64)));
  } catch (e) {
    try {
      const cleanBase64 = base64Str.replace(/\s/g, "");
      const binaryStr = atob(cleanBase64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      return new TextDecoder("utf-8").decode(bytes);
    } catch (err) {
      return "Unable to parse file. Content may be binary or invalid UTF-8.";
    }
  }
};

// --- Helper to Encode UTF-8 cleanly to Base64 ---
export const encodeBase64Utf8 = (text: string): string => {
  try {
    return btoa(unescape(encodeURIComponent(text)));
  } catch (e) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    const len = bytes.byteLength;
    const chunkSize = 0xffff;
    for (let i = 0; i < len; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, chunk as any);
    }
    return btoa(binary);
  }
};

// --- Convert a File to base64 string using highly efficient, non-blocking native browser Data URL reader ---
export const readFileAsBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const commaIndex = result.indexOf(",");
      if (commaIndex !== -1) {
        resolve(result.substring(commaIndex + 1));
      } else {
        reject(new Error("Failed to parse base64 data from file reader."));
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
};
