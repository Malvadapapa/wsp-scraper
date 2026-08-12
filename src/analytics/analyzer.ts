/**
 * Funciones puras de análisis para el dashboard.
 * Extrae país, hora y agrega estadísticas.
 */

export interface Classification {
  fila: number;
  area: string;
  busqueda_laboral: string;
  tiene_presentacion: boolean;
}

export interface EnrichedRecord {
  fila: number;
  area: string;
  busqueda_laboral: string;
  tiene_presentacion: boolean;
  pais: string;
  hora: number;
}

const PHONE_PREFIX_MAP: ReadonlyArray<{ prefix: string; country: string }> = [
  { prefix: '+593', country: '🇪🇨 Ecuador' },
  { prefix: '+591', country: '🇧🇴 Bolivia' },
  { prefix: '+598', country: '🇺🇾 Uruguay' },
  { prefix: '+54', country: '🇦🇷 Argentina' },
  { prefix: '+52', country: '🇲🇽 México' },
  { prefix: '+51', country: '🇵🇪 Perú' },
  { prefix: '+56', country: '🇨🇱 Chile' },
  { prefix: '+57', country: '🇨🇴 Colombia' },
  { prefix: '+58', country: '🇻🇪 Venezuela' },
  { prefix: '+34', country: '🇪🇸 España' },
  { prefix: '+39', country: '🇮🇹 Italia' },
  { prefix: '+44', country: '🇬🇧 Reino Unido' },
];

/**
 * Detecta el país basándose en el prefijo telefónico.
 */
export function detectCountry(phone: string): string {
  if (!phone || phone.startsWith('@') || !/^\+?\d/.test(phone)) {
    return '🌐 Desconocido';
  }
  for (const entry of PHONE_PREFIX_MAP) {
    if (phone.startsWith(entry.prefix)) {
      return entry.country;
    }
  }
  return '🌐 Otro';
}

/**
 * Extrae la hora (0-23) de un timestamp con formato "YYYY-MM-DD HH:MM:SS".
 */
export function extractHour(timestamp: string): number {
  const match = timestamp.match(/(\d{1,2}):\d{2}:\d{2}$/);
  if (match) {
    return parseInt(match[1], 10);
  }
  const matchShort = timestamp.match(/(\d{1,2}):\d{2}$/);
  if (matchShort) {
    return parseInt(matchShort[1], 10);
  }
  return -1;
}

/**
 * Combina los datos del sheet con las clasificaciones de la IA.
 */
export function enrichRecords(
  sheetRows: string[][],
  classifications: Classification[]
): EnrichedRecord[] {
  return classifications.map((c) => {
    const row = sheetRows[c.fila]; // fila 1 = index 1 (index 0 es header)
    const phone = row?.[1] ?? '';
    const timestamp = row?.[0] ?? '';

    return {
      fila: c.fila,
      area: c.area,
      busqueda_laboral: c.busqueda_laboral,
      tiene_presentacion: c.tiene_presentacion,
      pais: detectCountry(phone),
      hora: extractHour(timestamp),
    };
  });
}

/**
 * Cuenta ocurrencias de cada valor en un campo.
 */
export function countBy(
  records: EnrichedRecord[],
  field: keyof EnrichedRecord
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const rec of records) {
    const key = String(rec[field]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Ordena un Map<string, number> de mayor a menor por valor.
 */
export function sortedEntries(map: Map<string, number>): [string, number][] {
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

/**
 * Genera la distribución horaria (solo horas con actividad, 0-23).
 */
export function hourDistribution(records: EnrichedRecord[]): [string, number][] {
  const counts = countBy(records, 'hora');
  return [...counts.entries()]
    .filter(([h]) => h !== '-1')
    .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
    .map(([h, c]) => [`${h.padStart(2, '0')}:00`, c]);
}
