// The timeline table written as text: CSV for any tool, Markdown for tickets and wikis, and the tab
// separated and HTML pair the clipboard carries so a paste lands as a table.

import type { TableData } from "./timeline-table.js";

const CSV_SEPARATOR = ",";
const CSV_LINE_END = "\r\n";
// Without the mark, Excel reads a CSV in the local code page and mangles every accent
const BYTE_ORDER_MARK = "\uFEFF";
const CSV_NEEDS_QUOTES = /[",\r\n]/;
// Incident records quote attacker supplied text, and a spreadsheet runs a cell starting with one of
// these as a formula. The leading apostrophe makes it plain text again.
const FORMULA_START = /^[=+\-@\t\r]/;
const FORMULA_GUARD = "'";
const LINE_BREAKS = /\r\n|\r|\n/g;

/** A cell a spreadsheet will show as written rather than evaluate. */
export function spreadsheetSafe(value: string): string {
    return FORMULA_START.test(value) ? `${FORMULA_GUARD}${value}` : value;
}

function tableLines(table: TableData): (readonly string[])[] {
    return [table.headings.map(heading => heading.label), ...table.rows];
}

function csvCell(value: string): string {
    const safe = spreadsheetSafe(value);
    return CSV_NEEDS_QUOTES.test(safe) ? `"${safe.replace(/"/g, "\"\"")}"` : safe;
}

export function toCsv(table: TableData): string {
    return BYTE_ORDER_MARK + tableLines(table).map(cells => cells.map(csvCell).join(CSV_SEPARATOR)).join(CSV_LINE_END) + CSV_LINE_END;
}

function markdownCell(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(LINE_BREAKS, " ");
}

export function toMarkdown(table: TableData): string {
    const row = (cells: readonly string[]): string => `| ${cells.map(markdownCell).join(" | ")} |`;
    const lines = [row(table.headings.map(heading => heading.label)), row(table.headings.map(() => "---")), ...table.rows.map(row)];
    return `${lines.join("\n")}\n`;
}

export function toTsv(table: TableData): string {
    return tableLines(table).map(cells => cells.map(cell => spreadsheetSafe(cell).replace(/\t/g, " ").replace(LINE_BREAKS, " ")).join("\t")).join("\n");
}

export function escapeHtml(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** A bare table, which is what word processors and mail clients keep when a paste carries HTML. */
export function toHtmlTable(table: TableData): string {
    const cells = (tag: string, values: readonly string[]): string => values.map(value => `<${tag}>${escapeHtml(spreadsheetSafe(value))}</${tag}>`).join("");
    const head = `<tr>${cells("th", table.headings.map(heading => heading.label))}</tr>`;
    const body = table.rows.map(row => `<tr>${cells("td", row)}</tr>`).join("");
    return `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
}
