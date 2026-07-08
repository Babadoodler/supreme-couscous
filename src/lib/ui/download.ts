/** Trigger a client-side file download (export path — no server involved). */
export function downloadFile(
  filename: string,
  content: string | Blob,
  mime = 'application/gpx+xml'
): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Web Share first (straight into another app on the phone), download fallback. */
export async function shareOrDownloadFile(
  filename: string,
  content: string | Blob,
  mime = 'application/gpx+xml'
): Promise<void> {
  const file = new File([content], filename, { type: mime });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return; // user cancelled
      // fall through to download
    }
  }
  downloadFile(filename, content);
}
