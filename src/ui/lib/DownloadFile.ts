/**
 * Hands a generated file to the browser's download manager.
 *
 * `chrome.downloads` is unavailable from a plain page context, so the object
 * URL route is used instead. It works identically in the popup, the side panel
 * and the options page, and revoking the URL after the click avoids leaking a
 * blob for the lifetime of the document.
 */
export function downloadFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = sanitizeFilename(filename);
  anchor.rel = 'noopener';
  anchor.style.display = 'none';

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  // Revoked on the next task so the click has definitely been dispatched.
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/** Strips path separators and control characters from a proposed filename. */
export function sanitizeFilename(filename: string): string {
  const cleaned = filename
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .replace(/^\.+/, '')
    .trim();

  return cleaned.slice(0, 120) || 'download';
}

/** Opens a file picker and resolves with the chosen file's text content. */
export function pickTextFile(accept = 'application/json,.json'): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();

      if (!file) {
        resolve(null);
        return;
      }

      // 8 MB ceiling: larger payloads would exceed the message size a runtime
      // message can carry anyway, so fail early with a clear signal.
      if (file.size > 8 * 1024 * 1024) {
        resolve(null);
        return;
      }

      file
        .text()
        .then(resolve)
        .catch(() => resolve(null));
    });

    input.addEventListener('cancel', () => {
      input.remove();
      resolve(null);
    });

    document.body.appendChild(input);
    input.click();
  });
}
