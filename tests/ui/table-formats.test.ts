import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { spreadsheetSafe, toCsv, toHtmlTable, toMarkdown, toTsv } from "../../src/ui/table-formats.js";
import type { TableData } from "../../src/ui/timeline-table.js";
import { columnName, storedZip, xlsxWorkbook } from "../../src/ui/xlsx.js";

const WEIGHT = 10;
const FORMULA = "=HYPERLINK(\"http://evil\")";
const PLAIN = "Phishing mail opened";
const WITH_COMMA = "Mail, then macro";
const WITH_PIPE = "a | b";
const WITH_MARKUP = "<b>bold</b>";
const SHEET = "Timeline";
const TABLE: TableData = {
    headings: [{ label: "What", weight: WEIGHT }, { label: "Who", weight: WEIGHT }],
    rows: [[PLAIN, WITH_COMMA], [FORMULA, WITH_PIPE], [WITH_MARKUP, ""]]
};
const ZIP_END_SIGNATURE = 0x06054b50;
const ZIP_END_RECORD = 22;
const ZIP_ENTRY_COUNT_OFFSET = 10;
const WORKBOOK_PARTS = 6;
const BYTE_ORDER_MARK = 0xfeff;

function endRecord(bytes: Uint8Array): DataView {
    return new DataView(bytes.buffer, bytes.length - ZIP_END_RECORD, ZIP_END_RECORD);
}

describe("table formats", () => {
    it("guards cells a spreadsheet would run as formulas", () => {
        assert.equal(spreadsheetSafe(FORMULA), `'${FORMULA}`);
        assert.equal(spreadsheetSafe("-1"), "'-1");
        assert.equal(spreadsheetSafe(PLAIN), PLAIN);
    });

    it("writes CSV with a byte order mark, quoted separators and guarded formulas", () => {
        const csv = toCsv(TABLE);
        assert.equal(csv.charCodeAt(0), BYTE_ORDER_MARK);
        const lines = csv.slice(1).split("\r\n");
        assert.equal(lines[0], "What,Who");
        assert.equal(lines[1], `${PLAIN},"${WITH_COMMA}"`);
        assert.equal(lines[2], `"'=HYPERLINK(""http://evil"")",${WITH_PIPE}`);
    });

    it("escapes the pipes of a Markdown cell", () => {
        const lines = toMarkdown(TABLE).split("\n");
        assert.equal(lines[1], "| --- | --- |");
        assert.equal(lines[3], `| ${FORMULA} | a \\| b |`);
    });

    it("gives the clipboard tab separated text and escaped HTML", () => {
        assert.equal(toTsv(TABLE).split("\n")[1], `${PLAIN}\t${WITH_COMMA}`);
        const html = toHtmlTable(TABLE);
        assert.ok(html.includes("&lt;b&gt;bold&lt;/b&gt;"));
        assert.ok(!html.includes(WITH_MARKUP));
    });
});

describe("xlsx", () => {
    it("names columns the way a spreadsheet does", () => {
        assert.equal(columnName(0), "A");
        assert.equal(columnName(25), "Z");
        assert.equal(columnName(26), "AA");
        assert.equal(columnName(27), "AB");
    });

    it("closes the zip with a directory of every entry", () => {
        const bytes = storedZip(new Map([["a.txt", "one"], ["b.txt", "two"]]));
        const end = endRecord(bytes);
        assert.equal(end.getUint32(0, true), ZIP_END_SIGNATURE);
        assert.equal(end.getUint16(ZIP_ENTRY_COUNT_OFFSET, true), 2);
    });

    it("packs a workbook whose sheet holds the escaped cells", () => {
        const bytes = xlsxWorkbook(TABLE, SHEET);
        assert.equal(endRecord(bytes).getUint16(ZIP_ENTRY_COUNT_OFFSET, true), WORKBOOK_PARTS);
        const text = new TextDecoder().decode(bytes);
        assert.ok(text.includes("xl/worksheets/sheet1.xml"));
        assert.ok(text.includes(`<sheet name="${SHEET}"`));
        assert.ok(text.includes("&lt;b&gt;bold&lt;/b&gt;"));
        assert.ok(text.includes("<autoFilter ref=\"A1:B4\"/>"));
    });

    it("writes the same bytes for the same table", () => {
        assert.deepEqual(xlsxWorkbook(TABLE, SHEET), xlsxWorkbook(TABLE, SHEET));
    });
});
