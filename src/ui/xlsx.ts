// A spreadsheet written by hand, since the library carries no dependency. An xlsx file is a zip of a few
// XML parts. The parts are stored rather than compressed, which every reader accepts and which keeps
// the writer to a checksum and three kinds of header.

import type { TableData } from "./timeline-table.js";

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const RELATIONSHIP_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const CONTENT_TYPES_NS = "http://schemas.openxmlformats.org/package/2006/content-types";
const XML_HEAD = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>";

const HEADING_STYLE = 1;
const BODY_STYLE = 2;
const SHEET_NAME_LENGTH = 31;
const SHEET_NAME_FORBIDDEN = /[[\]:*?/\\]/g;
const DEFAULT_SHEET_NAME = "Sheet1";
const LETTERS = 26;
const LETTER_A = 65;
// Characters XML 1.0 refuses anywhere, even escaped
const XML_FORBIDDEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

const ZIP_LOCAL_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_END_SIGNATURE = 0x06054b50;
const ZIP_VERSION = 20;
const ZIP_STORED = 0;
// 1980-01-01 at midnight, the earliest date a zip can hold, so the same table always gives the same bytes
const ZIP_DATE = 0x0021;
const ZIP_TIME = 0;
const ZIP_LOCAL_HEADER = 30;
const ZIP_CENTRAL_HEADER = 46;
const ZIP_END_RECORD = 22;
const CRC_POLYNOMIAL = 0xedb88320;
const CRC_TABLE_SIZE = 256;
const BITS_PER_BYTE = 8;

function escapeXml(value: string): string {
    return value.replace(XML_FORBIDDEN, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** The letters of a column, A for the first and AA after Z. */
export function columnName(index: number): string {
    let name = "";
    for (let rest = index + 1; rest > 0; rest = Math.floor((rest - 1) / LETTERS)) {
        name = String.fromCharCode(LETTER_A + (rest - 1) % LETTERS) + name;
    }
    return name;
}

function sheetName(name: string): string {
    return name.replace(SHEET_NAME_FORBIDDEN, " ").trim().slice(0, SHEET_NAME_LENGTH) || DEFAULT_SHEET_NAME;
}

function cell(value: string, column: number, row: number, style: number): string {
    return `<c r="${columnName(column)}${row}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

function worksheet(table: TableData): string {
    const lastColumn = columnName(Math.max(table.headings.length - 1, 0));
    const lastRow = table.rows.length + 1;
    const columns = table.headings.map((heading, index) => `<col min="${index + 1}" max="${index + 1}" width="${heading.weight}" customWidth="1"/>`).join("");
    const heading = `<row r="1">${table.headings.map((entry, index) => cell(entry.label, index, 1, HEADING_STYLE)).join("")}</row>`;
    const body = table.rows.map((values, rowIndex) => `<row r="${rowIndex + 2}">${values.map((value, index) => cell(value, index, rowIndex + 2, BODY_STYLE)).join("")}</row>`).join("");
    return `${XML_HEAD}<worksheet xmlns="${MAIN_NS}">`
        + `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
        + `<cols>${columns}</cols><sheetData>${heading}${body}</sheetData>`
        + `<autoFilter ref="A1:${lastColumn}${lastRow}"/></worksheet>`;
}

const STYLES = `${XML_HEAD}<styleSheet xmlns="${MAIN_NS}">`
    + `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>`
    + `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>`
    + `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>`
    + `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>`
    + `<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>`
    + `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>`
    + `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>`
    + `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

const CONTENT_TYPES = `${XML_HEAD}<Types xmlns="${CONTENT_TYPES_NS}">`
    + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
    + `<Default Extension="xml" ContentType="application/xml"/>`
    + `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`
    + `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    + `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;

const ROOT_RELATIONSHIPS = `${XML_HEAD}<Relationships xmlns="${PACKAGE_NS}">`
    + `<Relationship Id="rId1" Type="${RELATIONSHIP_NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

const WORKBOOK_RELATIONSHIPS = `${XML_HEAD}<Relationships xmlns="${PACKAGE_NS}">`
    + `<Relationship Id="rId1" Type="${RELATIONSHIP_NS}/worksheet" Target="worksheets/sheet1.xml"/>`
    + `<Relationship Id="rId2" Type="${RELATIONSHIP_NS}/styles" Target="styles.xml"/></Relationships>`;

function workbook(name: string): string {
    return `${XML_HEAD}<workbook xmlns="${MAIN_NS}" xmlns:r="${RELATIONSHIP_NS}">`
        + `<sheets><sheet name="${escapeXml(sheetName(name))}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
}

function crcTable(): Uint32Array {
    const table = new Uint32Array(CRC_TABLE_SIZE);
    for (let entry = 0; entry < CRC_TABLE_SIZE; entry++) {
        let value = entry;
        for (let bit = 0; bit < BITS_PER_BYTE; bit++) {
            value = value & 1 ? CRC_POLYNOMIAL ^ (value >>> 1) : value >>> 1;
        }
        table[entry] = value >>> 0;
    }
    return table;
}

const CRC_TABLE = crcTable();

function crc32(bytes: Uint8Array): number {
    let crc = 0xffffffff;
    for (const byte of bytes) {
        crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> BITS_PER_BYTE);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
    name: Uint8Array;
    data: Uint8Array;
    crc: number;
    offset: number;
}

/** Packs the files into a zip with every entry stored as is. */
export function storedZip(files: ReadonlyMap<string, string>): Uint8Array<ArrayBuffer> {
    const encoder = new TextEncoder();
    const entries: ZipEntry[] = [];
    let offset = 0;
    files.forEach((content, path) => {
        const name = encoder.encode(path);
        const data = encoder.encode(content);
        entries.push({ name, data, crc: crc32(data), offset });
        offset += ZIP_LOCAL_HEADER + name.length + data.length;
    });
    const centralSize = entries.reduce((sum, entry) => sum + ZIP_CENTRAL_HEADER + entry.name.length, 0);
    const bytes = new Uint8Array(offset + centralSize + ZIP_END_RECORD);
    const view = new DataView(bytes.buffer);
    let cursor = 0;
    const u16 = (value: number): void => { view.setUint16(cursor, value, true); cursor += 2; };
    const u32 = (value: number): void => { view.setUint32(cursor, value, true); cursor += 4; };
    const put = (chunk: Uint8Array): void => { bytes.set(chunk, cursor); cursor += chunk.length; };
    const common = (entry: ZipEntry): void => {
        u16(ZIP_STORED); u16(ZIP_TIME); u16(ZIP_DATE);
        u32(entry.crc); u32(entry.data.length); u32(entry.data.length);
        u16(entry.name.length); u16(0);
    };

    entries.forEach(entry => {
        u32(ZIP_LOCAL_SIGNATURE); u16(ZIP_VERSION); u16(0);
        common(entry);
        put(entry.name);
        put(entry.data);
    });
    entries.forEach(entry => {
        u32(ZIP_CENTRAL_SIGNATURE); u16(ZIP_VERSION); u16(ZIP_VERSION); u16(0);
        common(entry);
        u16(0); u16(0); u16(0); u32(0); u32(entry.offset);
        put(entry.name);
    });
    u32(ZIP_END_SIGNATURE); u16(0); u16(0);
    u16(entries.length); u16(entries.length);
    u32(centralSize); u32(offset); u16(0);
    return bytes;
}

/** A workbook of one sheet: the headings in bold and frozen, a filter on every column. */
export function xlsxWorkbook(table: TableData, name: string): Uint8Array<ArrayBuffer> {
    return storedZip(new Map([
        ["[Content_Types].xml", CONTENT_TYPES],
        ["_rels/.rels", ROOT_RELATIONSHIPS],
        ["xl/workbook.xml", workbook(name)],
        ["xl/_rels/workbook.xml.rels", WORKBOOK_RELATIONSHIPS],
        ["xl/styles.xml", STYLES],
        ["xl/worksheets/sheet1.xml", worksheet(table)]
    ]));
}
