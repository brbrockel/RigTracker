import { parseDate } from '@/lib/api';

/** A stored date as yyyy-mm-dd, or '' when unset. */
export function csvDate(value?: string | null): string {
  return parseDate(value)?.toISOString().slice(0, 10) ?? '';
}

/**
 * One CSV cell. Cells starting with = + - @ (or a tab/CR) get a leading ' so a spreadsheet
 * doesn't run them as formulas; cells with quotes, commas or line breaks are quoted.
 */
export function csvCell(value: string): string {
  let v = value ?? '';
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  if (/[",\r\n]/.test(v)) v = `"${v.replace(/"/g, '""')}"`;
  return v;
}

/** A CSV file's text: header row, data rows, CRLF line ends, and a UTF-8 BOM for Excel. */
export function buildCsv(headers: string[], rows: string[][]): string {
  return '﻿' + [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** Today in local time as yyyy-mm-dd. */
export function todayStamp(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** e.g. rigtracker-gear-2026-10-17.csv */
export const csvFilename = (page: string, now = new Date()) => `rigtracker-${page}-${todayStamp(now)}.csv`;

export function downloadCsv(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
