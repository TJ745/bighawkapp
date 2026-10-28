import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ageDocuments, bucketFor, daysBetween, emptyAging } from "./aging";

/**
 * How old the money is.
 *
 * The boundaries are the whole feature: a business decides who to chase from these buckets, and a
 * document in the wrong one is either harassed early or forgotten for a month. The edges are
 * pinned exactly, including the one everything else in the app already agrees on — the due date
 * itself is not late.
 */

const TODAY = "2026-10-26";

describe("which bucket money falls in", () => {
  it("does not call a document due today late", () => {
    // The same rule the overdue status uses. Disagreeing with it would put a document in two
    // different states on two different screens.
    assert.equal(bucketFor(TODAY, TODAY), "current");
  });

  it("treats anything not yet due as current, however far ahead", () => {
    assert.equal(bucketFor("2026-12-31", TODAY), "current");
  });

  it("puts the first day late in the first bucket", () => {
    assert.equal(bucketFor("2026-10-25", TODAY), "d1_30");
  });

  it("holds each boundary exactly", () => {
    assert.equal(bucketFor("2026-09-26", TODAY), "d1_30", "30 days late is still 1–30");
    assert.equal(bucketFor("2026-09-25", TODAY), "d31_60", "31 days late moves on");
    assert.equal(bucketFor("2026-08-27", TODAY), "d31_60", "60 days late is still 31–60");
    assert.equal(bucketFor("2026-08-26", TODAY), "d61_90", "61 days late moves on");
    assert.equal(bucketFor("2026-07-28", TODAY), "d61_90", "90 days late is still 61–90");
    assert.equal(bucketFor("2026-07-27", TODAY), "d90_plus", "91 days late is over 90");
  });

  it("counts whole days across a month end", () => {
    assert.equal(daysBetween("2026-09-30", "2026-10-01"), 1);
    assert.equal(daysBetween("2026-10-26", "2026-10-26"), 0);
  });
});

describe("totalling a set of documents", () => {
  it("adds each one to its own bucket and to the total", () => {
    const aging = ageDocuments(
      [
        { dueDate: "2026-11-30", remaining: 100 },
        { dueDate: "2026-10-20", remaining: 200 },
        { dueDate: "2026-07-01", remaining: 300 },
      ],
      TODAY,
    );
    assert.equal(aging.current, 100);
    assert.equal(aging.d1_30, 200);
    assert.equal(aging.d90_plus, 300);
    assert.equal(aging.total, 600);
  });

  it("ignores anything already settled, so a paid bill never reads as late", () => {
    const aging = ageDocuments([{ dueDate: "2026-01-01", remaining: 0 }], TODAY);
    assert.deepEqual(aging, emptyAging());
  });

  it("keeps the buckets adding up to the total", () => {
    // The invariant the header depends on: the columns must sum to the figure beside them.
    const aging = ageDocuments(
      [
        { dueDate: "2026-10-26", remaining: 33.33 },
        { dueDate: "2026-10-01", remaining: 33.33 },
        { dueDate: "2026-06-01", remaining: 33.34 },
      ],
      TODAY,
    );
    const summed = aging.current + aging.d1_30 + aging.d31_60 + aging.d61_90 + aging.d90_plus;
    assert.equal(Math.round(summed * 100) / 100, aging.total);
  });
});
