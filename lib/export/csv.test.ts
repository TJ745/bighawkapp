import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CSV_ROW_LIMIT, UTF8_BOM, csvCell, csvFilename, toCsv } from "./csv";

/**
 * CSV for spreadsheets.
 *
 * Worth testing because every failure here is silent: a missing byte-order mark turns Arabic into
 * mojibake, an unescaped comma shifts every column after it, and an unneutralised `=` hands the
 * person who opens the file a formula someone else wrote.
 */

describe("a single cell", () => {
  it("writes plain text as it stands", () => {
    assert.equal(csvCell("Ahmed Trading"), "Ahmed Trading");
  });

  it("writes Arabic unchanged", () => {
    assert.equal(csvCell("مؤسسة بيج هوك"), "مؤسسة بيج هوك");
  });

  it("writes nothing for nothing", () => {
    assert.equal(csvCell(null), "");
    assert.equal(csvCell(undefined), "");
    assert.equal(csvCell(""), "");
  });

  describe("escaping", () => {
    it("quotes a value containing a comma, so columns do not shift", () => {
      assert.equal(csvCell("Riyadh, Al Olaya"), '"Riyadh, Al Olaya"');
    });

    it("doubles an internal quote", () => {
      assert.equal(csvCell('The "Big" Shop'), '"The ""Big"" Shop"');
    });

    it("quotes a value containing a newline, so rows do not split", () => {
      // A newline in the middle is quoted, not neutralised — only the *first* character decides
      // whether a spreadsheet reads the cell as a formula.
      assert.equal(csvCell("line one\nline two"), '"line one\nline two"');
      assert.equal(csvCell("line one\r\nline two"), '"line one\r\nline two"');
    });

    it("leaves an ordinary value unquoted", () => {
      assert.ok(!csvCell("Simple").startsWith('"'));
    });
  });

  describe("formula injection", () => {
    /**
     * A spreadsheet treats these openings as a formula, and quoting does **not** stop it: `"=1+1"`
     * is still a formula to Excel. The leading apostrophe is what makes the cell text; spreadsheets
     * strip it on display, so the value still reads as written.
     */
    it("neutralises every character a spreadsheet would execute", () => {
      for (const starter of ["=", "+", "-", "@", "\t", "\r"]) {
        const cell = csvCell(`${starter}cmd|' /c calc'!A0`);
        assert.ok(cell.replace(/^"/, "").startsWith("'"), `${JSON.stringify(starter)} was not neutralised: ${cell}`);
      }
    });

    it("neutralises a plain formula", () => {
      assert.equal(csvCell("=1+1"), "'=1+1");
    });

    it("does not mangle a value that merely contains those characters", () => {
      assert.equal(csvCell("A-1"), "A-1");
      assert.equal(csvCell("name@example.com"), "name@example.com");
    });

    it("still neutralises a negative number written as text", () => {
      // A string is text whatever it looks like; a real number is handled separately below.
      assert.equal(csvCell("-50"), "'-50");
    });
  });

  describe("numbers and dates stay data", () => {
    it("writes a number plainly, so a spreadsheet can sum it", () => {
      // No thousands separator and no currency: "1,234.56" would be two cells and a string.
      assert.equal(csvCell(1234.56), "1234.56");
      assert.equal(csvCell(0), "0");
    });

    it("writes a negative number as a number, not as text", () => {
      // A real −50 must stay summable rather than becoming the string "'-50".
      assert.equal(csvCell(-50), "-50");
    });

    it("writes nothing rather than NaN or Infinity", () => {
      // An empty cell still sums; "NaN" poisons the column.
      assert.equal(csvCell(NaN), "");
      assert.equal(csvCell(Infinity), "");
    });

    it("writes a date as YYYY-MM-DD, which sorts and parses anywhere", () => {
      assert.equal(csvCell(new Date("2026-10-13T00:00:00.000Z")), "2026-10-13");
    });

    it("writes a boolean as a word a person can read", () => {
      assert.equal(csvCell(true), "Yes");
      assert.equal(csvCell(false), "No");
    });
  });
});

describe("a whole file", () => {
  type Row = { name: string; total: number; date: Date; active: boolean };
  const columns = [
    { header: "Name", value: (r: Row) => r.name },
    { header: "Total", value: (r: Row) => r.total },
    { header: "Date", value: (r: Row) => r.date },
    { header: "Active", value: (r: Row) => r.active },
  ];
  const rows: Row[] = [
    { name: "Ahmed Trading", total: 1150, date: new Date("2026-10-13T00:00:00.000Z"), active: true },
    { name: "Riyadh, Al Olaya", total: 57.5, date: new Date("2026-10-01T00:00:00.000Z"), active: false },
  ];

  it("starts with a byte-order mark, or Excel mangles Arabic", () => {
    assert.ok(toCsv(columns, rows).startsWith(UTF8_BOM));
  });

  it("writes the headings first", () => {
    const lines = toCsv(columns, rows).slice(UTF8_BOM.length).split("\r\n");
    assert.equal(lines[0], "Name,Total,Date,Active");
  });

  it("writes one row per record, separated by CRLF", () => {
    const lines = toCsv(columns, rows).slice(UTF8_BOM.length).split("\r\n").filter(Boolean);
    assert.equal(lines.length, 3); // headings + two rows
    assert.equal(lines[1], "Ahmed Trading,1150,2026-10-13,Yes");
    assert.equal(lines[2], '"Riyadh, Al Olaya",57.5,2026-10-01,No');
  });

  it("writes a headings-only file when there is nothing to export", () => {
    // Better than an empty file, which looks like a failure.
    const csv = toCsv(columns, []);
    assert.equal(csv.slice(UTF8_BOM.length).split("\r\n").filter(Boolean).length, 1);
  });

  it("keeps every row's cell count equal to the headings", () => {
    /** The invariant that makes a file open as a table: a stray comma anywhere would break it. */
    const awkward: Row[] = [
      { name: 'He said "hi", loudly', total: -5, date: new Date("2026-01-01T00:00:00.000Z"), active: true },
      { name: "=1+1", total: 0, date: new Date("2026-01-01T00:00:00.000Z"), active: false },
      { name: "", total: NaN, date: new Date("2026-01-01T00:00:00.000Z"), active: false },
    ];
    for (const line of toCsv(columns, awkward).slice(UTF8_BOM.length).split("\r\n").filter(Boolean)) {
      // Count commas that sit outside quotes — the real field separators.
      let fields = 1;
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '"') inQuotes = !inQuotes;
        else if (line[i] === "," && !inQuotes) fields++;
      }
      assert.equal(fields, columns.length, `wrong field count in: ${line}`);
    }
  });
});

describe("the filename", () => {
  it("says what it is and when it was taken", () => {
    assert.equal(csvFilename("invoices", "2026-10-13"), "invoices-2026-10-13.csv");
  });

  it("makes a safe name out of an awkward subject", () => {
    // Branch names reach this, and a slash or a space would make an unusable download.
    assert.equal(csvFilename("stock Main Branch", "2026-10-13"), "stock-main-branch-2026-10-13.csv");
    assert.equal(csvFilename("Stock / Warehouse #2", "2026-10-13"), "stock-warehouse-2-2026-10-13.csv");
  });

  it("still produces a name when the subject reduces to nothing", () => {
    assert.equal(csvFilename("مؤسسة", "2026-10-13"), "export-2026-10-13.csv");
  });
});

describe("the row limit", () => {
  it("is generous enough for years of documents", () => {
    assert.ok(CSV_ROW_LIMIT >= 10000, "a limit this low would refuse ordinary exports");
  });
});
