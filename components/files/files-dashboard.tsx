"use client";

import { ChangeEvent, DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  Check,
  ChevronRight,
  Download,
  Eye,
  File as FileIcon,
  FileText,
  Folder,
  FolderOpen,
  HardDrive,
  ImageIcon,
  Loader2,
  MoveRight,
  Music,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
  UploadCloud,
  Video,
  X,
} from "lucide-react";

import { formatBytes } from "@/lib/format";

type FileCategory = "images" | "documents" | "videos" | "audio" | "archives" | "other";
type PreviewKind = "image" | "pdf" | "text" | "audio" | "video";

type FileItem = {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  extension: string | null;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
  category: FileCategory;
  isImage: boolean;
  previewKind: PreviewKind | null;
};

type StorageSummary = {
  usedBytes: number;
  usedFormatted: string;
  fileCount: number;
  maxUploadSizeBytes: number;
  maxUploadSizeFormatted: string;
};

type FolderItem = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  fileCount: number;
  childCount: number;
  size: number;
  sizeFormatted: string;
  totalFileCount: number;
  totalSize: number;
  totalSizeFormatted: string;
  depth: number;
  path: Array<{
    id: string;
    name: string;
  }>;
};

type UploadStatus = "queued" | "uploading" | "done" | "failed" | "canceled";

type UploadItem = {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: UploadStatus;
  message?: string;
};

type EditableTextResponse = {
  file: FileItem;
  content: string;
  maxEditableSizeBytes: number;
  maxEditableSizeFormatted: string;
};

const categoryOptions: Array<{ value: "all" | FileCategory; label: string }> = [
  { value: "all", label: "All" },
  { value: "images", label: "Images" },
  { value: "documents", label: "Documents" },
  { value: "videos", label: "Videos" },
  { value: "audio", label: "Audio" },
  { value: "archives", label: "Archives" },
  { value: "other", label: "Other" },
];

const categoryIcons = {
  images: ImageIcon,
  documents: FileText,
  videos: Video,
  audio: Music,
  archives: Archive,
  other: FileIcon,
} satisfies Record<FileCategory, typeof FileIcon>;

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function TextPreview({ url }: { url: string }) {
  const [text, setText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isTruncated, setIsTruncated] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadTextPreview() {
      setIsLoading(true);
      setError("");

      try {
        const response = await fetch(url, { signal: controller.signal });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { message?: string } | null;
          throw new Error(payload?.message ?? "Could not load preview.");
        }

        setIsTruncated(response.headers.get("X-PiCloud-Preview-Truncated") === "true");
        setText(await response.text());
      } catch (previewError) {
        if (!controller.signal.aborted) {
          setError(previewError instanceof Error ? previewError.message : "Could not load preview.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadTextPreview();

    return () => controller.abort();
  }, [url]);

  if (isLoading) {
    return (
      <div className="flex min-h-72 items-center justify-center gap-2 text-sm text-muted">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Loading preview
      </div>
    );
  }

  if (error) {
    return <div className="rounded-md border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-300">{error}</div>;
  }

  return (
    <div className="space-y-3">
      {isTruncated ? (
        <div className="rounded-md border border-border bg-background px-3 py-2 text-xs text-muted">
          Showing the first 512 KB.
        </div>
      ) : null}
      <pre className="max-h-[65vh] overflow-auto rounded-md border border-border bg-background p-4 text-left font-mono text-xs leading-5 text-foreground whitespace-pre-wrap">
        {text || "This file is empty."}
      </pre>
    </div>
  );
}

export function FilesDashboard() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadRequestsRef = useRef(new Map<string, XMLHttpRequest>());
  const [files, setFiles] = useState<FileItem[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [storage, setStorage] = useState<StorageSummary | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState("root");
  const [newFolderName, setNewFolderName] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<"all" | FileCategory>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [bulkDestinationId, setBulkDestinationId] = useState("root");
  const [isBulkActionRunning, setIsBulkActionRunning] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [actionFileId, setActionFileId] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const [editingFile, setEditingFile] = useState<FileItem | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [editorOriginalContent, setEditorOriginalContent] = useState("");
  const [isEditorLoading, setIsEditorLoading] = useState(false);
  const [isEditorSaving, setIsEditorSaving] = useState(false);
  const [hasEditorContentLoaded, setHasEditorContentLoaded] = useState(false);
  const [editorError, setEditorError] = useState("");
  const [editorNotice, setEditorNotice] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedType = category === "all" ? "" : category;
  const currentFolder = folders.find((folder) => folder.id === currentFolderId) ?? null;
  const currentLocationLabel = currentFolder?.name ?? "Root";
  const childFolders = useMemo(
    () =>
      folders.filter((folder) =>
        currentFolderId === "root" ? folder.parentId === null : folder.parentId === currentFolderId,
      ),
    [currentFolderId, folders],
  );
  const breadcrumbs = useMemo(
    () => [{ id: "root", name: "Root" }, ...(currentFolder?.path ?? [])],
    [currentFolder],
  );
  const folderOptions = useMemo(
    () => [
      { id: "root", label: "Root", depth: 0 },
      ...folders.map((folder) => ({
        id: folder.id,
        label: folder.path.map((item) => item.name).join(" / "),
        depth: folder.depth + 1,
      })),
    ],
    [folders],
  );
  const selectedFiles = useMemo(
    () => files.filter((file) => selectedFileIds.includes(file.id)),
    [files, selectedFileIds],
  );
  const selectedVisibleFileIds = useMemo(() => selectedFiles.map((file) => file.id), [selectedFiles]);
  const allVisibleFilesSelected = files.length > 0 && selectedFiles.length === files.length;
  const isEditorDirty = editorContent !== editorOriginalContent;

  const fetchStorage = useCallback(async () => {
    const response = await fetch("/api/storage");
    const payload = (await response.json().catch(() => null)) as StorageSummary | { message?: string } | null;

    if (!response.ok) {
      throw new Error(payload && "message" in payload ? payload.message : "Could not load storage summary.");
    }

    setStorage(payload as StorageSummary);
  }, []);

  const fetchFolders = useCallback(async () => {
    const response = await fetch("/api/folders");
    const payload = (await response.json().catch(() => null)) as { folders?: FolderItem[]; message?: string } | null;

    if (!response.ok) {
      throw new Error(payload?.message ?? "Could not load folders.");
    }

    setFolders(payload?.folders ?? []);
  }, []);

  const fetchFiles = useCallback(async () => {
    const params = new URLSearchParams();

    params.set("folderId", currentFolderId);

    if (search.trim()) {
      params.set("q", search.trim());
    }

    if (selectedType) {
      params.set("type", selectedType);
    }

    const response = await fetch(`/api/files${params.toString() ? `?${params.toString()}` : ""}`);
    const payload = (await response.json().catch(() => null)) as { files?: FileItem[]; message?: string } | null;

    if (!response.ok) {
      throw new Error(payload?.message ?? "Could not load files.");
    }

    setFiles(payload?.files ?? []);
  }, [currentFolderId, search, selectedType]);

  const refresh = useCallback(async () => {
    setError("");

    try {
      await Promise.all([fetchFiles(), fetchFolders(), fetchStorage()]);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Could not refresh files.");
    } finally {
      setIsLoading(false);
    }
  }, [fetchFiles, fetchFolders, fetchStorage]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void refresh();
    }, 200);

    return () => window.clearTimeout(timeout);
  }, [refresh]);

  function navigateToFolder(folderId: string) {
    setCurrentFolderId(folderId);
    setSelectedFileIds([]);
  }

  function toggleFileSelection(fileId: string) {
    setSelectedFileIds((currentIds) =>
      currentIds.includes(fileId) ? currentIds.filter((id) => id !== fileId) : [...currentIds, fileId],
    );
  }

  function toggleAllVisibleFiles() {
    if (allVisibleFilesSelected) {
      setSelectedFileIds([]);
      return;
    }

    setSelectedFileIds(files.map((file) => file.id));
  }

  function downloadSelectedZip() {
    if (selectedVisibleFileIds.length === 0) {
      return;
    }

    window.location.assign(`/api/files/zip?fileIds=${selectedVisibleFileIds.map(encodeURIComponent).join(",")}`);
  }

  function downloadCurrentFolderZip() {
    window.location.assign(`/api/files/zip?folderId=${encodeURIComponent(currentFolderId)}`);
  }

  async function bulkMoveFiles() {
    if (selectedVisibleFileIds.length === 0 || bulkDestinationId === currentFolderId) {
      return;
    }

    setError("");
    setNotice("");
    setIsBulkActionRunning(true);

    try {
      const response = await fetch("/api/files/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileIds: selectedVisibleFileIds, folderId: bulkDestinationId }),
      });
      const payload = (await response.json().catch(() => null)) as { movedCount?: number; message?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "Could not move selected files.");
      }

      setNotice(`${payload?.movedCount ?? selectedVisibleFileIds.length} file${selectedVisibleFileIds.length === 1 ? "" : "s"} moved.`);
      setSelectedFileIds([]);
      await refresh();
    } catch (bulkMoveError) {
      setError(bulkMoveError instanceof Error ? bulkMoveError.message : "Could not move selected files.");
    } finally {
      setIsBulkActionRunning(false);
    }
  }

  async function bulkDeleteFiles() {
    if (selectedVisibleFileIds.length === 0) {
      return;
    }

    if (!window.confirm(`Delete ${selectedVisibleFileIds.length} selected file${selectedVisibleFileIds.length === 1 ? "" : "s"}?`)) {
      return;
    }

    setError("");
    setNotice("");
    setIsBulkActionRunning(true);

    try {
      const response = await fetch("/api/files/bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileIds: selectedVisibleFileIds }),
      });
      const payload = (await response.json().catch(() => null)) as { deletedCount?: number; message?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "Could not delete selected files.");
      }

      setNotice(`${payload?.deletedCount ?? selectedVisibleFileIds.length} file${selectedVisibleFileIds.length === 1 ? "" : "s"} deleted.`);
      setSelectedFileIds([]);
      await refresh();
    } catch (bulkDeleteError) {
      setError(bulkDeleteError instanceof Error ? bulkDeleteError.message : "Could not delete selected files.");
    } finally {
      setIsBulkActionRunning(false);
    }
  }

  function updateUploadItem(id: string, update: Partial<UploadItem>) {
    setUploadItems((currentItems) =>
      currentItems.map((item) => (item.id === id ? { ...item, ...update } : item)),
    );
  }

  function cancelUpload(id: string) {
    const request = uploadRequestsRef.current.get(id);

    if (request) {
      request.abort();
    }
  }

  function uploadSingleFile(uploadItem: UploadItem, file: globalThis.File) {
    return new Promise<UploadStatus>((resolve) => {
      const params = new URLSearchParams({ folderId: currentFolderId });
      const formData = new FormData();
      const request = new XMLHttpRequest();

      formData.append("file", file);
      uploadRequestsRef.current.set(uploadItem.id, request);
      updateUploadItem(uploadItem.id, { status: "uploading", progress: 0 });

      request.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          updateUploadItem(uploadItem.id, {
            progress: Math.min(100, Math.round((event.loaded / event.total) * 100)),
          });
        }
      };

      request.onload = () => {
        uploadRequestsRef.current.delete(uploadItem.id);

        if (request.status >= 200 && request.status < 300) {
          updateUploadItem(uploadItem.id, { status: "done", progress: 100 });
          resolve("done");
          return;
        }

        let message = "Upload failed.";

        try {
          message = (JSON.parse(request.responseText) as { message?: string }).message ?? message;
        } catch {
          message = request.responseText || message;
        }

        updateUploadItem(uploadItem.id, { status: "failed", message });
        resolve("failed");
      };

      request.onerror = () => {
        uploadRequestsRef.current.delete(uploadItem.id);
        updateUploadItem(uploadItem.id, { status: "failed", message: "Network error during upload." });
        resolve("failed");
      };

      request.onabort = () => {
        uploadRequestsRef.current.delete(uploadItem.id);
        updateUploadItem(uploadItem.id, { status: "canceled", message: "Canceled." });
        resolve("canceled");
      };

      request.open("POST", `/api/files/upload?${params.toString()}`);
      request.send(formData);
    });
  }

  async function uploadFiles(selectedFiles: globalThis.File[]) {
      if (selectedFiles.length === 0) {
        return;
      }

      setError("");
      setNotice("");

      const maxUploadSize = storage?.maxUploadSizeBytes ?? 1_073_741_824;
      const uploadBatch = selectedFiles.map((file) => ({
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        progress: file.size > maxUploadSize ? 100 : 0,
        status: file.size > maxUploadSize ? ("failed" as const) : ("queued" as const),
        message:
          file.size > maxUploadSize
            ? `File is ${formatBytes(file.size)}. The limit is ${formatBytes(maxUploadSize)}.`
            : undefined,
        file,
      }));
      const validUploads = uploadBatch.filter((item) => item.status !== "failed");

      setIsUploading(true);
      setUploadItems((currentItems) => [
        ...uploadBatch.map((item) => ({
          id: item.id,
          name: item.name,
          size: item.size,
          progress: item.progress,
          status: item.status,
          message: item.message,
        })),
        ...currentItems,
      ]);

      try {
        const results = await Promise.all(validUploads.map((item) => uploadSingleFile(item, item.file)));
        const completedCount = results.filter((result) => result === "done").length;
        const failedCount =
          uploadBatch.filter((item) => item.status === "failed").length +
          results.filter((result) => result === "failed" || result === "canceled").length;

        if (completedCount > 0) {
          setNotice(`${completedCount} file${completedCount === 1 ? "" : "s"} uploaded.`);
        }

        if (failedCount > 0) {
          setError(`${failedCount} file${failedCount === 1 ? "" : "s"} could not be uploaded.`);
        }

        await refresh();
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
  }

  async function createFolder() {
    const folderName = newFolderName.trim();

    if (!folderName) {
      setError("Folder name is required.");
      return;
    }

    setError("");
    setNotice("");
    setIsCreatingFolder(true);

    try {
      const response = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: folderName, parentId: currentFolderId }),
      });
      const payload = (await response.json().catch(() => null)) as { folder?: FolderItem; message?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "Could not create folder.");
      }

      setNewFolderName("");
      setNotice("Folder created.");
      await refresh();
    } catch (folderError) {
      setError(folderError instanceof Error ? folderError.message : "Could not create folder.");
    } finally {
      setIsCreatingFolder(false);
    }
  }

  async function deleteFolder(folder: FolderItem) {
    if (!window.confirm(`Delete folder "${folder.name}"? It must not contain files or subfolders.`)) {
      return;
    }

    setError("");
    setNotice("");
    setActionFileId(folder.id);

    try {
      const response = await fetch(`/api/folders/${folder.id}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "Could not delete folder.");
      }

      if (currentFolderId === folder.id) {
        setCurrentFolderId("root");
      }

      setNotice("Folder deleted.");
      await refresh();
    } catch (folderError) {
      setError(folderError instanceof Error ? folderError.message : "Could not delete folder.");
    } finally {
      setActionFileId(null);
    }
  }

  function onFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    void uploadFiles(Array.from(event.target.files ?? []));
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    void uploadFiles(Array.from(event.dataTransfer.files));
  }

  function startRename(file: FileItem) {
    setError("");
    setNotice("");
    setRenamingId(file.id);
    setRenameValue(file.originalName);
  }

  async function submitRename(file: FileItem) {
    const nextName = renameValue.trim();

    if (!nextName) {
      setError("File name is required.");
      return;
    }

    setError("");
    setNotice("");
    setActionFileId(file.id);

    try {
      const response = await fetch(`/api/files/${file.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ originalName: nextName }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "Could not rename file.");
      }

      setRenamingId(null);
      setRenameValue("");
      setNotice("File renamed.");
      setEditingFile((currentFile) =>
        currentFile?.id === file.id ? { ...currentFile, originalName: nextName } : currentFile,
      );
      await refresh();
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : "Could not rename file.");
    } finally {
      setActionFileId(null);
    }
  }

  async function deleteFile(file: FileItem) {
    if (!window.confirm(`Delete "${file.originalName}"?`)) {
      return;
    }

    setError("");
    setNotice("");
    setActionFileId(file.id);

    try {
      const response = await fetch(`/api/files/${file.id}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "Could not delete file.");
      }

      if (renamingId === file.id) {
        setRenamingId(null);
        setRenameValue("");
      }

      if (editingFile?.id === file.id) {
        setEditingFile(null);
        setEditorContent("");
        setEditorOriginalContent("");
        setEditorError("");
        setEditorNotice("");
        setHasEditorContentLoaded(false);
      }

      if (previewFile?.id === file.id) {
        setPreviewFile(null);
      }

      setSelectedFileIds((currentIds) => currentIds.filter((id) => id !== file.id));
      setNotice("File deleted.");
      await refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete file.");
    } finally {
      setActionFileId(null);
    }
  }

  function downloadFile(file: FileItem) {
    window.location.assign(`/api/files/${file.id}/download`);
  }

  function canOpenPreview(file: FileItem) {
    return file.previewKind !== null || file.category === "documents";
  }

  function canEditText(file: FileItem) {
    return file.previewKind === "text";
  }

  function resetEditorState() {
    setEditingFile(null);
    setEditorContent("");
    setEditorOriginalContent("");
    setEditorError("");
    setEditorNotice("");
    setIsEditorLoading(false);
    setIsEditorSaving(false);
    setHasEditorContentLoaded(false);
  }

  function closeTextEditor() {
    if (isEditorDirty && !window.confirm("Discard unsaved text changes?")) {
      return;
    }

    resetEditorState();
  }

  async function openTextEditor(file: FileItem) {
    if (!canEditText(file)) {
      return;
    }

    if (isEditorDirty && !window.confirm("Discard unsaved text changes?")) {
      return;
    }

    setPreviewFile(null);
    setEditingFile(file);
    setEditorContent("");
    setEditorOriginalContent("");
    setEditorError("");
    setEditorNotice("");
    setHasEditorContentLoaded(false);
    setIsEditorLoading(true);

    try {
      const response = await fetch(`/api/files/${file.id}`);
      const payload = (await response.json().catch(() => null)) as EditableTextResponse | { message?: string } | null;

      if (!response.ok || !payload || !("content" in payload)) {
        throw new Error(payload && "message" in payload ? payload.message : "Could not load text file.");
      }

      setEditingFile(payload.file);
      setEditorContent(payload.content);
      setEditorOriginalContent(payload.content);
      setHasEditorContentLoaded(true);
      setFiles((currentFiles) =>
        currentFiles.map((currentFile) => (currentFile.id === payload.file.id ? payload.file : currentFile)),
      );
    } catch (editorLoadError) {
      setEditorError(editorLoadError instanceof Error ? editorLoadError.message : "Could not load text file.");
    } finally {
      setIsEditorLoading(false);
    }
  }

  async function saveTextEdit() {
    if (!editingFile) {
      return;
    }

    setEditorError("");
    setEditorNotice("");
    setIsEditorSaving(true);

    try {
      const response = await fetch(`/api/files/${editingFile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editorContent }),
      });
      const payload = (await response.json().catch(() => null)) as EditableTextResponse | { message?: string } | null;

      if (!response.ok || !payload || !("content" in payload)) {
        throw new Error(payload && "message" in payload ? payload.message : "Could not save text file.");
      }

      setEditingFile(payload.file);
      setEditorContent(payload.content);
      setEditorOriginalContent(payload.content);
      setHasEditorContentLoaded(true);
      setEditorNotice("Saved.");
      setNotice("Text file saved.");
      setFiles((currentFiles) =>
        currentFiles.map((currentFile) => (currentFile.id === payload.file.id ? payload.file : currentFile)),
      );
      await refresh();
    } catch (editorSaveError) {
      setEditorError(editorSaveError instanceof Error ? editorSaveError.message : "Could not save text file.");
    } finally {
      setIsEditorSaving(false);
    }
  }

  function renderPreviewContent(file: FileItem) {
    const previewUrl = `/api/files/${file.id}/preview`;

    if (file.previewKind === "image") {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt={file.originalName}
          className="max-h-[70vh] w-full rounded-md object-contain"
        />
      );
    }

    if (file.previewKind === "video") {
      return <video src={previewUrl} controls className="max-h-[70vh] w-full rounded-md bg-black" />;
    }

    if (file.previewKind === "audio") {
      return (
        <div className="rounded-md border border-border bg-background p-6">
          <Music className="mx-auto mb-5 size-10 text-accent" aria-hidden="true" />
          <audio src={previewUrl} controls className="w-full" />
        </div>
      );
    }

    if (file.previewKind === "pdf") {
      return (
        <iframe
          src={previewUrl}
          title={file.originalName}
          className="h-[70vh] w-full rounded-md border border-border bg-background"
        />
      );
    }

    if (file.previewKind === "text") {
      return <TextPreview url={previewUrl} />;
    }

    return (
      <div className="rounded-md border border-border bg-background p-8 text-center">
        <FileText className="mx-auto mb-4 size-10 text-muted" aria-hidden="true" />
        <p className="font-medium">Preview is not available for this document format.</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          PDFs and text-like documents can be previewed locally. Office formats need a converter before they can render in the browser.
        </p>
        <button
          type="button"
          onClick={() => downloadFile(file)}
          className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-background transition hover:opacity-90"
        >
          <Download className="size-4" aria-hidden="true" />
          Download
        </button>
      </div>
    );
  }

  const storagePercent = useMemo(() => {
    if (!storage?.maxUploadSizeBytes) {
      return 0;
    }

    return Math.min(100, Math.round((storage.usedBytes / storage.maxUploadSizeBytes) * 100));
  }, [storage]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm text-muted">Manage uploaded files</p>
          <h1 className="mt-1 text-2xl font-semibold">Files</h1>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border px-3 text-sm text-muted transition hover:border-accent hover:text-foreground"
        >
          <RefreshCcw className="size-4" aria-hidden="true" />
          Refresh
        </button>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-5">
          <HardDrive className="mb-4 size-5 text-accent" aria-hidden="true" />
          <p className="text-sm text-muted">Storage used</p>
          <p className="mt-2 text-2xl font-semibold">{storage?.usedFormatted ?? "..."}</p>
          <div className="mt-4 h-2 rounded-full bg-background">
            <div className="h-2 rounded-full bg-accent" style={{ width: `${storagePercent}%` }} />
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <FileIcon className="mb-4 size-5 text-accent" aria-hidden="true" />
          <p className="text-sm text-muted">Files</p>
          <p className="mt-2 text-2xl font-semibold">{storage?.fileCount ?? "..."}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <UploadCloud className="mb-4 size-5 text-accent" aria-hidden="true" />
          <p className="text-sm text-muted">Upload limit</p>
          <p className="mt-2 text-2xl font-semibold">{storage?.maxUploadSizeFormatted ?? "1 GB"}</p>
        </div>
      </section>

      <section
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={`rounded-lg border border-dashed bg-card p-8 text-center transition ${
          isDragging ? "border-accent" : "border-border"
        }`}
      >
        <UploadCloud className="mx-auto mb-4 size-10 text-accent" aria-hidden="true" />
        <h2 className="text-lg font-semibold">Drop files here</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Upload into {currentLocationLabel} up to {storage?.maxUploadSizeFormatted ?? "1 GB"} per request.
        </p>
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={onFileInputChange} />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isUploading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <UploadCloud className="size-4" aria-hidden="true" />}
          {isUploading ? "Uploading" : "Choose files"}
        </button>
      </section>

      {uploadItems.length > 0 ? (
        <section className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <p className="text-sm font-medium">Uploads</p>
              <p className="mt-1 text-xs text-muted">Progress, cancellation, and per-file failures.</p>
            </div>
            <button
              type="button"
              onClick={() =>
                setUploadItems((currentItems) =>
                  currentItems.filter((item) => item.status === "uploading" || item.status === "queued"),
                )
              }
              className="h-9 rounded-md border border-border px-3 text-sm text-muted transition hover:border-accent hover:text-foreground"
            >
              Clear finished
            </button>
          </div>
          <div className="divide-y divide-border">
            {uploadItems.map((item) => (
              <div key={item.id} className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_100px_90px] md:items-center">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  <p className="mt-1 text-xs text-muted">
                    {formatBytes(item.size)} - {item.message ?? item.status}
                  </p>
                  <div className="mt-2 h-2 rounded-full bg-background">
                    <div
                      className={`h-2 rounded-full ${item.status === "failed" ? "bg-red-500" : "bg-accent"}`}
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                </div>
                <div className="text-sm text-muted">{item.progress}%</div>
                <div>
                  {item.status === "uploading" || item.status === "queued" ? (
                    <button
                      type="button"
                      onClick={() => cancelUpload(item.id)}
                      className="h-9 rounded-md border border-border px-3 text-sm text-muted transition hover:border-red-400 hover:text-red-500"
                    >
                      Cancel
                    </button>
                  ) : (
                    <span className="text-sm text-muted">{item.status}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-lg border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium">Folders</p>
            <div className="mt-2 flex flex-wrap items-center gap-1 text-xs text-muted">
              {breadcrumbs.map((crumb, index) => (
                <span key={crumb.id} className="inline-flex items-center gap-1">
                  {index > 0 ? <ChevronRight className="size-3" aria-hidden="true" /> : null}
                  <button
                    type="button"
                    onClick={() => navigateToFolder(crumb.id)}
                    className={`rounded px-1.5 py-1 transition hover:bg-background hover:text-foreground ${
                      crumb.id === currentFolderId ? "text-foreground" : ""
                    }`}
                  >
                    {crumb.name}
                  </button>
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2 md:flex-row">
            <button
              type="button"
              onClick={downloadCurrentFolderZip}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border px-3 text-sm text-muted transition hover:border-accent hover:text-foreground"
            >
              <Archive className="size-4" aria-hidden="true" />
              Download ZIP
            </button>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void createFolder();
              }}
              className="flex flex-col gap-2 sm:flex-row"
            >
              <input
                value={newFolderName}
                onChange={(event) => setNewFolderName(event.target.value)}
                placeholder="New folder"
                className="h-10 min-w-0 rounded-md border border-border bg-background px-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 sm:w-56"
              />
              <button
                type="submit"
                disabled={isCreatingFolder}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isCreatingFolder ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
                Create
              </button>
            </form>
          </div>
        </div>

        <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
          {currentFolderId !== "root" ? (
            <button
              type="button"
              onClick={() => navigateToFolder(currentFolder?.parentId ?? "root")}
              className="flex min-h-24 items-start gap-3 rounded-lg border border-border bg-background p-4 text-left transition hover:border-accent"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-card text-accent">
                <FolderOpen className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">Parent folder</span>
                <span className="mt-1 block text-xs text-muted">Go up one level</span>
              </span>
            </button>
          ) : null}

          {childFolders.map((folder) => (
            <div key={folder.id} className="flex min-h-24 items-start gap-3 rounded-lg border border-border bg-background p-4 transition hover:border-accent">
              <button
                type="button"
                onClick={() => navigateToFolder(folder.id)}
                className="flex min-w-0 flex-1 items-start gap-3 text-left"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-card text-accent">
                  <Folder className="size-5" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{folder.name}</span>
                  <span className="mt-1 block text-xs text-muted">
                    {folder.childCount} folder{folder.childCount === 1 ? "" : "s"} - {folder.totalFileCount} file{folder.totalFileCount === 1 ? "" : "s"}
                  </span>
                  <span className="mt-1 block text-xs text-muted">
                    {folder.totalSizeFormatted}
                  </span>
                </span>
              </button>
              <button
                type="button"
                title="Delete folder"
                aria-label={`Delete folder ${folder.name}`}
                onClick={() => void deleteFolder(folder)}
                disabled={actionFileId === folder.id}
                className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border text-muted transition hover:border-red-400 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {actionFileId === folder.id ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Trash2 className="size-4" aria-hidden="true" />}
              </button>
            </div>
          ))}

          {childFolders.length === 0 ? (
            <div className="flex min-h-24 items-center justify-center rounded-lg border border-border bg-background p-4 text-center text-sm text-muted md:col-span-2 xl:col-span-3">
              No subfolders in {currentLocationLabel}.
            </div>
          ) : null}
        </div>
      </section>

      {error ? (
        <div className="rounded-md border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {notice ? (
        <div className="rounded-md border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-foreground">
          {notice}
        </div>
      ) : null}

      <section className="rounded-lg border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium">Files in {currentLocationLabel}</p>
            <p className="mt-1 text-xs text-muted">Search and filters apply to this location.</p>
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative w-full md:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search files"
                className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            </div>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as "all" | FileCategory)}
              className="h-10 rounded-md border border-border bg-background px-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            >
              {categoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!isLoading && files.length > 0 ? (
          <div className="flex flex-col gap-3 border-b border-border bg-background/40 px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
            <label className="inline-flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={allVisibleFilesSelected}
                onChange={toggleAllVisibleFiles}
                className="size-4 rounded border-border accent-[var(--accent)]"
              />
              Select visible
            </label>

            {selectedFiles.length > 0 ? (
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <span className="text-sm text-muted">
                  {selectedFiles.length} selected
                </span>
                <button
                  type="button"
                  onClick={downloadSelectedZip}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border px-3 text-sm text-muted transition hover:border-accent hover:text-foreground"
                >
                  <Archive className="size-4" aria-hidden="true" />
                  ZIP
                </button>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <select
                    value={bulkDestinationId}
                    onChange={(event) => setBulkDestinationId(event.target.value)}
                    className="h-9 min-w-0 rounded-md border border-border bg-card px-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20 sm:w-64"
                  >
                    {folderOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {"  ".repeat(option.depth)}
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void bulkMoveFiles()}
                    disabled={isBulkActionRunning || bulkDestinationId === currentFolderId}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border px-3 text-sm text-muted transition hover:border-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isBulkActionRunning ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <MoveRight className="size-4" aria-hidden="true" />}
                    Move
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => void bulkDeleteFiles()}
                  disabled={isBulkActionRunning}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border px-3 text-sm text-muted transition hover:border-red-400 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isBulkActionRunning ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Trash2 className="size-4" aria-hidden="true" />}
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedFileIds([])}
                  disabled={isBulkActionRunning}
                  className="h-9 rounded-md border border-border px-3 text-sm text-muted transition hover:border-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Clear
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {isLoading ? (
          <div className="flex min-h-44 items-center justify-center gap-2 px-4 py-8 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Loading files
          </div>
        ) : files.length === 0 ? (
          <div className="flex min-h-44 flex-col items-center justify-center px-4 py-8 text-center">
            <FileIcon className="mb-3 size-8 text-muted" aria-hidden="true" />
            <p className="font-medium">No files found</p>
            <p className="mt-1 text-sm text-muted">Uploaded files that match the current filters will appear here.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {files.map((file) => {
              const Icon = categoryIcons[file.category];
              const isBusy = actionFileId === file.id;
              const isRenaming = renamingId === file.id;

              return (
                <div key={file.id} className="grid gap-3 px-4 py-4 md:grid-cols-[32px_minmax(0,1fr)_120px_170px_216px] md:items-center">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      checked={selectedFileIds.includes(file.id)}
                      onChange={() => toggleFileSelection(file.id)}
                      aria-label={`Select ${file.originalName}`}
                      className="size-4 rounded border-border accent-[var(--accent)]"
                    />
                  </div>
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-background text-accent">
                      {file.previewKind === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`/api/files/${file.id}/thumbnail`}
                          alt=""
                          className="size-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <Icon className="size-5" aria-hidden="true" />
                      )}
                    </span>
                    {isRenaming ? (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          void submitRename(file);
                        }}
                        className="flex min-w-0 flex-1 items-center gap-2"
                      >
                        <input
                          value={renameValue}
                          onChange={(event) => setRenameValue(event.target.value)}
                          className="h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                          autoFocus
                        />
                        <button
                          type="submit"
                          disabled={isBusy}
                          title="Save"
                          aria-label="Save file name"
                          className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border text-muted transition hover:border-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isBusy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          title="Cancel"
                          aria-label="Cancel rename"
                          onClick={() => {
                            setRenamingId(null);
                            setRenameValue("");
                          }}
                          className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border text-muted transition hover:border-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <X className="size-4" aria-hidden="true" />
                        </button>
                      </form>
                    ) : (
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{file.originalName}</p>
                        <p className="mt-1 truncate text-xs text-muted">{file.mimeType || "application/octet-stream"}</p>
                      </div>
                    )}
                  </div>
                  <div className="text-sm text-muted">{formatBytes(file.size)}</div>
                  <div className="text-sm text-muted">{formatDate(file.createdAt)}</div>
                  <div className="flex items-center gap-2">
                    {canEditText(file) ? (
                      <button
                        type="button"
                        title="Edit text"
                        aria-label={`Edit ${file.originalName}`}
                        onClick={() => void openTextEditor(file)}
                        disabled={isBusy || isRenaming}
                        className="flex size-9 items-center justify-center rounded-md border border-border text-muted transition hover:border-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <FileText className="size-4" aria-hidden="true" />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      title={canOpenPreview(file) ? "Preview" : "Preview unavailable"}
                      aria-label={`Preview ${file.originalName}`}
                      onClick={() => setPreviewFile(file)}
                      disabled={isBusy || !canOpenPreview(file)}
                      className="flex size-9 items-center justify-center rounded-md border border-border text-muted transition hover:border-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Eye className="size-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      title="Download"
                      aria-label={`Download ${file.originalName}`}
                      onClick={() => downloadFile(file)}
                      disabled={isBusy}
                      className="flex size-9 items-center justify-center rounded-md border border-border text-muted transition hover:border-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Download className="size-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      title="Rename"
                      aria-label={`Rename ${file.originalName}`}
                      onClick={() => startRename(file)}
                      disabled={isBusy || isRenaming}
                      className="flex size-9 items-center justify-center rounded-md border border-border text-muted transition hover:border-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      title="Delete"
                      aria-label={`Delete ${file.originalName}`}
                      onClick={() => void deleteFile(file)}
                      disabled={isBusy}
                      className="flex size-9 items-center justify-center rounded-md border border-border text-muted transition hover:border-red-400 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isBusy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Trash2 className="size-4" aria-hidden="true" />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {previewFile ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-lg border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{previewFile.originalName}</p>
                <p className="mt-1 text-xs text-muted">
                  {previewFile.mimeType || "application/octet-stream"} - {formatBytes(previewFile.size)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {canEditText(previewFile) ? (
                  <button
                    type="button"
                    onClick={() => void openTextEditor(previewFile)}
                    title="Edit text"
                    aria-label={`Edit ${previewFile.originalName}`}
                    className="flex size-9 items-center justify-center rounded-md border border-border text-muted transition hover:border-accent hover:text-foreground"
                  >
                    <FileText className="size-4" aria-hidden="true" />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => downloadFile(previewFile)}
                  title="Download"
                  aria-label={`Download ${previewFile.originalName}`}
                  className="flex size-9 items-center justify-center rounded-md border border-border text-muted transition hover:border-accent hover:text-foreground"
                >
                  <Download className="size-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewFile(null)}
                  title="Close"
                  aria-label="Close preview"
                  className="flex size-9 items-center justify-center rounded-md border border-border text-muted transition hover:border-accent hover:text-foreground"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="overflow-auto p-4">{renderPreviewContent(previewFile)}</div>
          </div>
        </div>
      ) : null}

      {editingFile ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col rounded-lg border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{editingFile.originalName}</p>
                <p className="mt-1 text-xs text-muted">
                  {editingFile.mimeType || "text/plain"} - {formatBytes(editingFile.size)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => downloadFile(editingFile)}
                  title="Download"
                  aria-label={`Download ${editingFile.originalName}`}
                  className="flex size-9 items-center justify-center rounded-md border border-border text-muted transition hover:border-accent hover:text-foreground"
                >
                  <Download className="size-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={closeTextEditor}
                  title="Close"
                  aria-label="Close editor"
                  className="flex size-9 items-center justify-center rounded-md border border-border text-muted transition hover:border-accent hover:text-foreground"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-4">
              {isEditorLoading ? (
                <div className="flex min-h-72 items-center justify-center gap-2 text-sm text-muted">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Loading text
                </div>
              ) : !hasEditorContentLoaded && editorError ? (
                <div className="rounded-md border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-300">{editorError}</div>
              ) : (
                <div className="space-y-3">
                  {editorError ? (
                    <div className="rounded-md border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300">{editorError}</div>
                  ) : null}
                  <textarea
                    value={editorContent}
                    onChange={(event) => {
                      setEditorContent(event.target.value);
                      setEditorError("");
                      setEditorNotice("");
                    }}
                    spellCheck={false}
                    aria-label={`Text content for ${editingFile.originalName}`}
                    className="min-h-[58vh] w-full resize-y rounded-md border border-border bg-background p-4 font-mono text-sm leading-6 text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
                  />
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-h-5 text-sm">
                {editorNotice ? <span className="text-accent">{editorNotice}</span> : null}
                {isEditorDirty && !editorNotice ? <span className="text-muted">Unsaved changes</span> : null}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closeTextEditor}
                  disabled={isEditorSaving}
                  className="inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm text-muted transition hover:border-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => void saveTextEdit()}
                  disabled={isEditorLoading || isEditorSaving || !hasEditorContentLoaded || !isEditorDirty}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isEditorSaving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
