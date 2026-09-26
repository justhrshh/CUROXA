/**
 * Utility to strip HTML tags and decode HTML entities from text fields
 * like symptoms, reason, diagnosis, and clinical notes.
 */
export const cleanHtmlText = (raw, fallback = '') => {
  if (!raw || typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  if (!trimmed.includes('<') && !trimmed.includes('&')) return trimmed;

  try {
    const doc = new DOMParser().parseFromString(trimmed, 'text/html');
    const listItems = Array.from(doc.querySelectorAll('li'))
      .map(li => li.textContent.trim())
      .filter(Boolean);
    if (listItems.length > 0) {
      return listItems.join(', ');
    }
    const text = doc.body.textContent || '';
    const cleaned = text.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    return cleaned || fallback;
  } catch (e) {
    const stripped = trimmed
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
    return stripped || fallback;
  }
};
