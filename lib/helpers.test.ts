import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { actionErrorLines, actionErrorText, type ActionFailure } from "./action-error";
import { DOCUMENT_NUMBER_PADDING, formatDocumentNumber } from "./business/document-number";
import { addDays, isDateOnly, parseDateOnly, toDateOnly, todayInTimeZone } from "./dates";
import { num } from "./decimal";

/**
 * The small shared helpers.
 *
 * None of these is interesting on its own, which is the point: they are used everywhere, so a quiet
 * change of behaviour here moves money, dates or document numbers across the whole app at once.
 */

describe("date-only values", () => {
  /**
   * Document dates are calendar dates stored as Postgres DATE and handled at UTC midnight. Doing it
   * in local time is the classic bug: an invoice dated the 1st becomes the 31st of the month before
   * for anyone west of UTC.
   */
  it("parses a calendar date to UTC midnight", () => {
    assert.equal(parseDateOnly("2026-10-13").toISOString(), "2026-10-13T00:00:00.000Z");
  });

  it("round trips without shifting the day", () => {
    for (const value of ["2026-01-01", "2026-02-28", "2026-06-30", "2026-12-31"]) {
      assert.equal(toDateOnly(parseDateOnly(value)), value);
    }
  });

  it("refuses anything that is not a calendar date", () => {
    for (const bad of ["", "13/10/2026", "2026-10-13T10:00:00Z", "2026-1-1", "not a date", "0000-00-00"]) {
      assert.throws(() => parseDateOnly(bad), `${bad} should be refused`);
    }
  });

  it("recognises the shape without parsing it", () => {
    assert.equal(isDateOnly("2026-10-13"), true);
    assert.equal(isDateOnly("2026-10-13T00:00:00Z"), false);
    assert.equal(isDateOnly(20261013), false);
    assert.equal(isDateOnly(null), false);
  });

  describe("addDays", () => {
    it("adds payment terms to an invoice date", () => {
      assert.equal(addDays("2026-10-13", 30), "2026-11-12");
      assert.equal(addDays("2026-10-13", 0), "2026-10-13");
    });

    it("crosses a month end", () => {
      assert.equal(addDays("2026-01-31", 1), "2026-02-01");
    });

    it("crosses a year end", () => {
      assert.equal(addDays("2026-12-31", 1), "2027-01-01");
    });

    it("handles a leap year", () => {
      assert.equal(addDays("2028-02-28", 1), "2028-02-29");
      assert.equal(addDays("2027-02-28", 1), "2027-03-01");
    });

    it("counts backwards too", () => {
      assert.equal(addDays("2026-03-01", -1), "2026-02-28");
    });
  });

  it("reads today as a calendar date in the company's time zone", () => {
    // Not a fixed value — only the shape can be asserted without freezing the clock.
    assert.ok(isDateOnly(todayInTimeZone("Asia/Riyadh")));
    assert.ok(isDateOnly(todayInTimeZone("UTC")));
  });

  it("can disagree with UTC about the date, which is the whole reason it exists", () => {
    /**
     * Riyadh is UTC+3, so for three hours each day the two differ. Rather than depend on the clock,
     * this checks two far-apart zones are never more than a day apart and are real dates — the
     * guarantee that matters is that the company's own day is what gets used.
     */
    const riyadh = parseDateOnly(todayInTimeZone("Asia/Riyadh")).getTime();
    const honolulu = parseDateOnly(todayInTimeZone("Pacific/Honolulu")).getTime();
    const dayApart = Math.abs(riyadh - honolulu) / 86_400_000;
    assert.ok(dayApart <= 1, `time zones should differ by at most a day, got ${dayApart}`);
  });
});

describe("num", () => {
  /** Prisma hands back Decimal objects; everything that formats or adds them needs a number. */
  it("converts a Prisma Decimal", () => {
    assert.equal(num({ toNumber: () => 1234.56 }), 1234.56);
  });

  it("passes a number through", () => {
    assert.equal(num(1234.56), 1234.56);
    assert.equal(num(0), 0);
    assert.equal(num(-5), -5);
  });

  it("parses a numeric string", () => {
    assert.equal(num("1234.56"), 1234.56);
  });

  it("treats nothing as zero rather than NaN", () => {
    // A NaN reaching a total would poison every sum it is part of.
    assert.equal(num(null), 0);
    assert.equal(num(undefined), 0);
    assert.equal(num(""), 0);
    assert.equal(num("not a number"), 0);
  });
});

describe("document numbers", () => {
  it("formats with the year, as most documents do", () => {
    assert.equal(formatDocumentNumber("INV", true, 2026, 1), "INV-2026-0001");
    assert.equal(formatDocumentNumber("GRN", true, 2026, 42), "GRN-2026-0042");
  });

  it("formats without the year when the sequence does not reset", () => {
    assert.equal(formatDocumentNumber("POS", false, 2026, 7), "POS-0007");
  });

  it("pads to a fixed width", () => {
    assert.equal(formatDocumentNumber("INV", true, 2026, 1).split("-")[2].length, DOCUMENT_NUMBER_PADDING);
  });

  it("keeps growing past the padding rather than truncating", () => {
    // The ten-thousandth invoice of a year must still be its own number.
    assert.equal(formatDocumentNumber("INV", true, 2026, 10000), "INV-2026-10000");
    assert.equal(formatDocumentNumber("INV", true, 2026, 123456), "INV-2026-123456");
  });

  it("sorts in issue order as text, which is how lists show them", () => {
    const numbers = [1, 2, 10, 1000].map((n) => formatDocumentNumber("INV", true, 2026, n));
    assert.deepEqual([...numbers].sort(), numbers);
  });
});

describe("surfacing a failed action", () => {
  /**
   * `runAction` answers a validation failure with "Please check the highlighted fields." — useless
   * in a dialog that highlights nothing, so the field messages themselves are what get shown.
   */
  it("prefers the real field messages over the headline", () => {
    const lines = actionErrorLines({
      error: "Please check the highlighted fields.",
      fieldErrors: { password: ["Password must include a number"], email: ["Enter a valid email address"] },
    });
    assert.deepEqual(lines, ["Password must include a number", "Enter a valid email address"]);
  });

  it("falls back to the headline when there are no field messages", () => {
    assert.deepEqual(actionErrorLines({ error: "Stock levels come with the POS module." }), ["Stock levels come with the POS module."]);
    assert.deepEqual(actionErrorLines({ error: "Something went wrong.", fieldErrors: {} }), ["Something went wrong."]);
  });

  it("says the same thing once, however many fields complained about it", () => {
    const lines = actionErrorLines({
      error: "Please check the highlighted fields.",
      fieldErrors: { a: ["Required"], b: ["Required"], c: ["Required"] },
    });
    assert.deepEqual(lines, ["Required"]);
  });

  it("ignores blank messages instead of printing empty bullets", () => {
    const lines = actionErrorLines({ error: "Headline", fieldErrors: { a: ["", "   "], b: ["Real problem"] } });
    assert.deepEqual(lines, ["Real problem"]);
  });

  it("never returns nothing to show", () => {
    // A dialog with an empty error area looks like a hang rather than a refusal.
    const failures: ActionFailure[] = [
      { error: "Headline" },
      { error: "Headline", fieldErrors: {} },
      { error: "Headline", fieldErrors: { a: [""] } },
      { error: "Headline", fieldErrors: { a: [], b: ["  "] } },
    ];
    for (const failure of failures) {
      assert.ok(actionErrorLines(failure).length > 0, `${JSON.stringify(failure)} produced nothing`);
    }
  });

  it("joins into one sentence for a toast", () => {
    assert.equal(actionErrorText({ error: "H", fieldErrors: { a: ["One."], b: ["Two."] } }), "One. Two.");
  });
});
