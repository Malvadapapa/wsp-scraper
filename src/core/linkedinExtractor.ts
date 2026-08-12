/**
 * Expresión regular para identificar enlaces de LinkedIn comunes:
 * - linkedin.com/in/...
 * - linkedin.com/company/...
 * - lnkd.in/... (acortador oficial)
 * Soporta variantes con o sin http/https/www, letras con tildes, números, guiones y porcentajes.
 */
const LINKEDIN_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com\/(?:in|company)\/[a-zA-Z0-9\-_%À-ÿ/]+|lnkd\.in\/[a-zA-Z0-9\-_]+)/i;

interface LinkedInExtractionResult {
  url: string;
  normalizedUrl: string;
}

/**
 * Extrae y normaliza el primer enlace de LinkedIn encontrado en un texto.
 * Si no encuentra ninguno, retorna null.
 * 
 * @param text Texto del mensaje
 */
export function extractLinkedIn(text: string): LinkedInExtractionResult | null {
  const match = text.match(LINKEDIN_REGEX);
  if (!match) return null;

  const url = match[0];
  
  // Normalizar la URL:
  // 1. Quitar parámetros de búsqueda si existen (ej. ?utm_source=...)
  let cleanUrl = url.split('?')[0];

  // 2. Eliminar barra diagonal final si existe para consistencia
  if (cleanUrl.endsWith('/')) {
    cleanUrl = cleanUrl.slice(0, -1);
  }

  // 3. Asegurar que empiece con https://
  let normalizedUrl = cleanUrl;
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    // Si empieza con www. o directamente con linkedin.com, le agregamos el protocolo
    normalizedUrl = `https://${normalizedUrl}`;
  }

  return {
    url,
    normalizedUrl,
  };
}
