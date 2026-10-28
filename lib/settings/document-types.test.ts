import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DocumentType } from "@/lib/generated/prisma/enums";
import { DOCUMENT_TYPES } from "./defaults";

/**
 * Every document type has a prefix to number with.
 *
 * `nextDocumentNumber` falls back to this list the first time a type is used, before anyone has
 * opened Settings → Document Numbering. A type missing from it does not fail at build time or at
 * sign-in: it throws the first time somebody tries to create that document, which in practice
 * means in front of a customer. That happened while adding purchase returns, which is why this
 * exists.
 */

describe("document numbering defaults", () => {
  const listed = new Set(DOCUMENT_TYPES.map((entry) => entry.type));

  it("covers every document type the database knows about", () => {
    const missing = Object.values(DocumentType).filter((type) => !listed.has(type));
    assert.deepEqual(missing, [], "these types have no default prefix, so numbering them throws");
  });

  it("lists nothing that is not a document type", () => {
    const unknown = [...listed].filter((type) => !(type in DocumentType));
    assert.deepEqual(unknown, []);
  });

  it("gives every type a prefix and a label a person can read", () => {
    for (const entry of DOCUMENT_TYPES) {
      assert.ok(entry.prefix.trim().length > 0, `${entry.type} has no prefix`);
      assert.ok(entry.label.trim().length > 0, `${entry.type} has no label`);
    }
  });

  it("does not give two types the same prefix, which would make numbers ambiguous", () => {
    const prefixes = DOCUMENT_TYPES.map((entry) => entry.prefix);
    assert.equal(new Set(prefixes).size, prefixes.length, `duplicate prefix in: ${prefixes.join(", ")}`);
  });
});
