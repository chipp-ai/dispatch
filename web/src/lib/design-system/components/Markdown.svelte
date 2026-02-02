<script lang="ts">
  /**
   * Markdown Renderer
   *
   * Enhanced markdown parser with:
   * - Syntax highlighting via highlight.js
   * - YouTube/Vimeo video embedding
   * - File download cards
   * - Collapsible code blocks for long code
   * - Copy/download buttons for code
   * - Source citations with modal preview
   * - Video generation status
   */
  import { marked } from "marked";
  import { onMount, onDestroy, tick, mount, unmount } from "svelte";
  import hljs from "highlight.js";
  import { isVideoUrl, getVideoType, getEmbedUrl, getYouTubeVideoId } from "../utils/videoUtils";
  import { isGeneratedFileLink, parseFileDownloadUrl, type FileDownloadInfo } from "../utils/fileUtils";
  import SourceCitation from "./chat/SourceCitation.svelte";
  import VideoGenerationStatus from "./chat/VideoGenerationStatus.svelte";
  import EnhancedTable from "./chat/EnhancedTable.svelte";
  import ImagePreviewModal from "./chat/ImagePreviewModal.svelte";
  import type { CitationMetadata } from "./chat/types";

  export let content: string = "";
  export let streaming: boolean = false;
  export let onFileDownload: ((fileInfo: FileDownloadInfo) => void) | undefined = undefined;
  export let citationMetadata: CitationMetadata | undefined = undefined;
  export let applicationId: number | undefined = undefined;
  export let isBuilder: boolean = false;

  const CODE_COLLAPSE_THRESHOLD = 20; // Lines before showing collapse toggle

  // Store for video and file components to render
  let videoUrls: { id: string; url: string; type: string }[] = [];
  let fileDownloads: { id: string; info: FileDownloadInfo }[] = [];

  // Store for citations
  interface CitationInfo {
    id: string;
    chunkId: string;
    fileType: "URL" | "Document";
    faviconUrl: string | null;
    displayName: string;
  }
  let citations: CitationInfo[] = [];

  // Store for video generation jobs
  interface VideoGenInfo {
    id: string;
    jobId: string;
  }
  let videoGenerationJobs: VideoGenInfo[] = [];

  // Store for enhanced tables
  interface TableInfo {
    id: string;
    headers: string[];
    rows: string[][];
  }
  let tables: TableInfo[] = [];

  // Props for enhanced tables
  export let enableEnhancedTables: boolean = true;
  export let forceDarkMode: boolean = false;
  export let enableMathRendering: boolean = true;

  // Math rendering state
  let katexLoaded = false;
  let katex: typeof import("katex") | null = null;

  // Dynamically load KaTeX if enabled and available
  async function loadKatex() {
    if (!enableMathRendering || katexLoaded) return;
    
    try {
      katex = await import("katex");
      katexLoaded = true;
      
      // Load KaTeX CSS if not already loaded
      if (!document.querySelector('link[href*="katex"]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css";
        document.head.appendChild(link);
      }
    } catch (e) {
      console.warn("KaTeX not available. Math rendering disabled.", e);
      katexLoaded = true; // Mark as loaded to prevent retries
      katex = null;
    }
  }

  // Process math expressions in text
  function processMathExpressions(text: string): string {
    if (!katex || !enableMathRendering) return text;

    // Process block math ($$...$$) first
    text = text.replace(/\$\$([\s\S]+?)\$\$/g, (match, math) => {
      try {
        return `<div class="math-block">${katex!.default.renderToString(math.trim(), {
          displayMode: true,
          throwOnError: false,
        })}</div>`;
      } catch (e) {
        console.warn("KaTeX block render error:", e);
        return match;
      }
    });

    // Process inline math ($...$)
    // Avoid matching currency like $100 by requiring non-digit after opening $
    text = text.replace(/\$([^\$\s][^\$]*?[^\$\s])\$/g, (match, math) => {
      // Skip if it looks like currency
      if (/^\d/.test(math)) return match;
      
      try {
        return `<span class="math-inline">${katex!.default.renderToString(math.trim(), {
          displayMode: false,
          throwOnError: false,
        })}</span>`;
      } catch (e) {
        console.warn("KaTeX inline render error:", e);
        return match;
      }
    });

    return text;
  }

  // Image preview modal state
  let imagePreviewOpen = false;
  let imagePreviewSrc = "";
  let imagePreviewAlt = "";

  function handleImageClick(img: HTMLImageElement) {
    imagePreviewSrc = img.src;
    imagePreviewAlt = img.alt || "";
    imagePreviewOpen = true;
  }

  function closeImagePreview() {
    imagePreviewOpen = false;
    imagePreviewSrc = "";
    imagePreviewAlt = "";
  }

  // Configure custom renderer for marked
  const renderer = new marked.Renderer();

  // Custom code block renderer with syntax highlighting
  // Note: marked v5+ passes an object instead of positional args
  renderer.code = function ({ text, lang: language }: { text: string; lang?: string; escaped?: boolean }): string {
    const code = text || "";
    const lang = language || "";
    const validLang = lang && hljs.getLanguage(lang);

    let highlighted: string;
    try {
      highlighted = validLang
        ? hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
        : hljs.highlightAuto(code).value;
    } catch {
      highlighted = escapeHtml(code);
    }

    const lines = code.split("\n").length;
    const isLong = lines > CODE_COLLAPSE_THRESHOLD;
    const codeId = `code-${Math.random().toString(36).substr(2, 9)}`;

    const langLabel = lang ? `<span class="code-lang">${lang}</span>` : "";
    const collapseClass = isLong ? "collapsible collapsed" : "";
    const collapseToggle = isLong
      ? `<button class="collapse-toggle" data-code-id="${codeId}" data-lines="${lines}">
           Show all ${lines} lines
         </button>`
      : "";

    return `
      <div class="code-block-wrapper ${collapseClass}" data-code-id="${codeId}">
        <div class="code-header">
          ${langLabel}
          <div class="code-actions">
            <button class="code-btn download-btn" title="Download" data-code="${encodeURIComponent(code)}" data-lang="${lang}">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
            </button>
            <button class="code-btn copy-btn" title="Copy" data-code="${encodeURIComponent(code)}">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path>
              </svg>
            </button>
          </div>
        </div>
        <pre><code class="hljs ${validLang ? `language-${lang}` : ""}">${highlighted}</code></pre>
        ${collapseToggle}
      </div>
    `;
  };

  // Custom link renderer for video URLs and file downloads
  // Note: marked v5+ passes an object instead of positional args
  renderer.link = function ({ href, title, text }: { href: string; title?: string | null; text: string }): string {
    // Check for video URLs
    if (isVideoUrl(href)) {
      const videoId = `video-${Math.random().toString(36).substr(2, 9)}`;
      const videoType = getVideoType(href);
      videoUrls = [...videoUrls, { id: videoId, url: href, type: videoType || "direct" }];
      return `<div class="video-placeholder" data-video-id="${videoId}"></div>`;
    }

    // Check for file download links
    if (isGeneratedFileLink(href)) {
      const fileInfo = parseFileDownloadUrl(href);
      if (fileInfo) {
        const fileId = `file-${Math.random().toString(36).substr(2, 9)}`;
        fileDownloads = [...fileDownloads, { id: fileId, info: fileInfo }];
        return `<div class="file-placeholder" data-file-id="${fileId}"></div>`;
      }
    }

    // Regular link
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
    const isExternal = href.startsWith("http") && !href.includes(window.location.hostname);
    const externalAttrs = isExternal ? ' target="_blank" rel="noopener noreferrer"' : "";
    return `<a href="${escapeHtml(href)}"${titleAttr}${externalAttrs}>${text}</a>`;
  };

  // Custom image renderer
  // Note: marked v5+ passes an object instead of positional args
  renderer.image = function ({ href, title, text }: { href: string; title: string | null; text: string }): string {
    // Check if image URL is actually a video
    if (isVideoUrl(href)) {
      const videoId = `video-${Math.random().toString(36).substr(2, 9)}`;
      const videoType = getVideoType(href);
      videoUrls = [...videoUrls, { id: videoId, url: href, type: videoType || "direct" }];
      return `<div class="video-placeholder" data-video-id="${videoId}"></div>`;
    }

    const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
    const altAttr = text ? ` alt="${escapeHtml(text)}"` : "";
    return `<img src="${escapeHtml(href)}"${altAttr}${titleAttr} loading="lazy" />`;
  };

  function escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // Configure marked options
  marked.setOptions({
    gfm: true,
    breaks: true,
  });
  marked.use({ renderer });

  // Parse markdown to HTML
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function parseMarkdown(text: string, _katexReady?: boolean): string {
    if (!text) return "";

    // Reset component arrays before parsing
    videoUrls = [];
    fileDownloads = [];
    citations = [];
    videoGenerationJobs = [];
    tables = [];

    // Pre-process: Handle math expressions before markdown processing
    let processedText = processMathExpressions(text);

    // Pre-process: Extract and replace cite tags with placeholders
    processedText = processedText.replace(
      /<cite\s+id="([^"]+)"(?:\s+fileType="([^"]*)")?(?:\s+faviconUrl="([^"]*)")?(?:\s+displayName="([^"]*)")?\s*\/>/gi,
      (match, id, fileType, faviconUrl, displayName) => {
        const citationId = `cite-${Math.random().toString(36).substr(2, 9)}`;
        citations = [
          ...citations,
          {
            id: citationId,
            chunkId: id,
            fileType: (fileType as "URL" | "Document") || "Document",
            faviconUrl: faviconUrl || null,
            displayName: displayName || "",
          },
        ];
        return `<span class="citation-placeholder" data-citation-id="${citationId}"></span>`;
      }
    );

    // Pre-process: Extract and replace video-generation tags with placeholders
    processedText = processedText.replace(
      /<video-generation\s+jobId="([^"]+)"\s*\/>/gi,
      (match, jobId) => {
        const videoGenId = `videogen-${Math.random().toString(36).substr(2, 9)}`;
        videoGenerationJobs = [
          ...videoGenerationJobs,
          {
            id: videoGenId,
            jobId: jobId,
          },
        ];
        return `<div class="video-generation-placeholder" data-videogen-id="${videoGenId}"></div>`;
      }
    );

    try {
      let result = marked.parse(processedText, { async: false });
      if (typeof result !== "string") {
        return text;
      }

      // Post-process: Extract tables and replace with placeholders (only when not streaming)
      if (enableEnhancedTables && !streaming) {
        result = extractAndReplaceTables(result);
      }

      return result;
    } catch (e) {
      console.error("Markdown parse error:", e);
      return text;
    }
  }

  /**
   * Extract tables from HTML and replace with placeholders for EnhancedTable components
   */
  function extractAndReplaceTables(html: string): string {
    tables = [];
    const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;

    return html.replace(tableRegex, (match) => {
      const tableData = parseTableHtml(match);
      if (tableData && tableData.headers.length > 0 && tableData.rows.length > 0) {
        const tableId = `table-${Math.random().toString(36).substr(2, 9)}`;
        tables = [...tables, { id: tableId, ...tableData }];
        return `<div class="enhanced-table-placeholder" data-table-id="${tableId}"></div>`;
      }
      return match; // Keep original if parsing fails
    });
  }

  /**
   * Parse HTML table into headers and rows arrays
   */
  function parseTableHtml(tableHtml: string): { headers: string[]; rows: string[][] } | null {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(tableHtml, "text/html");
      const table = doc.querySelector("table");
      if (!table) return null;

      // Extract headers
      const headers: string[] = [];
      const headerCells = table.querySelectorAll("thead th, thead td, tr:first-child th");
      headerCells.forEach((cell) => {
        headers.push(cell.textContent?.trim() || "");
      });

      // If no thead, check first row for headers
      if (headers.length === 0) {
        const firstRow = table.querySelector("tr");
        if (firstRow) {
          const cells = firstRow.querySelectorAll("th, td");
          cells.forEach((cell) => {
            headers.push(cell.textContent?.trim() || "");
          });
        }
      }

      // Extract rows
      const rows: string[][] = [];
      const bodyRows = table.querySelectorAll("tbody tr, tr");
      bodyRows.forEach((row, index) => {
        // Skip header row if it was already processed
        if (index === 0 && row.querySelector("th")) return;
        
        const cells: string[] = [];
        row.querySelectorAll("td, th").forEach((cell) => {
          cells.push(cell.textContent?.trim() || "");
        });
        if (cells.length > 0) {
          rows.push(cells);
        }
      });

      return { headers, rows };
    } catch (e) {
      console.error("Failed to parse table:", e);
      return null;
    }
  }

  // Re-parse when content or katex state changes
  $: htmlContent = parseMarkdown(content, katexLoaded);

  // Set up event handlers after render
  onMount(async () => {
    await loadKatex();
    setupEventHandlers();
  });

  // Clean up mounted Svelte components
  onDestroy(() => {
    mountedComponents.forEach((comp) => unmount(comp));
    mountedComponents = [];
  });

  $: if (htmlContent) {
    tick().then(setupEventHandlers);
  }

  // Map to track mounted Svelte components for cleanup
  // Svelte 5 uses mount() which returns a component instance for unmount()
  let mountedComponents: Array<Record<string, unknown>> = [];

  function setupEventHandlers() {
    // Clean up any previously mounted components
    mountedComponents.forEach((comp) => unmount(comp));
    mountedComponents = [];

    // Copy buttons
    document.querySelectorAll(".markdown-content .copy-btn").forEach((btn) => {
      btn.addEventListener("click", handleCopy);
    });

    // Download buttons
    document.querySelectorAll(".markdown-content .download-btn").forEach((btn) => {
      btn.addEventListener("click", handleDownload);
    });

    // Collapse toggles
    document.querySelectorAll(".markdown-content .collapse-toggle").forEach((btn) => {
      btn.addEventListener("click", handleCollapseToggle);
    });

    // Render video players
    renderVideos();

    // Render file download cards
    renderFileCards();

    // Render citations
    renderCitations();

    // Render video generation status cards
    renderVideoGenerationJobs();

    // Render enhanced tables
    renderEnhancedTables();

    // Add click handlers to images for preview
    setupImageClickHandlers();
  }

  function setupImageClickHandlers() {
    document.querySelectorAll(".markdown-content img").forEach((img) => {
      const imgElement = img as HTMLImageElement;
      // Skip icons and small images
      if (imgElement.classList.contains("citation-favicon") || 
          imgElement.classList.contains("header-favicon") ||
          imgElement.width < 50 && imgElement.height < 50) {
        return;
      }

      // Add clickable styles
      imgElement.style.cursor = "pointer";
      
      // Add click handler if not already added
      if (!imgElement.dataset.previewEnabled) {
        imgElement.dataset.previewEnabled = "true";
        imgElement.addEventListener("click", () => handleImageClick(imgElement));
      }
    });
  }

  function renderCitations() {
    citations.forEach(({ id, chunkId, fileType, faviconUrl, displayName }) => {
      const placeholder = document.querySelector(
        `.citation-placeholder[data-citation-id="${id}"]`
      );
      if (placeholder && !placeholder.querySelector(".citation-wrapper")) {
        const component = mount(SourceCitation, {
          target: placeholder,
          props: {
            id: chunkId,
            fileType,
            faviconUrl,
            displayName,
            citationMetadata,
            applicationId,
            isBuilder,
          },
        });
        mountedComponents.push(component);
      }
    });
  }

  function renderVideoGenerationJobs() {
    videoGenerationJobs.forEach(({ id, jobId }) => {
      const placeholder = document.querySelector(
        `.video-generation-placeholder[data-videogen-id="${id}"]`
      );
      if (placeholder && !placeholder.querySelector(".video-generation-card")) {
        const component = mount(VideoGenerationStatus, {
          target: placeholder,
          props: {
            jobId,
          },
        });
        mountedComponents.push(component);
      }
    });
  }

  function renderEnhancedTables() {
    tables.forEach(({ id, headers, rows }) => {
      const placeholder = document.querySelector(
        `.enhanced-table-placeholder[data-table-id="${id}"]`
      );
      if (placeholder && !placeholder.querySelector(".enhanced-table")) {
        const component = mount(EnhancedTable, {
          target: placeholder,
          props: {
            headers,
            rows,
            forceDarkMode,
          },
        });
        mountedComponents.push(component);
      }
    });
  }

  async function handleCopy(e: Event) {
    const btn = e.currentTarget as HTMLButtonElement;
    const code = decodeURIComponent(btn.dataset.code || "");

    try {
      await navigator.clipboard.writeText(code);
      const svg = btn.querySelector("svg");
      if (svg) {
        const originalPath = svg.innerHTML;
        svg.innerHTML = '<polyline points="20 6 9 17 4 12"></polyline>';
        setTimeout(() => {
          svg.innerHTML = originalPath;
        }, 2000);
      }
    } catch (err) {
      console.error("Copy failed:", err);
    }
  }

  function handleDownload(e: Event) {
    const btn = e.currentTarget as HTMLButtonElement;
    const code = decodeURIComponent(btn.dataset.code || "");
    const lang = btn.dataset.lang || "txt";

    const extensions: Record<string, string> = {
      javascript: "js",
      typescript: "ts",
      python: "py",
      java: "java",
      csharp: "cs",
      cpp: "cpp",
      c: "c",
      ruby: "rb",
      go: "go",
      rust: "rs",
      php: "php",
      swift: "swift",
      kotlin: "kt",
      sql: "sql",
      html: "html",
      css: "css",
      json: "json",
      xml: "xml",
      yaml: "yaml",
      markdown: "md",
      shell: "sh",
      bash: "sh",
    };

    const ext = extensions[lang] || lang || "txt";
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `code.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleCollapseToggle(e: Event) {
    const btn = e.currentTarget as HTMLButtonElement;
    const codeId = btn.dataset.codeId;
    const lines = btn.dataset.lines;
    const wrapper = document.querySelector(`.code-block-wrapper[data-code-id="${codeId}"]`);

    if (wrapper) {
      const isCollapsed = wrapper.classList.contains("collapsed");
      wrapper.classList.toggle("collapsed");
      btn.textContent = isCollapsed ? "Show less" : `Show all ${lines} lines`;
    }
  }

  function renderVideos() {
    videoUrls.forEach(({ id, url, type }) => {
      const placeholder = document.querySelector(`.video-placeholder[data-video-id="${id}"]`);
      if (placeholder && !placeholder.querySelector(".video-player")) {
        const embedUrl = getEmbedUrl(url);
        const youtubeId = getYouTubeVideoId(url);

        let videoHtml = "";
        if (type === "youtube" && embedUrl) {
          videoHtml = `
            <div class="video-player">
              <div class="iframe-wrapper">
                <iframe
                  src="${embedUrl}"
                  title="YouTube video player"
                  frameborder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowfullscreen
                ></iframe>
              </div>
            </div>
          `;
        } else if (type === "vimeo" && embedUrl) {
          videoHtml = `
            <div class="video-player">
              <div class="iframe-wrapper">
                <iframe
                  src="${embedUrl}"
                  title="Vimeo video player"
                  frameborder="0"
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowfullscreen
                ></iframe>
              </div>
            </div>
          `;
        } else if (type === "direct") {
          videoHtml = `
            <div class="video-player">
              <video controls preload="metadata">
                <source src="${url}" />
                Your browser does not support video playback.
              </video>
            </div>
          `;
        }

        placeholder.innerHTML = videoHtml;
      }
    });
  }

  function renderFileCards() {
    fileDownloads.forEach(({ id, info }) => {
      const placeholder = document.querySelector(`.file-placeholder[data-file-id="${id}"]`);
      if (placeholder && !placeholder.querySelector(".file-card")) {
        const colors = getFileColors(info.fileExtension);
        const icon = getFileIcon(info.fileExtension);

        const cardHtml = `
          <button class="file-card" data-file-id="${id}">
            <div class="icon-wrapper ${colors.bg}">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${colors.icon}">
                <path d="${icon}"></path>
              </svg>
            </div>
            <div class="file-info">
              <span class="file-name">${escapeHtml(info.fileName)}</span>
              <span class="file-type">${info.fileExtension.toUpperCase()} File</span>
            </div>
            <div class="download-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
            </div>
          </button>
        `;

        placeholder.innerHTML = cardHtml;

        // Add click handler
        const card = placeholder.querySelector(".file-card");
        if (card) {
          card.addEventListener("click", () => {
            if (onFileDownload) {
              onFileDownload(info);
            } else {
              // Default: navigate to download URL
              const downloadUrl = `/api/downloads/downloadFile?fileId=${info.fileId}&appNameId=${info.appNameId}&fileName=${encodeURIComponent(info.fileName)}`;
              window.open(downloadUrl, "_blank");
            }
          });
        }
      }
    });
  }

  function getFileColors(extension: string): { bg: string; icon: string } {
    const colors: Record<string, { bg: string; icon: string }> = {
      pdf: { bg: "bg-red-100", icon: "text-red-500" },
      doc: { bg: "bg-blue-100", icon: "text-blue-500" },
      docx: { bg: "bg-blue-100", icon: "text-blue-500" },
      xls: { bg: "bg-green-100", icon: "text-green-500" },
      xlsx: { bg: "bg-green-100", icon: "text-green-500" },
      csv: { bg: "bg-green-100", icon: "text-green-500" },
      ppt: { bg: "bg-orange-100", icon: "text-orange-500" },
      pptx: { bg: "bg-orange-100", icon: "text-orange-500" },
      png: { bg: "bg-purple-100", icon: "text-purple-500" },
      jpg: { bg: "bg-purple-100", icon: "text-purple-500" },
      jpeg: { bg: "bg-purple-100", icon: "text-purple-500" },
      zip: { bg: "bg-yellow-100", icon: "text-yellow-500" },
      txt: { bg: "bg-gray-100", icon: "text-gray-500" },
      json: { bg: "bg-cyan-100", icon: "text-cyan-500" },
    };
    return colors[extension] || { bg: "bg-gray-100", icon: "text-gray-500" };
  }

  function getFileIcon(extension: string): string {
    const categories: Record<string, string[]> = {
      document: ["pdf", "doc", "docx", "txt", "rtf", "md"],
      spreadsheet: ["xls", "xlsx", "csv"],
      presentation: ["ppt", "pptx"],
      image: ["png", "jpg", "jpeg", "gif", "bmp", "webp"],
      code: ["js", "ts", "py", "java", "cpp", "c", "html", "css", "json", "xml"],
      archive: ["zip", "rar", "tar", "gz"],
    };

    const icons: Record<string, string> = {
      document: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
      spreadsheet: "M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z",
      presentation: "M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z",
      image: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z",
      code: "M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4",
      archive: "M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4",
      other: "M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z",
    };

    for (const [category, extensions] of Object.entries(categories)) {
      if (extensions.includes(extension)) {
        return icons[category];
      }
    }
    return icons.other;
  }
</script>

<div class="markdown-content" class:streaming>
  {@html htmlContent}
</div>

<!-- Image Preview Modal -->
<ImagePreviewModal
  src={imagePreviewSrc}
  alt={imagePreviewAlt}
  isOpen={imagePreviewOpen}
  on:close={closeImagePreview}
/>

<style>
  .markdown-content {
    line-height: 1.6;
    color: hsl(var(--foreground));
    word-break: break-word;
  }

  /* Streaming cursor removed - pulse indicator shows loading state instead */

  /* Headers */
  .markdown-content :global(h1) {
    font-size: var(--text-2xl);
    font-weight: var(--font-bold);
    margin: var(--space-4) 0 var(--space-2) 0;
    color: hsl(var(--foreground));
    border-bottom: 1px solid hsl(var(--border));
    padding-bottom: var(--space-2);
  }

  .markdown-content :global(h2) {
    font-size: var(--text-xl);
    font-weight: var(--font-semibold);
    margin: var(--space-3) 0 var(--space-2) 0;
    color: hsl(var(--foreground));
  }

  .markdown-content :global(h3) {
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    margin: var(--space-2) 0;
    color: hsl(var(--foreground));
  }

  .markdown-content :global(h4),
  .markdown-content :global(h5),
  .markdown-content :global(h6) {
    font-size: var(--text-base);
    font-weight: var(--font-semibold);
    margin: var(--space-2) 0;
    color: hsl(var(--foreground));
  }

  /* Paragraphs */
  .markdown-content :global(p) {
    margin: var(--space-2) 0;
  }

  .markdown-content :global(p:first-child) {
    margin-top: 0;
  }

  .markdown-content :global(p:last-child) {
    margin-bottom: 0;
  }

  /* Text formatting */
  .markdown-content :global(strong) {
    font-weight: var(--font-semibold);
    color: hsl(var(--foreground));
  }

  .markdown-content :global(em) {
    font-style: italic;
  }

  .markdown-content :global(del) {
    text-decoration: line-through;
    color: hsl(var(--muted-foreground));
  }

  /* Inline code */
  .markdown-content :global(code) {
    padding: 2px 6px;
    background: hsl(var(--muted));
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: 0.875em;
    color: hsl(var(--foreground));
  }

  /* Code blocks wrapper */
  .markdown-content :global(.code-block-wrapper) {
    position: relative;
    margin: var(--space-4) 0;
    border-radius: var(--radius-md);
    border: 1px solid hsl(var(--border));
    background: hsl(var(--muted));
    overflow: hidden;
  }

  .markdown-content :global(.code-block-wrapper.collapsible.collapsed pre) {
    max-height: 300px;
    overflow: hidden;
  }

  .markdown-content :global(.code-block-wrapper.collapsible.collapsed::after) {
    content: "";
    position: absolute;
    bottom: 40px;
    left: 0;
    right: 0;
    height: 60px;
    background: linear-gradient(transparent, hsl(var(--muted)));
    pointer-events: none;
  }

  .markdown-content :global(.code-header) {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-2) var(--space-3);
    background: hsl(var(--muted) / 0.5);
    border-bottom: 1px solid hsl(var(--border));
  }

  .markdown-content :global(.code-lang) {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
    text-transform: uppercase;
    font-weight: 500;
  }

  .markdown-content :global(.code-actions) {
    display: flex;
    gap: var(--space-1);
  }

  .markdown-content :global(.code-btn) {
    padding: var(--space-1);
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: hsl(var(--muted-foreground));
    transition: all 0.15s ease;
  }

  .markdown-content :global(.code-btn:hover) {
    background: hsl(var(--background));
    color: hsl(var(--foreground));
  }

  .markdown-content :global(.collapse-toggle) {
    display: block;
    width: 100%;
    padding: var(--space-2);
    background: hsl(var(--muted) / 0.5);
    border: none;
    border-top: 1px solid hsl(var(--border));
    cursor: pointer;
    font-size: var(--text-sm);
    color: hsl(var(--primary));
    transition: background 0.15s ease;
  }

  .markdown-content :global(.collapse-toggle:hover) {
    background: hsl(var(--muted));
  }

  .markdown-content :global(pre) {
    margin: 0;
    padding: var(--space-4);
    overflow-x: auto;
  }

  .markdown-content :global(pre code) {
    padding: 0;
    background: transparent;
    border-radius: 0;
    font-size: var(--text-sm);
    line-height: 1.5;
  }

  /* Links */
  .markdown-content :global(a) {
    color: hsl(var(--primary));
    text-decoration: underline;
    text-underline-offset: 2px;
    transition: color var(--transition-fast);
  }

  .markdown-content :global(a:hover) {
    color: hsl(var(--primary) / 0.8);
  }

  /* Lists */
  .markdown-content :global(ul),
  .markdown-content :global(ol) {
    margin: var(--space-2) 0;
    padding-left: var(--space-6);
  }

  .markdown-content :global(ul) {
    list-style-type: disc;
  }

  .markdown-content :global(ol) {
    list-style-type: decimal;
  }

  .markdown-content :global(li) {
    margin: var(--space-1) 0;
  }

  .markdown-content :global(li > ul),
  .markdown-content :global(li > ol) {
    margin: var(--space-1) 0;
  }

  /* Task lists */
  .markdown-content :global(ul.contains-task-list) {
    list-style: none;
    padding-left: var(--space-2);
  }

  .markdown-content :global(li.task-list-item) {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
  }

  .markdown-content :global(li.task-list-item input[type="checkbox"]) {
    margin-top: 4px;
  }

  /* Blockquotes */
  .markdown-content :global(blockquote) {
    border-left: 3px solid hsl(var(--primary) / 0.5);
    padding-left: var(--space-4);
    margin: var(--space-4) 0;
    color: hsl(var(--muted-foreground));
    font-style: italic;
  }

  .markdown-content :global(blockquote p) {
    margin: 0;
  }

  /* Horizontal rule */
  .markdown-content :global(hr) {
    border: none;
    border-top: 1px solid hsl(var(--border));
    margin: var(--space-6) 0;
  }

  /* Tables */
  .markdown-content :global(table) {
    width: 100%;
    border-collapse: collapse;
    margin: var(--space-4) 0;
    font-size: var(--text-sm);
  }

  .markdown-content :global(th),
  .markdown-content :global(td) {
    padding: var(--space-2) var(--space-3);
    border: 1px solid hsl(var(--border));
    text-align: left;
  }

  .markdown-content :global(th) {
    background: hsl(var(--muted));
    font-weight: var(--font-semibold);
  }

  .markdown-content :global(tr:nth-child(even)) {
    background: hsl(var(--muted) / 0.3);
  }

  /* Images */
  .markdown-content :global(img) {
    max-width: 100%;
    height: auto;
    border-radius: var(--radius-md);
    margin: var(--space-4) 0;
  }

  /* Definition lists (GFM extension) */
  .markdown-content :global(dl) {
    margin: var(--space-4) 0;
  }

  .markdown-content :global(dt) {
    font-weight: var(--font-semibold);
    margin-top: var(--space-2);
  }

  .markdown-content :global(dd) {
    margin-left: var(--space-4);
    color: hsl(var(--muted-foreground));
  }

  /* Video player styles */
  .markdown-content :global(.video-player) {
    width: 100%;
    max-width: 640px;
    border-radius: var(--radius-md);
    overflow: hidden;
    background: hsl(var(--muted));
    margin: var(--space-4) 0;
  }

  .markdown-content :global(.iframe-wrapper) {
    position: relative;
    width: 100%;
    padding-bottom: 56.25%;
  }

  .markdown-content :global(.iframe-wrapper iframe) {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    border: none;
  }

  .markdown-content :global(video) {
    width: 100%;
    display: block;
    border-radius: var(--radius-md);
    background: #000;
  }

  /* File card styles */
  .markdown-content :global(.file-card) {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    max-width: 320px;
    padding: var(--space-3) var(--space-4);
    background: hsl(var(--background));
    border: 1px solid hsl(var(--border));
    border-radius: var(--radius-lg);
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
    margin: var(--space-2) 0;
  }

  .markdown-content :global(.file-card:hover) {
    border-color: hsl(var(--primary) / 0.5);
    box-shadow: 0 4px 12px hsl(var(--foreground) / 0.1);
  }

  .markdown-content :global(.file-card .icon-wrapper) {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: var(--radius-md);
    flex-shrink: 0;
  }

  .markdown-content :global(.file-card .file-info) {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .markdown-content :global(.file-card .file-name) {
    font-weight: 500;
    font-size: var(--text-sm);
    color: hsl(var(--foreground));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .markdown-content :global(.file-card .file-type) {
    font-size: var(--text-xs);
    color: hsl(var(--muted-foreground));
  }

  .markdown-content :global(.file-card .download-icon) {
    flex-shrink: 0;
    color: hsl(var(--muted-foreground));
  }

  .markdown-content :global(.file-card:hover .download-icon) {
    color: hsl(var(--primary));
  }

  /* Color utility classes */
  :global(.bg-red-100) { background-color: #fee2e2; }
  :global(.bg-blue-100) { background-color: #dbeafe; }
  :global(.bg-green-100) { background-color: #dcfce7; }
  :global(.bg-orange-100) { background-color: #ffedd5; }
  :global(.bg-purple-100) { background-color: #f3e8ff; }
  :global(.bg-yellow-100) { background-color: #fef9c3; }
  :global(.bg-gray-100) { background-color: #f3f4f6; }
  :global(.bg-cyan-100) { background-color: #cffafe; }

  :global(.text-red-500) { color: #ef4444; }
  :global(.text-blue-500) { color: #3b82f6; }
  :global(.text-green-500) { color: #22c55e; }
  :global(.text-orange-500) { color: #f97316; }
  :global(.text-purple-500) { color: #a855f7; }
  :global(.text-yellow-500) { color: #eab308; }
  :global(.text-gray-500) { color: #6b7280; }
  :global(.text-cyan-500) { color: #06b6d4; }

  /* Syntax highlighting theme - GitHub-inspired */
  .markdown-content :global(.hljs) {
    color: hsl(var(--foreground));
  }

  .markdown-content :global(.hljs-comment),
  .markdown-content :global(.hljs-quote) {
    color: #6a737d;
    font-style: italic;
  }

  .markdown-content :global(.hljs-keyword),
  .markdown-content :global(.hljs-selector-tag) {
    color: #d73a49;
  }

  .markdown-content :global(.hljs-string),
  .markdown-content :global(.hljs-addition) {
    color: #22863a;
  }

  .markdown-content :global(.hljs-number),
  .markdown-content :global(.hljs-literal) {
    color: #005cc5;
  }

  .markdown-content :global(.hljs-built_in),
  .markdown-content :global(.hljs-builtin-name) {
    color: #e36209;
  }

  .markdown-content :global(.hljs-function),
  .markdown-content :global(.hljs-title) {
    color: #6f42c1;
  }

  .markdown-content :global(.hljs-type),
  .markdown-content :global(.hljs-class) {
    color: #6f42c1;
  }

  .markdown-content :global(.hljs-variable),
  .markdown-content :global(.hljs-template-variable) {
    color: #e36209;
  }

  .markdown-content :global(.hljs-attr),
  .markdown-content :global(.hljs-attribute) {
    color: #005cc5;
  }

  .markdown-content :global(.hljs-symbol),
  .markdown-content :global(.hljs-bullet) {
    color: #005cc5;
  }

  .markdown-content :global(.hljs-deletion) {
    color: #b31d28;
    background-color: #ffeef0;
  }

  .markdown-content :global(.hljs-meta) {
    color: #6a737d;
  }

  .markdown-content :global(.hljs-regexp) {
    color: #032f62;
  }

  .markdown-content :global(.hljs-selector-class),
  .markdown-content :global(.hljs-selector-id) {
    color: #6f42c1;
  }

  .markdown-content :global(.hljs-tag) {
    color: #22863a;
  }

  .markdown-content :global(.hljs-name) {
    color: #22863a;
  }

  /* Citation placeholders */
  .markdown-content :global(.citation-placeholder) {
    display: inline;
  }

  /* Video generation placeholders */
  .markdown-content :global(.video-generation-placeholder) {
    width: 100%;
    max-width: 640px;
    min-height: 200px;
    margin: var(--space-4) 0;
    border-radius: var(--radius-md);
    background: hsl(var(--muted));
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Enhanced table placeholders */
  .markdown-content :global(.enhanced-table-placeholder) {
    width: 100%;
    margin: var(--space-4) 0;
  }

  /* Math rendering styles */
  .markdown-content :global(.math-block) {
    overflow-x: auto;
    margin: var(--space-4) 0;
    padding: var(--space-3);
    background: hsl(var(--muted) / 0.3);
    border-radius: var(--radius-md);
    text-align: center;
  }

  .markdown-content :global(.math-inline) {
    padding: 0 2px;
  }

  /* KaTeX overrides for better styling */
  .markdown-content :global(.katex) {
    font-size: 1.1em;
  }

  .markdown-content :global(.katex-display) {
    margin: 0;
  }
</style>
