import { google, sheets_v4 } from 'googleapis';
import { config } from '../core/config';
import { logger } from '../core/logger';
import { getChartRequests } from './chartSpecs';

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

async function ensureDashboardSheet(sheets: sheets_v4.Sheets, spreadsheetId: string): Promise<number> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = meta.data.sheets?.find((s) => s.properties?.title === DASHBOARD_SHEET);

  if (existing) {
    const sheetId = existing.properties?.sheetId ?? 0;
    await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${DASHBOARD_SHEET}!A1:Z500` });
    const charts = existing.charts ?? [];
    if (charts.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: charts.map((c) => ({ deleteEmbeddedObject: { objectId: c.chartId! } })),
        },
      });
    }
    return sheetId;
  }

  const res = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{ addSheet: { properties: { title: DASHBOARD_SHEET, gridProperties: { rowCount: 100, columnCount: 20 } } } }],
    },
  });
  return res.data.replies?.[0].addSheet?.properties?.sheetId ?? 0;
}

async function writeDataTables(sheets: sheets_v4.Sheets, spreadsheetId: string, data: DashboardData): Promise<void> {
  // Title Banner
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${DASHBOARD_SHEET}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [
        ['📊 DASHBOARD — LA COPA 🏆', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
        [`Análisis de ${data.totalRecords} perfiles de LinkedIn de la comunidad`, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ],
    },
  });

  // Table 1: Area Profesional (A4:B12)
  const areaRows: (string | number)[][] = [['Área Profesional', 'Cantidad']];
  for (const [area, count] of data.areaCounts) {
    areaRows.push([area, count]);
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${DASHBOARD_SHEET}!A4`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: areaRows },
  });

  // Table 2: Pais (A14:B25)
  const countryRows: (string | number)[][] = [['País de Origen', 'Cantidad']];
  for (const [country, count] of data.countryCounts) {
    countryRows.push([country, count]);
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${DASHBOARD_SHEET}!A14`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: countryRows },
  });

  // Table 3: General Stats (D4:E12)
  const conPresentacion = data.presentacionCounts.find(([k]) => k === 'true')?.[1] ?? 0;
  const sinPresentacion = data.presentacionCounts.find(([k]) => k === 'false')?.[1] ?? 0;
  const enBusqueda = data.busquedaCounts.find(([k]) => k === 'Sí')?.[1] ?? 0;
  const topArea = data.areaCounts.filter(([a]) => a !== 'No especificó')[0]?.[0] ?? 'N/A';
  const topCountry = data.countryCounts[0]?.[0] ?? 'N/A';

  const statsRows: (string | number)[][] = [
    ['Estadísticas Generales', 'Valor'],
    ['Total de perfiles', data.totalRecords],
    ['Con presentación personal', conPresentacion],
    ['Solo dejaron el link', sinPresentacion],
    ['En búsqueda laboral', enBusqueda],
    ['% en búsqueda laboral', `${((enBusqueda / data.totalRecords) * 100).toFixed(1)}%`],
    ['Área más popular', topArea],
    ['País más representado', topCountry],
  ];
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${DASHBOARD_SHEET}!D4`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: statsRows },
  });

  // Table 4: Job Situation (D14:E16)
  const jobRows: (string | number)[][] = [
    ['Situación Laboral', 'Cantidad'],
    ['En búsqueda', enBusqueda],
    ['No menciona', data.totalRecords - enBusqueda],
  ];
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${DASHBOARD_SHEET}!D14`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: jobRows },
  });

  // Table 5: Hourly Activity (G4:H28)
  const hourRows: (string | number)[][] = [['Actividad por Hora', 'Mensajes']];
  for (const [hour, count] of data.hourDist) {
    hourRows.push([hour, count]);
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${DASHBOARD_SHEET}!G4`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: hourRows },
  });
}

function getCellFormatRequest(sheetId: number, startRow: number, endRow: number, startCol: number, endCol: number, requestDetails: any): sheets_v4.Schema$Request {
  return {
    repeatCell: {
      range: { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: startCol, endColumnIndex: endCol },
      cell: requestDetails,
      fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
    },
  };
}

function getBorderRequest(sheetId: number, startRow: number, endRow: number, startCol: number, endCol: number): sheets_v4.Schema$Request {
  const borderSpec = { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } };
  return {
    updateBorders: {
      range: { sheetId, startRowIndex: startRow, endRowIndex: endRow, startColumnIndex: startCol, endColumnIndex: endCol },
      top: borderSpec, bottom: borderSpec, left: borderSpec, right: borderSpec,
      innerHorizontal: { style: 'SOLID', width: 1, color: { red: 0.9, green: 0.9, blue: 0.9 } },
      innerVertical: { style: 'SOLID', width: 1, color: { red: 0.9, green: 0.9, blue: 0.9 } },
    },
  };
}

async function formatDashboard(sheets: sheets_v4.Sheets, spreadsheetId: string, sheetId: number, data: DashboardData): Promise<void> {
  const areaEndRow = 4 + data.areaCounts.length;
  const countryEndRow = 14 + data.countryCounts.length;
  const hourEndRow = 4 + data.hourDist.length;

  const requests: sheets_v4.Schema$Request[] = [
    // Merges for Title banner
    { mergeCells: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 19 }, mergeType: 'MERGE_ALL' } },
    { mergeCells: { range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 19 }, mergeType: 'MERGE_ALL' } },

    // Title styling
    getCellFormatRequest(sheetId, 0, 1, 0, 19, {
      userEnteredFormat: {
        backgroundColor: { red: 26 / 255, green: 54 / 255, blue: 93 / 255 },
        textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true, fontSize: 16 },
        horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
      },
    }),
    getCellFormatRequest(sheetId, 1, 2, 0, 19, {
      userEnteredFormat: {
        backgroundColor: { red: 43 / 255, green: 108 / 255, blue: 176 / 255 },
        textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: false, fontSize: 11, italic: true },
        horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
      },
    }),

    // Set row heights
    { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 45 }, fields: 'pixelSize' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 25 }, fields: 'pixelSize' } },

    // Column widths
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 200 }, fields: 'pixelSize' } }, // A
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 80 }, fields: 'pixelSize' } },  // B
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 }, properties: { pixelSize: 30 }, fields: 'pixelSize' } },  // C (spacer)
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 }, properties: { pixelSize: 220 }, fields: 'pixelSize' } }, // D
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 4, endIndex: 5 }, properties: { pixelSize: 90 }, fields: 'pixelSize' } },  // E
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 5, endIndex: 6 }, properties: { pixelSize: 30 }, fields: 'pixelSize' } },  // F (spacer)
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 6, endIndex: 7 }, properties: { pixelSize: 150 }, fields: 'pixelSize' } }, // G
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 7, endIndex: 8 }, properties: { pixelSize: 80 }, fields: 'pixelSize' } },  // H
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 8, endIndex: 9 }, properties: { pixelSize: 30 }, fields: 'pixelSize' } },  // I (spacer)

    // Table Headers (Row 4 & Row 14)
    getCellFormatRequest(sheetId, 3, 4, 0, 2, { userEnteredFormat: { backgroundColor: { red: 43 / 255, green: 108 / 255, blue: 176 / 255 }, textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true, fontSize: 10 }, verticalAlignment: 'MIDDLE' } }),
    getCellFormatRequest(sheetId, 13, 14, 0, 2, { userEnteredFormat: { backgroundColor: { red: 43 / 255, green: 108 / 255, blue: 176 / 255 }, textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true, fontSize: 10 }, verticalAlignment: 'MIDDLE' } }),
    getCellFormatRequest(sheetId, 3, 4, 3, 5, { userEnteredFormat: { backgroundColor: { red: 43 / 255, green: 108 / 255, blue: 176 / 255 }, textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true, fontSize: 10 }, verticalAlignment: 'MIDDLE' } }),
    getCellFormatRequest(sheetId, 13, 14, 3, 5, { userEnteredFormat: { backgroundColor: { red: 43 / 255, green: 108 / 255, blue: 176 / 255 }, textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true, fontSize: 10 }, verticalAlignment: 'MIDDLE' } }),
    getCellFormatRequest(sheetId, 3, 4, 6, 8, { userEnteredFormat: { backgroundColor: { red: 43 / 255, green: 108 / 255, blue: 176 / 255 }, textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 }, bold: true, fontSize: 10 }, verticalAlignment: 'MIDDLE' } }),

    // Numeric alignments (right-aligned for numbers)
    getCellFormatRequest(sheetId, 4, areaEndRow, 1, 2, { userEnteredFormat: { horizontalAlignment: 'RIGHT' } }),
    getCellFormatRequest(sheetId, 14, countryEndRow, 1, 2, { userEnteredFormat: { horizontalAlignment: 'RIGHT' } }),
    getCellFormatRequest(sheetId, 4, 12, 4, 5, { userEnteredFormat: { horizontalAlignment: 'RIGHT' } }),
    getCellFormatRequest(sheetId, 14, 16, 4, 5, { userEnteredFormat: { horizontalAlignment: 'RIGHT' } }),
    getCellFormatRequest(sheetId, 4, hourEndRow, 7, 8, { userEnteredFormat: { horizontalAlignment: 'RIGHT' } }),

    // Table borders
    getBorderRequest(sheetId, 3, areaEndRow, 0, 2),
    getBorderRequest(sheetId, 13, countryEndRow, 0, 2),
    getBorderRequest(sheetId, 3, 12, 3, 5),
    getBorderRequest(sheetId, 13, 16, 3, 5),
    getBorderRequest(sheetId, 3, hourEndRow, 6, 8),
  ];

  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
  logger.info('🎨 Formato visual de tablas y grilla aplicado.');
}

async function createCharts(sheets: sheets_v4.Sheets, spreadsheetId: string, sheetId: number, data: DashboardData): Promise<void> {
  const areaEndRow = 4 + data.areaCounts.length;
  const countryEndRow = 14 + data.countryCounts.length;
  const hourEndRow = 4 + data.hourDist.length;

  const requests = getChartRequests(sheetId, areaEndRow, countryEndRow, hourEndRow);
  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
  logger.info('📈 4 gráficos nativos interactivos creados en el Dashboard.');
}

export async function writeDashboard(data: DashboardData): Promise<void> {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = config.GOOGLE_SPREADSHEET_ID;

  logger.info('🚀 Generando Dashboard...');
  const sheetId = await ensureDashboardSheet(sheets, spreadsheetId);
  await writeDataTables(sheets, spreadsheetId, data);
  await formatDashboard(sheets, spreadsheetId, sheetId, data);
  await createCharts(sheets, spreadsheetId, sheetId, data);
  logger.info('✅ Dashboard generado exitosamente.');
}
