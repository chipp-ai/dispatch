// File link detection and parsing utilities

export interface FileDownloadInfo {
  fileId: string;
  appNameId: string;
  fileName: string;
  fileExtension: string;
  mimeType: string;
  isGenerated: boolean;
}

/**
 * Check if a URL is a generated file download link
 */
export function isGeneratedFileLink(url: string): boolean {
  if (!url) return false;

  const filePrefix = "/api/downloads/downloadFile?fileId=";
  return (
    url.includes(filePrefix) ||
    url.includes("./api/downloads/downloadFile?fileId=")
  );
}

/**
 * Parse a file download URL to extract metadata
 */
export function parseFileDownloadUrl(url: string): FileDownloadInfo | null {
  if (!isGeneratedFileLink(url)) {
    return null;
  }

  try {
    // Handle relative URLs
    let normalizedUrl = url;
    if (url.startsWith("./")) {
      normalizedUrl = url.substring(1); // Remove leading dot
    }

    const urlObj = new URL(normalizedUrl, window.location.origin);
    const fileId = urlObj.searchParams.get("fileId");
    const appNameId = urlObj.searchParams.get("appNameId");
    const fileName = urlObj.searchParams.get("fileName");

    if (!fileId || !appNameId || !fileName) {
      return null;
    }

    const decodedFileName = decodeURIComponent(fileName);
    const fileExtension = decodedFileName.split(".").pop()?.toLowerCase() || "";
    const mimeType = getMimeTypeFromExtension(fileExtension);

    return {
      fileId,
      appNameId,
      fileName: decodedFileName,
      fileExtension,
      mimeType,
      isGenerated: true,
    };
  } catch (error) {
    console.error("Error parsing file download URL:", error);
    return null;
  }
}

/**
 * Get MIME type from file extension
 */
export function getMimeTypeFromExtension(extension: string): string {
  const mimeTypes: { [key: string]: string } = {
    // Documents
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    txt: "text/plain",
    rtf: "application/rtf",
    // Spreadsheets
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    csv: "text/csv",
    // Presentations
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    // Images
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    bmp: "image/bmp",
    webp: "image/webp",
    // Code files
    js: "text/javascript",
    ts: "application/typescript",
    py: "text/x-python",
    java: "text/x-java-source",
    cpp: "text/x-c++src",
    c: "text/x-csrc",
    html: "text/html",
    css: "text/css",
    json: "application/json",
    xml: "application/xml",
    // Archives
    zip: "application/zip",
    rar: "application/x-rar-compressed",
    tar: "application/x-tar",
    gz: "application/gzip",
    // Other
    md: "text/markdown",
    tex: "application/x-tex",
  };

  return mimeTypes[extension] || "application/octet-stream";
}

/**
 * Get file category from extension for UI styling
 */
export function getFileCategory(
  extension: string
):
  | "document"
  | "spreadsheet"
  | "presentation"
  | "image"
  | "code"
  | "archive"
  | "other" {
  const categories = {
    document: ["pdf", "doc", "docx", "txt", "rtf", "md"],
    spreadsheet: ["xls", "xlsx", "csv"],
    presentation: ["ppt", "pptx"],
    image: ["png", "jpg", "jpeg", "gif", "bmp", "webp"],
    code: ["js", "ts", "py", "java", "cpp", "c", "html", "css", "json", "xml"],
    archive: ["zip", "rar", "tar", "gz"],
  };

  for (const [category, extensions] of Object.entries(categories)) {
    if (extensions.includes(extension)) {
      return category as any;
    }
  }

  return "other";
}

/**
 * Get color theme for file type
 */
export function getFileTypeColor(extension: string): {
  bg: string;
  text: string;
  icon: string;
} {
  const colors: Record<string, { bg: string; text: string; icon: string }> = {
    pdf: { bg: "bg-red-100", text: "text-red-700", icon: "text-red-500" },
    doc: { bg: "bg-blue-100", text: "text-blue-700", icon: "text-blue-500" },
    docx: { bg: "bg-blue-100", text: "text-blue-700", icon: "text-blue-500" },
    xls: { bg: "bg-green-100", text: "text-green-700", icon: "text-green-500" },
    xlsx: {
      bg: "bg-green-100",
      text: "text-green-700",
      icon: "text-green-500",
    },
    csv: { bg: "bg-green-100", text: "text-green-700", icon: "text-green-500" },
    ppt: {
      bg: "bg-orange-100",
      text: "text-orange-700",
      icon: "text-orange-500",
    },
    pptx: {
      bg: "bg-orange-100",
      text: "text-orange-700",
      icon: "text-orange-500",
    },
    png: {
      bg: "bg-purple-100",
      text: "text-purple-700",
      icon: "text-purple-500",
    },
    jpg: {
      bg: "bg-purple-100",
      text: "text-purple-700",
      icon: "text-purple-500",
    },
    jpeg: {
      bg: "bg-purple-100",
      text: "text-purple-700",
      icon: "text-purple-500",
    },
    gif: {
      bg: "bg-purple-100",
      text: "text-purple-700",
      icon: "text-purple-500",
    },
    zip: {
      bg: "bg-yellow-100",
      text: "text-yellow-700",
      icon: "text-yellow-500",
    },
    rar: {
      bg: "bg-yellow-100",
      text: "text-yellow-700",
      icon: "text-yellow-500",
    },
    txt: { bg: "bg-gray-100", text: "text-gray-700", icon: "text-gray-500" },
    md: { bg: "bg-gray-100", text: "text-gray-700", icon: "text-gray-500" },
    json: { bg: "bg-cyan-100", text: "text-cyan-700", icon: "text-cyan-500" },
    js: {
      bg: "bg-yellow-100",
      text: "text-yellow-700",
      icon: "text-yellow-500",
    },
    ts: { bg: "bg-blue-100", text: "text-blue-700", icon: "text-blue-500" },
    py: { bg: "bg-green-100", text: "text-green-700", icon: "text-green-500" },
  };

  return (
    colors[extension] || {
      bg: "bg-gray-100",
      text: "text-gray-700",
      icon: "text-gray-500",
    }
  );
}
