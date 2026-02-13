type ExportSheet = {
  name: string;
  headers: string[];
  rows: Array<(string | number | null | undefined)[]>;
};

type ExportFinalRow = {
  position?: number | null;
  name: string;
  category?: string | null;
  rounds?: Array<number | null>;
  total?: number | null;
  diffLabel?: string | null;
};

type ExportPointsRow = {
  position?: number | null;
  name: string;
  points?: number | null;
};

type ExportChampionship = {
  categories: string[];
  events: Array<{ eventId: string; name: string; kind: string }>;
  byCategory: Record<string, Array<{ name: string; total: number; events: Record<string, number> }>>;
};

type ExportResultsOptions = {
  eventName: string;
  eventDate?: string | null;
  finalRows: ExportFinalRow[];
  pointsByCategory?: Record<string, ExportPointsRow[]>;
  championship?: ExportChampionship | null;
  formats?: Array<'csv' | 'xlsx' | 'pdf'>;
  includeFinal?: boolean;
  includePoints?: boolean;
  includeChampionship?: boolean;
};

const normalizeFileName = (value: string) => (
  String(value || 'resultados')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]+/g, '')
    .replace(/\-+/g, '-')
    .replace(/\-$/, '')
);

const toCsvValue = (value: string | number | null | undefined) => {
  if (value == null) return '';
  const text = String(value);
  if (text.includes('"') || text.includes(',') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const buildFinalSheets = (rows: ExportFinalRow[]) => {
  const maxRounds = rows.reduce((max, row) => Math.max(max, row.rounds?.length || 0), 0);
  const headers = ['Posicion', 'Jugador', 'Categoria', ...Array.from({ length: maxRounds }, (_, i) => `R${i + 1}`), 'Total', 'Diff'];
  const data = rows.map((row) => {
    const rounds = row.rounds || [];
    const padded = Array.from({ length: maxRounds }, (_, i) => rounds[i] ?? null);
    return [
      row.position ?? '',
      row.name,
      row.category ?? '',
      ...padded,
      row.total ?? '',
      row.diffLabel ?? '',
    ];
  });
  return [{ name: 'Clasificacion', headers, rows: data }];
};

const buildPointsSheets = (pointsByCategory?: Record<string, ExportPointsRow[]>) => {
  if (!pointsByCategory) return [] as ExportSheet[];
  return Object.entries(pointsByCategory).map(([category, rows]) => ({
    name: `Puntos-${category}`,
    headers: ['Posicion', 'Jugador', 'Puntos'],
    rows: rows.map((row) => [row.position ?? '', row.name, row.points ?? 0]),
  }));
};

const buildChampionshipSheets = (championship?: ExportChampionship | null) => {
  if (!championship) return [] as ExportSheet[];
  return championship.categories.map((category) => {
    const rows = championship.byCategory?.[category] || [];
    const headers = ['Posicion', 'Jugador', 'Total', ...championship.events.map((ev) => ev.name)];
    const data = rows.map((row, idx) => [
      idx + 1,
      row.name,
      row.total,
      ...championship.events.map((ev) => row.events?.[ev.eventId] ?? 0),
    ]);
    return { name: `Campeonato-${category}`, headers, rows: data };
  });
};

const buildSheets = (options: ExportResultsOptions) => {
  const sheets: ExportSheet[] = [];
  const includeFinal = options.includeFinal !== false;
  const includePoints = options.includePoints !== false;
  const includeChampionship = options.includeChampionship !== false;
  if (includeFinal) sheets.push(...buildFinalSheets(options.finalRows));
  if (includePoints) sheets.push(...buildPointsSheets(options.pointsByCategory));
  if (includeChampionship) sheets.push(...buildChampionshipSheets(options.championship));
  return sheets;
};

const exportCsv = (sheets: ExportSheet[], baseName: string) => {
  sheets.forEach((sheet) => {
    const lines = [
      sheet.headers.map(toCsvValue).join(','),
      ...sheet.rows.map((row) => row.map(toCsvValue).join(',')),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, `${baseName}-${normalizeFileName(sheet.name)}.csv`);
  });
};

const exportXlsx = async (sheets: ExportSheet[], baseName: string) => {
  const xlsx = await import('xlsx');
  const wb = xlsx.utils.book_new();
  sheets.forEach((sheet) => {
    const ws = xlsx.utils.aoa_to_sheet([sheet.headers, ...sheet.rows]);
    xlsx.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  });
  xlsx.writeFile(wb, `${baseName}.xlsx`);
};

const exportPdf = async (sheets: ExportSheet[], baseName: string) => {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ orientation: 'landscape' });
  sheets.forEach((sheet, idx) => {
    if (idx > 0) doc.addPage();
    doc.setFontSize(12);
    doc.text(sheet.name, 14, 14);
    autoTable(doc, {
      head: [sheet.headers],
      body: sheet.rows.map((row) => row.map((cell) => (cell == null ? '' : String(cell)))),
      startY: 20,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [31, 41, 55] },
    });
  });
  doc.save(`${baseName}.pdf`);
};

export const exportResultsAll = async (options: ExportResultsOptions) => {
  const baseName = normalizeFileName([options.eventName, options.eventDate].filter(Boolean).join('-')) || 'resultados';
  const sheets = buildSheets(options);
  if (!sheets.length) return;
  const formats = options.formats?.length ? options.formats : ['csv'];
  if (formats.includes('csv')) exportCsv(sheets, baseName);
  if (formats.includes('xlsx')) await exportXlsx(sheets, baseName);
  if (formats.includes('pdf')) await exportPdf(sheets, baseName);
};
