import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ZatcaLabel } from "./labels";
import { base64ToBytes, buildPhase1QrPayload, bytesToBase64, decodeQrPayload, encodeTlv, zatcaAmount, zatcaTimestamp } from "./qr";
import { qrPath } from "./qr-image";
import { documentKindFor, isValidVatNumber, sellerAddressLines, sellerProblems } from "./seller";

/**
 * The QR code is a statement to the tax authority about what was charged, and it is unreadable to
 * anyone checking it by eye. So it is tested rather than inspected: a wrong byte here produces a
 * code that scans perfectly and says the wrong thing.
 *
 * Run with `npm test`.
 */

describe("TLV encoding", () => {
  it("writes tag, byte length, then the value", () => {
    const record = encodeTlv(2, "310175397400003");
    assert.equal(record[0], 2);
    assert.equal(record[1], 15);
    assert.equal(record.length, 17);
  });

  it("measures the length in bytes, not characters", () => {
    // Arabic costs two bytes a letter. Measuring with String.length would understate the length
    // and leave a decoder reading into the next record.
    const word = "شركة";
    assert.equal(word.length, 4);
    assert.equal(encodeTlv(1, word)[1], 8);
  });

  it("refuses a tag outside a single byte", () => {
    assert.throws(() => encodeTlv(0, "x"));
    assert.throws(() => encodeTlv(256, "x"));
  });

  it("truncates an over-long value on a character boundary", () => {
    // A TLV length is one byte, so 255 is the ceiling. Cutting at exactly 255 would split a
    // two-byte letter in half and produce invalid UTF-8.
    const record = encodeTlv(1, "ب".repeat(400));
    assert.equal(record[1], 254);
    const [decoded] = decodeQrPayload(bytesToBase64(record));
    assert.equal(decoded.value, "ب".repeat(127));
    assert.ok(!decoded.value.includes("�"), "no replacement character");
  });
});

describe("base64", () => {
  // Node's Buffer is an independent implementation, so it makes a fair oracle.
  const probes = [
    new Uint8Array([]),
    new Uint8Array([0]),
    new Uint8Array([1, 2]),
    new Uint8Array([1, 2, 3]),
    new Uint8Array([255, 254, 253, 252]),
    new Uint8Array(Array.from({ length: 300 }, (_, i) => i % 256)),
  ];

  it("matches Buffer's encoding", () => {
    for (const bytes of probes) {
      assert.equal(bytesToBase64(bytes), Buffer.from(bytes).toString("base64"));
    }
  });

  it("round trips", () => {
    for (const bytes of probes) {
      assert.deepEqual(Array.from(base64ToBytes(bytesToBase64(bytes))), Array.from(bytes));
    }
  });
});

describe("amount and timestamp formatting", () => {
  it("prints amounts to two places with no grouping", () => {
    assert.equal(zatcaAmount(1000), "1000.00");
    assert.equal(zatcaAmount(1234567.5), "1234567.50");
    assert.equal(zatcaAmount(149.999), "150.00");
    assert.equal(zatcaAmount(0), "0.00");
  });

  it("never prints negative zero", () => {
    assert.equal(zatcaAmount(-0), "0.00");
  });

  it("prints the timestamp to the second, in Zulu", () => {
    assert.equal(zatcaTimestamp(new Date("2026-10-12T15:30:00.123Z")), "2026-10-12T15:30:00Z");
  });

  it("keeps the calendar day of a date-only document", () => {
    // Document dates are stored at UTC midnight, so the day in the QR is the day on the invoice.
    assert.equal(zatcaTimestamp(new Date("2026-10-12T00:00:00.000Z")), "2026-10-12T00:00:00Z");
  });
});

describe("the Phase 1 payload", () => {
  const input = {
    sellerName: "مؤسسة بيج هوك للتجارة",
    vatNumber: "310175397400003",
    issuedAt: new Date("2026-10-12T15:30:00Z"),
    totalWithVat: 1150,
    vatTotal: 150,
  };

  it("carries the five mandatory records in tag order", () => {
    const decoded = decodeQrPayload(buildPhase1QrPayload(input));
    assert.deepEqual(
      decoded.map((r) => r.tag),
      [1, 2, 3, 4, 5],
    );
  });

  it("decodes back to exactly what went in", () => {
    const decoded = decodeQrPayload(buildPhase1QrPayload(input));
    assert.deepEqual(
      decoded.map((r) => r.value),
      ["مؤسسة بيج هوك للتجارة", "310175397400003", "2026-10-12T15:30:00Z", "1150.00", "150.00"],
    );
  });

  it("is deterministic — the same document always gives the same code", () => {
    // A reprinted receipt has to carry the code the customer was first given.
    assert.equal(buildPhase1QrPayload(input), buildPhase1QrPayload(input));
  });

  it("stops rather than inventing a value when the payload is truncated", () => {
    const full = buildPhase1QrPayload(input);
    const cut = bytesToBase64(base64ToBytes(full).subarray(0, 20));
    const decoded = decodeQrPayload(cut);
    assert.ok(decoded.length < 5);
    for (const record of decoded) assert.ok(record.value.length > 0);
  });
});

describe("the drawable QR", () => {
  it("includes the quiet zone, without which it often will not scan", () => {
    const { size, path } = qrPath(buildPhase1QrPayload({
      sellerName: "BigHawk",
      vatNumber: "310175397400003",
      issuedAt: new Date("2026-10-12T15:30:00Z"),
      totalWithVat: 115,
      vatTotal: 15,
    }));
    // A version-1 symbol is 21 modules; the 4-module quiet zone each side adds 8.
    assert.ok(size >= 29, `expected room for a quiet zone, got ${size}`);
    assert.ok(path.startsWith("M"));
  });
});

describe("the seller's details", () => {
  it("accepts a VAT number of 15 digits beginning and ending with 3", () => {
    assert.equal(isValidVatNumber("310175397400003"), true);
  });

  it("rejects anything else", () => {
    for (const bad of ["", null, undefined, "31017539740000", "3101753974000034", "410175397400003", "310175397400004", "3101753974000O3"]) {
      assert.equal(isValidVatNumber(bad), false, `expected ${String(bad)} to be rejected`);
    }
  });

  it("names every missing field, in words someone can act on", () => {
    const problems = sellerProblems({
      companyName: "",
      companyNameAr: null,
      vatNumber: null,
      buildingNumber: null,
      streetName: null,
      district: null,
      city: null,
      postalCode: null,
    });
    assert.equal(problems.length, 8);
    for (const problem of problems) assert.ok(problem.endsWith("."), `"${problem}" should read as a sentence`);
  });

  it("is satisfied once the details are complete", () => {
    assert.deepEqual(
      sellerProblems({
        companyName: "BigHawk Trading",
        companyNameAr: "مؤسسة بيج هوك للتجارة",
        vatNumber: "310175397400003",
        buildingNumber: "1234",
        streetName: "King Fahd Road",
        district: "Al Olaya",
        city: "Riyadh",
        postalCode: "12211",
      }),
      [],
    );
  });

  it("treats whitespace as missing", () => {
    const problems = sellerProblems({
      companyName: "   ",
      companyNameAr: "  ",
      vatNumber: "310175397400003",
      buildingNumber: "1234",
      streetName: "King Fahd Road",
      district: "Al Olaya",
      city: "Riyadh",
      postalCode: "12211",
    });
    assert.equal(problems.length, 2);
  });

  it("leaves out address parts that were never filled in", () => {
    assert.deepEqual(
      sellerAddressLines({
        buildingNumber: "1234",
        streetName: "King Fahd Road",
        additionalNumber: null,
        district: "Al Olaya",
        city: "Riyadh",
        postalCode: "12211",
        region: null,
      }),
      ["1234 King Fahd Road", "Al Olaya, Riyadh", "12211"],
    );
  });
});

describe("standard against simplified", () => {
  it("calls a sale to a VAT-registered buyer a standard tax invoice", () => {
    assert.equal(documentKindFor({ vatNumber: "300000000000003" }), "STANDARD");
  });

  it("calls everything else simplified", () => {
    assert.equal(documentKindFor(null), "SIMPLIFIED");
    assert.equal(documentKindFor({ vatNumber: null }), "SIMPLIFIED");
    // A malformed number is not a registration, so the invoice is not a standard one.
    assert.equal(documentKindFor({ vatNumber: "30000" }), "SIMPLIFIED");
  });
});

describe("the Arabic labels", () => {
  it("gives every term both languages", () => {
    for (const [key, label] of Object.entries(ZatcaLabel)) {
      assert.ok(label.en.trim().length > 0, `${key} has no English`);
      assert.ok(label.ar.trim().length > 0, `${key} has no Arabic`);
      // Arabic script lives in U+0600–U+06FF; a Latin string here would mean a forgotten translation.
      assert.match(label.ar, /[؀-ۿ]/, `${key}'s Arabic is not Arabic`);
    }
  });

  it("does not put a VAT rate in a label, because the rate is a setting", () => {
    assert.ok(!/\d/.test(ZatcaLabel.vatTotal.en + ZatcaLabel.vatTotal.ar));
  });
});
