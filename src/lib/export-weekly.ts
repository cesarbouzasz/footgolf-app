type WeeklyExportRow = {
  position: number;
  name: string;
  holes: Array<number | null>;
  total: number | null;
  diffLabel: string | null;
};

type WeeklyExportOptions = {
  eventName: string;
  eventDate?: string | null;
  pars: number[];
  rows: WeeklyExportRow[];
  formats?: Array<'xlsx' | 'pdf'>;
};

type RowMeta =
  | { type: 'par' }
  | { type: 'player'; row: WeeklyExportRow };

const DEFAULT_HOLES = 18;

const normalizeFileName = (value: string) => (
  String(value || 'tarjeta-semanal')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]+/g, '')
    .replace(/\-+/g, '-')
    .replace(/\-$/, '')
);

const buildHeaders = (holeCount: number) => [
  'Pos',
  'Jugador',
  ...Array.from({ length: holeCount }, (_, idx) => `H${idx + 1}`),
  'Total',
  'Diff',
];

const buildParRow = (pars: number[]) => {
  const parTotal = pars.reduce((sum, value) => sum + (Number(value) || 0), 0);
  return ['Par', '', ...pars, parTotal, ''];
};

const buildPlayerRow = (row: WeeklyExportRow, holeCount: number) => {
  const holes = Array.from({ length: holeCount }, (_, idx) => row.holes[idx] ?? null);
  return [row.position, row.name, ...holes, row.total ?? '', row.diffLabel ?? ''];
};

const buildRows = (pars: number[], rows: WeeklyExportRow[]) => {
  const holeCount = pars.length || DEFAULT_HOLES;
  const meta: RowMeta[] = [{ type: 'par' }, ...rows.map((row) => ({ type: 'player' as const, row }))];
  const body = meta.map((entry) =>
    entry.type === 'par' ? buildParRow(pars) : buildPlayerRow(entry.row, holeCount)
  );
  return { meta, body, holeCount };
};

const exportXlsx = async (headers: string[], body: Array<Array<string | number | null>>, baseName: string) => {
  const xlsx = await import('xlsx');
  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.aoa_to_sheet([headers, ...body]);
  xlsx.utils.book_append_sheet(wb, ws, 'Tarjeta');
  xlsx.writeFile(wb, `${baseName}.xlsx`);
};

const resolveHoleStyle = (diff: number) => {
  if (diff <= -2) return { fillColor: [2, 132, 199], textColor: [255, 255, 255] }; // Eagle+
  if (diff === -1) return { fillColor: [22, 163, 74], textColor: [255, 255, 255] }; // Birdie
  if (diff === 0) return { fillColor: null, textColor: null }; // Par
  if (diff === 1) return { fillColor: [185, 28, 28], textColor: [255, 255, 255] }; // Bogey
  return { fillColor: [127, 29, 29], textColor: [255, 255, 255] }; // Double+
};

const exportPdf = async (
  headers: string[],
  body: Array<Array<string | number | null>>,
  meta: RowMeta[],
  pars: number[],
  baseName: string
) => {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ orientation: 'landscape' });

  autoTable(doc, {
    head: [headers],
    body: body.map((row) => row.map((cell) => (cell == null ? '' : String(cell)))),
    startY: 18,
    styles: { fontSize: 7, cellPadding: 1.4 },
    headStyles: { fillColor: [31, 41, 55], textColor: [255, 255, 255] },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const rowMeta = meta[data.row.index];
      if (!rowMeta) return;
      if (rowMeta.type === 'par') {
        data.cell.styles.fillColor = [243, 244, 246];
        data.cell.styles.textColor = [31, 41, 55];
        data.cell.styles.fontStyle = 'bold';
        return;
      }

      const holeStartIndex = 2;
      const holeIndex = data.column.index - holeStartIndex;
      if (holeIndex < 0 || holeIndex >= pars.length) return;

      const strokeValue = rowMeta.row.holes[holeIndex];
      if (strokeValue == null || Number.isNaN(strokeValue)) return;

      const diff = strokeValue - (pars[holeIndex] || 0);
      const { fillColor, textColor } = resolveHoleStyle(diff);
      if (fillColor) data.cell.styles.fillColor = fillColor as any;
      if (textColor) data.cell.styles.textColor = textColor as any;
    },
  });

  doc.save(`${baseName}.pdf`);
};

export const exportWeeklyDetailed = async (options: WeeklyExportOptions) => {
  const baseName = normalizeFileName([options.eventName, options.eventDate].filter(Boolean).join('-'))
    || 'tarjeta-semanal';
  const pars = options.pars.length ? options.pars : Array.from({ length: DEFAULT_HOLES }, () => 4);
  const headers = buildHeaders(pars.length || DEFAULT_HOLES);
  const { meta, body } = buildRows(pars, options.rows);
  const formats = options.formats?.length ? options.formats : ['pdf'];

  if (formats.includes('xlsx')) await exportXlsx(headers, body, baseName);
  if (formats.includes('pdf')) await exportPdf(headers, body, meta, pars, baseName);
};

export type { WeeklyExportRow, WeeklyExportOptions };
