/**
 * Which video a URL points at. One place for it, so the player, the file list
 * and a submitted link's card all agree on what can be played in the app.
 */

export function extractYoutubeId(url: string): string | null {
  if (!url) return null;
  const match = String(url).match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

export function extractVimeoId(url: string): string | null {
  if (!url) return null;
  const match = String(url).match(/vimeo\.com\/(?:video\/)?([0-9]+)/);
  return match ? match[1] : null;
}

export function extractLoomId(url: string): string | null {
  if (!url) return null;
  const match = String(url).match(/loom\.com\/(?:share|embed)\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

/** A Google Drive file (not a folder): /file/d/<id> or ?id=<id>. */
export function extractDriveFileId(url: string): string | null {
  if (!url) return null;
  const match = String(url).match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:[^#]*&)?id=)([a-zA-Z0-9_-]{10,})/);
  return match ? match[1] : null;
}

/** A video file a browser plays natively, judged by its extension. */
export function isDirectVideoUrl(url?: string | null): boolean {
  return /\.(mp4|webm|ogg|m4v)($|\?)/i.test(url || '');
}

export interface VideoEmbed {
  /** The player page to show in an iframe. */
  src: string;
  /** The iframe's `allow` list for that host. */
  allow: string;
  /** The site's name, for a card that has no picture. */
  host: string;
  /** A still from the video, where the host gives one without an API call. */
  thumbnail: string | null;
}

/**
 * The embeddable player for a video site's link, or null when the link is not
 * one. Drive and Loom play only what is shared with "anyone with the link".
 */
export function videoEmbed(url?: string | null): VideoEmbed | null {
  if (!url) return null;
  const youtube = extractYoutubeId(url);
  if (youtube) {
    return {
      src: `https://www.youtube-nocookie.com/embed/${youtube}?autoplay=1&rel=0&modestbranding=1`,
      allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
      host: 'YouTube',
      thumbnail: `https://i.ytimg.com/vi/${youtube}/hqdefault.jpg`,
    };
  }
  const vimeo = extractVimeoId(url);
  if (vimeo) {
    return { src: `https://player.vimeo.com/video/${vimeo}?autoplay=1`, allow: 'autoplay; fullscreen; picture-in-picture', host: 'Vimeo', thumbnail: null };
  }
  const loom = extractLoomId(url);
  if (loom) {
    return { src: `https://www.loom.com/embed/${loom}?autoplay=1`, allow: 'autoplay; fullscreen; picture-in-picture', host: 'Loom', thumbnail: null };
  }
  const drive = extractDriveFileId(url);
  if (drive) {
    return { src: `https://drive.google.com/file/d/${drive}/preview`, allow: 'autoplay; fullscreen', host: 'Google Drive', thumbnail: null };
  }
  return null;
}

/** True when the player can show this URL in the app rather than only link to it. */
export function isPlayableVideoUrl(url?: string | null): boolean {
  return !!videoEmbed(url) || isDirectVideoUrl(url);
}
