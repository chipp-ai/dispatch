// Video URL detection patterns
export const VIDEO_URL_PATTERNS = {
  youtube: {
    full: /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?(?:.*&)?v=([a-zA-Z0-9_-]{11})(?:&.*)?/,
    short: /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})(?:\?.*)?/,
    embed:
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})(?:\?.*)?/,
  },
  vimeo: {
    standard: /(?:https?:\/\/)?(?:www\.)?vimeo\.com\/(\d+)(?:\/.*)?/,
    player: /(?:https?:\/\/)?player\.vimeo\.com\/video\/(\d+)(?:\?.*)?/,
  },
  videoFiles: {
    extensions: /\.(mp4|webm|ogg|mov|avi|wmv|flv|mkv|m4v|mpg|mpeg)(\?.*)?$/i,
  },
};

// Check if a URL is a video URL
export function isVideoUrl(url: string): boolean {
  if (!url) return false;

  // Check YouTube
  if (
    VIDEO_URL_PATTERNS.youtube.full.test(url) ||
    VIDEO_URL_PATTERNS.youtube.short.test(url) ||
    VIDEO_URL_PATTERNS.youtube.embed.test(url)
  ) {
    return true;
  }

  // Check Vimeo
  if (
    VIDEO_URL_PATTERNS.vimeo.standard.test(url) ||
    VIDEO_URL_PATTERNS.vimeo.player.test(url)
  ) {
    return true;
  }

  // Check direct video files
  const decodedUrl = decodeURIComponent(url);
  if (
    VIDEO_URL_PATTERNS.videoFiles.extensions.test(url) ||
    VIDEO_URL_PATTERNS.videoFiles.extensions.test(decodedUrl)
  ) {
    return true;
  }

  // Check GCS URLs with video in subfolder path
  if (
    url.includes("storage.googleapis.com") &&
    (url.includes("/chat-videos/") || url.includes("/videos/"))
  ) {
    return true;
  }

  return false;
}

// Extract video ID from YouTube URL
export function getYouTubeVideoId(url: string): string | null {
  const patterns = [
    VIDEO_URL_PATTERNS.youtube.full,
    VIDEO_URL_PATTERNS.youtube.short,
    VIDEO_URL_PATTERNS.youtube.embed,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

// Extract video ID from Vimeo URL
export function getVimeoVideoId(url: string): string | null {
  const patterns = [
    VIDEO_URL_PATTERNS.vimeo.standard,
    VIDEO_URL_PATTERNS.vimeo.player,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

// Get video type from URL
export function getVideoType(
  url: string
): "youtube" | "vimeo" | "direct" | null {
  if (getYouTubeVideoId(url)) return "youtube";
  if (getVimeoVideoId(url)) return "vimeo";
  if (VIDEO_URL_PATTERNS.videoFiles.extensions.test(url)) return "direct";
  if (url.includes("storage.googleapis.com")) return "direct";
  return null;
}

// Get embed URL for video
export function getEmbedUrl(url: string): string | null {
  const youtubeId = getYouTubeVideoId(url);
  if (youtubeId) {
    return `https://www.youtube.com/embed/${youtubeId}?rel=0&modestbranding=1`;
  }

  const vimeoId = getVimeoVideoId(url);
  if (vimeoId) {
    return `https://player.vimeo.com/video/${vimeoId}?byline=0&portrait=0&title=0`;
  }

  return null;
}
