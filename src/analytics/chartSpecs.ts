import { sheets_v4 } from 'googleapis';

/**
 * Retorna las requests para crear los 4 gráficos nativos de Google Sheets.
 */
export function getChartRequests(
  sheetId: number,
  areaEndRow: number,
  countryEndRow: number,
  hourEndRow: number
): sheets_v4.Schema$Request[] {
  return [
    // 1. Gráfico de torta — Área Profesional (Anchor J4)
    {
      addChart: {
        chart: {
          position: {
            overlayPosition: {
              anchorCell: { sheetId, rowIndex: 3, columnIndex: 9 }, // J4
              widthPixels: 420,
              heightPixels: 290,
            },
          },
          spec: {
            title: '🥧 Distribución por Área Profesional',
            pieChart: {
              legendPosition: 'LABELED_LEGEND',
              domain: {
                sourceRange: {
                  sources: [{ sheetId, startRowIndex: 4, endRowIndex: areaEndRow, startColumnIndex: 0, endColumnIndex: 1 }],
                },
              },
              series: {
                sourceRange: {
                  sources: [{ sheetId, startRowIndex: 4, endRowIndex: areaEndRow, startColumnIndex: 1, endColumnIndex: 2 }],
                },
              },
            },
          },
        },
      },
    },
    // 2. Gráfico de torta — Situación Laboral (Anchor N4)
    {
      addChart: {
        chart: {
          position: {
            overlayPosition: {
              anchorCell: { sheetId, rowIndex: 3, columnIndex: 14 }, // O4
              widthPixels: 420,
              heightPixels: 290,
            },
          },
          spec: {
            title: '🔍 Situación Laboral',
            pieChart: {
              legendPosition: 'LABELED_LEGEND',
              domain: {
                sourceRange: {
                  sources: [{ sheetId, startRowIndex: 14, endRowIndex: 16, startColumnIndex: 3, endColumnIndex: 4 }],
                },
              },
              series: {
                sourceRange: {
                  sources: [{ sheetId, startRowIndex: 14, endRowIndex: 16, startColumnIndex: 4, endColumnIndex: 5 }],
                },
              },
            },
          },
        },
      },
    },
    // 3. Gráfico de barras vertical (Columnas) — Distribución por País (Anchor J20)
    {
      addChart: {
        chart: {
          position: {
            overlayPosition: {
              anchorCell: { sheetId, rowIndex: 19, columnIndex: 9 }, // J20
              widthPixels: 420,
              heightPixels: 290,
            },
          },
          spec: {
            title: '🌍 Distribución por País',
            basicChart: {
              chartType: 'COLUMN',
              legendPosition: 'NO_LEGEND',
              axis: [
                { position: 'BOTTOM_AXIS', title: 'País' },
                { position: 'LEFT_AXIS', title: 'Cantidad' },
              ],
              domains: [
                {
                  domain: {
                    sourceRange: {
                      sources: [{ sheetId, startRowIndex: 14, endRowIndex: countryEndRow, startColumnIndex: 0, endColumnIndex: 1 }],
                    },
                  },
                },
              ],
              series: [
                {
                  series: {
                    sourceRange: {
                      sources: [{ sheetId, startRowIndex: 14, endRowIndex: countryEndRow, startColumnIndex: 1, endColumnIndex: 2 }],
                    },
                  },
                  color: { red: 51 / 255, green: 130 / 255, blue: 187 / 255 }, // Nice blue
                },
              ],
            },
          },
        },
      },
    },
    // 4. Gráfico de línea — Actividad Horaria (Anchor N20)
    {
      addChart: {
        chart: {
          position: {
            overlayPosition: {
              anchorCell: { sheetId, rowIndex: 19, columnIndex: 14 }, // O20
              widthPixels: 420,
              heightPixels: 290,
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
                      sources: [{ sheetId, startRowIndex: 4, endRowIndex: hourEndRow, startColumnIndex: 6, endColumnIndex: 7 }],
                    },
                  },
                },
              ],
              series: [
                {
                  series: {
                    sourceRange: {
                      sources: [{ sheetId, startRowIndex: 4, endRowIndex: hourEndRow, startColumnIndex: 7, endColumnIndex: 8 }],
                    },
                  },
                  color: { red: 224 / 255, green: 86 / 255, blue: 86 / 255 }, // Soft red
                },
              ],
            },
          },
        },
      },
    },
  ];
}
