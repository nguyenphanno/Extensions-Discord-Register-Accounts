/**
 * Captures Discord auth token from localStorage via iframe technique.
 * 
 * Discord's web client stores the token in localStorage, but main-world scripts
 * may have removed it. Creating a fresh iframe gives us a clean contentWindow
 * with access to the same-origin localStorage before any page script runs.
 */
export function getToken(): string | null {
  try {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.head.appendChild(iframe);

    try {
      const token = iframe.contentWindow?.localStorage.getItem('token');
      return token || null;
    } finally {
      iframe.remove();
    }
  } catch {
    return null;
  }
}

