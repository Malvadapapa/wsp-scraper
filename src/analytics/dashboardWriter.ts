/**
 * Escribe las tablas resumen y crea gráficos nativos en la pestaña "Dashboard"
 * del Google Sheet usando la API de Sheets.
 */
import { google, sheets_v4 } from 'googleapis';
import { config } from '../core/config';
import { logger } from '../core/logger';

const DASHBOARD_SHEET = 'Dashboard';

interface DashboardData {
  areaCounts: [string, number][];
  countryCounts: [string, number][];
  hourDist: [string, number][];
  busquedaCounts: [string, number][];
  presentacionCounts: [string, number][];
  totalRecords: number;
}

function getAuth(): InstanceType<typeof google.auth.JWT> {
  const creds = JSON.parse(config.GOOGLE_SERVICE_ACCOUNT_JSON);
  return new google.auth.JWT(
    creds.client_email,
    undefined,
    creds.private_key,
    ['https://www.googleapis.com/auth/spreadsheets']
  );
}

/**
 * Obtiene o crea la pestaña "Dashboard". Devuelve su sheetId numérico.
 */
async function ensureDashboardSheet(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string
): Promise<number> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = meta.data.sheets?.find(
    (s) => s.properties?.title === DASHBOARD_SHEET
  );

  if (existing) {
    const sheetId = existing.properties?.sheetId ?? 0;
    // Limpiar contenido previo
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `${DASHBOARD_SHEET}!A1:Z500`,
    });
    // Eliminar gráficos existentes
    const charts = existing.charts ?? [];
    if (charts.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: charts.map((c) => ({
            deleteEmbeddedObject: { objectId: c.chartId! },
          })),
        },
      });
    }
    return sheetId;
  }

  // Crear nueva pestaña
  const res = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: {
              title: DASHBOARD_SHEET,
              gridProperties: { rowCount: 500, columnCount: 20 },
            },
          },
        },
      ],
    },
  });

  return res.data.replies?.[0].addSheet?.properties?.sheetId ?? 0;
}

/**
 * Escribe los datos tabulares del dashboard.
 */
async function writeDataTables(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  data: DashboardData
): Promise<void> {
  const rows: string[][] = [];

  // === FILA 0: Título general ===
  rows.push(['📊 DASHBOARD — LA COPA 🏆', '', '', '', '', '', '', '']);
  rows.push([`Análisis de ${data.totalRecords} perfiles de LinkedIn`, '', '', '', '', '', '', '']);
  rows.push([]);

  // === BLOQUE 1: Área Profesional (columnas A-B, desde fila 4) ===
  rows.push(['🥧 Área Profesional', 'Cantidad']);
  for (const [area, count] of data.areaCounts) {
    rows.push([area, String(count)]);
  }
  rows.push([]);

  // Calcular offset para el bloque 2
  const countryStart = rows.length;

  // === BLOQUE 2: País de Origen (columnas A-B) ===
  rows.push(['🌍 País de Origen', 'Cantidad']);
  for (const [country, count] of data.countryCounts) {
    rows.push([country, String(count)]);
  }
  rows.push([]);

  const hourStart = rows.length;

  // === BLOQUE 3: Actividad Horaria (columnas A-B) ===
  rows.push(['⏰ Actividad por Hora', 'Mensajes']);
  for (const [hour, count] of data.hourDist) {
    rows.push([hour, String(count)]);
  }
  rows.push([]);

  const statsStart = rows.length;

  // === BLOQUE 4: Estadísticas Generales (columnas A-B) ===
  rows.push(['📋 Estadísticas Generales', 'Valor']);
  rows.push(['Total de perfiles', String(data.totalRecords)]);

  const conPresentacion = data.presentacionCounts.find(([k]) => k === 'true')?.[1] ?? 0;
  const sinPresentacion = data.presentacionCounts.find(([k]) => k === 'false')?.[1] ?? 0;
  rows.push(['Con presentación personal', String(conPresentacion)]);
  rows.push(['Solo dejaron el link', String(sinPresentacion)]);

  const enBusqueda = data.busquedaCounts.find(([k]) => k === 'Sí')?.[1] ?? 0;
  rows.push(['En búsqueda laboral', String(enBusqueda)]);
  rows.push([
    '% en búsqueda laboral',
    `${((enBusqueda / data.totalRecords) * 100).toFixed(1)}%`,
  ]);

  const topArea = data.areaCounts.filter(([a]) => a !== 'No especificó')[0];
  if (topArea) {
    rows.push(['Área más popular (excluyendo "No especificó")', `${topArea[0]} (${topArea[1]})`]);
  }

  const topCountry = data.countryCounts[0];
  if (topCountry) {
    rows.push(['País más representado', `${topCountry[0]} (${topCountry[1]})`]);
  }

  // === BLOQUE 5: Búsqueda laboral (columnas D-E, desde fila 4) ===
  // Lo escribimos en columnas separadas para un gráfico de torta adicional
  const busqRows: string[][] = [];
  busqRows.push(['🔍 Situación Laboral', 'Cantidad']);
  busqRows.push(['En búsqueda', String(enBusqueda)]);
  busqRows.push(['No menciona', String(data.totalRecords - enBusqueda)]);

  // Escribir datos principales
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${DASHBOARD_SHEET}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: rows },
  });

  // Escribir bloque de búsqueda laboral en columnas D-E (fila 4)
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${DASHBOARD_SHEET}!D4`,
    valueInputOption: 'RAW',
    requestBody: { values: busqRows },
  });

  logger.info('📝 Tablas de datos escritas en Dashboard.');
}

/**
 * Aplica formato visual premium al dashboard.
 */
async function formatDashboard(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetId: number
): Promise<void> {
  const requests: sheets_v4.Schema$Request[] = [
    // Título grande
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 8 },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 26 / 255, green: 54 / 255, blue: 93 / 255 },
            textFormat: {
              foregroundColor: { red: 1, green: 1, blue: 1 },
              bold: true,
              fontSize: 16,
            },
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE',
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
      },
    },
    // Subtítulo
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 8 },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 44 / 255, green: 82 / 255, blue: 130 / 255 },
            textFormat: {
              foregroundColor: { red: 1, green: 1, blue: 1 },
              bold: false,
              fontSize: 11,
              italic: true,
            },
            horizontalAlignment: 'CENTER',
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
      },
    },
    // Merge del título
    {
      mergeCells: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 8 },
        mergeType: 'MERGE_ALL',
      },
    },
    {
      mergeCells: {
        range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 8 },
        mergeType: 'MERGE_ALL',
      },
    },
    // Altura de filas
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 50 },
        fields: 'pixelSize',
      },
    },
    // Ancho columnas A y B
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 320 },
        fields: 'pixelSize',
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 },
        properties: { pixelSize: 120 },
        fields: 'pixelSize',
      },
    },
    // Ancho columnas D y E
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 },
        properties: { pixelSize: 220 },
        fields: 'pixelSize',
      },
    },
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 4, endIndex: 5 },
        properties: { pixelSize: 120 },
        fields: 'pixelSize',
      },
    },
  ];

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  });

  logger.info('🎨 Formato visual aplicado al Dashboard.');
}

/**
 * Crea gráficos nativos de Google Sheets en la pestaña Dashboard.
 */
async function createCharts(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetId: number,
  data: DashboardData
): Promise<void> {
  // Calculamos los rangos de las tablas de datos.
  // Fila 0: título, 1: subtítulo, 2: vacía, 3: header "Área Profesional"
  // data.areaCounts tiene N filas → termina en 3 + N (inclusive header)
  const areaHeaderRow = 3; // 0-indexed
  const areaEndRow = areaHeaderRow + 1 + data.areaCounts.length;

  // País empieza después de areaEnd + 1 fila vacía
  const countryHeaderRow = areaEndRow + 1;
  const countryEndRow = countryHeaderRow + 1 + data.countryCounts.length;

  // Hora empieza después de countryEnd + 1 fila vacía
  const hourHeaderRow = countryEndRow + 1;
  const hourEndRow = hourHeaderRow + 1 + data.hourDist.length;

  const requests: sheets_v4.Schema$Request[] = [
    // 1. Gráfico de torta — Área Profesional
    {
      addChart: {
        chart: {
          position: {
            overlayPosition: {
              anchorCell: { sheetId, rowIndex: 3, columnIndex: 6 },
              widthPixels: 550,
              heightPixels: 380,
            },
          },
          spec: {
            title: '🥧 Distribución por Área Profesional',
            pieChart: {
              legendPosition: 'LABELED_LEGEND',
              domain: {
                sourceRange: {
                  sources: [
                    {
                      sheetId,
                      startRowIndex: areaHeaderRow + 1,
                      endRowIndex: areaEndRow,
                      startColumnIndex: 0,
                      endColumnIndex: 1,
                    },
                  ],
                },
              },
              series: {
                sourceRange: {
                  sources: [
                    {
                      sheetId,
                      startRowIndex: areaHeaderRow + 1,
                      endRowIndex: areaEndRow,
                      startColumnIndex: 1,
                      endColumnIndex: 2,
                    },
                  ],
                },
              },
              threeDimensional: false,
            },
          },
        },
      },
    },
    // 2. Gráfico de barras — País de Origen
    {
      addChart: {
        chart: {
          position: {
            overlayPosition: {
              anchorCell: { sheetId, rowIndex: 24, columnIndex: 6 },
              widthPixels: 550,
              heightPixels: 350,
            },
          },
          spec: {
            title: '🌍 Distribución por País',
            basicChart: {
              chartType: 'BAR',
              legendPosition: 'NO_LEGEND',
              axis: [
                { position: 'BOTTOM_AXIS', title: 'Cantidad' },
                { position: 'LEFT_AXIS', title: '' },
              ],
              domains: [
                {
                  domain: {
                    sourceRange: {
                      sources: [
                        {
                          sheetId,
                          startRowIndex: countryHeaderRow + 1,
                          endRowIndex: countryEndRow,
                          startColumnIndex: 0,
                          endColumnIndex: 1,
                        },
                      ],
                    },
                  },
                },
              ],
              series: [
                {
                  series: {
                    sourceRange: {
                      sources: [
                        {
                          sheetId,
                          startRowIndex: countryHeaderRow + 1,
                          endRowIndex: countryEndRow,
                          startColumnIndex: 1,
                          endColumnIndex: 2,
                        },
                      ],
                    },
                  },
                  targetAxis: 'BOTTOM_AXIS',
                  color: { red: 66 / 255, green: 133 / 255, blue: 244 / 255 },
                },
              ],
            },
          },
        },
      },
    },
    // 3. Gráfico de línea — Actividad Horaria
    {
      addChart: {
        chart: {
          position: {
            overlayPosition: {
              anchorCell: { sheetId, rowIndex: 44, columnIndex: 6 },
              widthPixels: 550,
              heightPixels: 320,
            },
          },
          spec: {
            title: '⏰ Actividad por Hora del Día',
            basicChart: {
              chartType: 'LINE',
              legendPosition: 'NO_LEGEND',
              axis: [
                { position: 'BOTTOM_AXIS', title: 'Hora' },
                { position: 'LEFT_AXIS', title: 'Mensajes' },
              ],
              domains: [
                {
                  domain: {
                    sourceRange: {
                      sources: [
                        {
                          sheetId,
                          startRowIndex: hourHeaderRow + 1,
                          endRowIndex: hourEndRow,
                          startColumnIndex: 0,
                          endColumnIndex: 1,
                        },
                      ],
                    },
                  },
                },
              ],
              series: [
                {
                  series: {
                    sourceRange: {
                      sources: [
                        {
                          sheetId,
                          startRowIndex: hourHeaderRow + 1,
                          endRowIndex: hourEndRow,
                          startColumnIndex: 1,
                          endColumnIndex: 2,
                        },
                      ],
                    },
                  },
                  targetAxis: 'LEFT_AXIS',
                  color: { red: 234 / 255, green: 67 / 255, blue: 53 / 255 },
                },
              ],
            },
          },
        },
      },
    },
    // 4. Gráfico de torta — Búsqueda Laboral
    {
      addChart: {
        chart: {
          position: {
            overlayPosition: {
              anchorCell: { sheetId, rowIndex: 3, columnIndex: 13 },
              widthPixels: 420,
              heightPixels: 320,
            },
          },
          spec: {
            title: '🔍 Situación Laboral',
            pieChart: {
              legendPosition: 'LABELED_LEGEND',
              domain: {
                sourceRange: {
                  sources: [
                    {
                      sheetId,
                      startRowIndex: 4,
                      endRowIndex: 7,
                      startColumnIndex: 3,
                      endColumnIndex: 4,
                    },
                  ],
                },
              },
              series: {
                sourceRange: {
                  sources: [
                    {
                      sheetId,
                      startRowIndex: 4,
                      endRowIndex: 7,
                      startColumnIndex: 4,
                      endColumnIndex: 5,
                    },
                  ],
                },
              },
              threeDimensional: false,
            },
          },
        },
      },
    },
  ];

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  });

  logger.info('📈 4 gráficos nativos creados en el Dashboard.');
}

/**
 * Entry point: genera el dashboard completo.
 */
export async function writeDashboard(data: DashboardData): Promise<void> {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = config.GOOGLE_SPREADSHEET_ID;

  logger.info('🚀 Generando Dashboard en Google Sheets...');

  const sheetId = await ensureDashboardSheet(sheets, spreadsheetId);
  await writeDataTables(sheets, spreadsheetId, data);
  await formatDashboard(sheets, spreadsheetId, sheetId);
  await createCharts(sheets, spreadsheetId, sheetId, data);

  logger.info('✅ Dashboard generado exitosamente.');
}
