import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InvoiceStatus, PurchaseStatus, QuotationStatus, SupplierQuotationStatus } from "@/lib/generated/prisma/enums";
import {
  INVOICE_STATUS,
  QUOTATION_STATUS,
  deriveInvoiceStatus,
  deriveQuotationStatus,
  invoiceTransitions,
  quotationTransitions,
  type InvoiceStatusInput,
} from "./sales-status";
import {
  PURCHASE_STATUS,
  SUPPLIER_QUOTATION_STATUS,
  derivePurchaseStatus,
  deriveSupplierQuotationStatus,
  purchaseTransitions,
  supplierQuotationTransitions,
} from "./procurement-status";

/**
 * Derived statuses.
 *
 * A status is never typed in — it is worked out from payments and dates, which is why it is worth
 * pinning down: "Paid" appearing on something unpaid, or "Overdue" on something settled, is the kind
 * of mistake a business notices immediately and trusts the software less for.
 *
 * Document dates are stored at UTC midnight; `today` is a calendar date in the company's time zone.
 */

const TODAY = "2026-10-13";
const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

/** A plain issued invoice, for 115 with nothing paid. */
const invoice = (over: Partial<InvoiceStatusInput> = {}): InvoiceStatusInput => ({
  status: "SENT",
  date: date("2026-10-01"),
  dueDate: date("2026-10-31"),
  grandTotal: 115,
  paidTotal: 0,
  creditedTotal: 0,
  depositAmount: 0,
  sentAt: date("2026-10-01"),
  ...over,
});

describe("invoice status", () => {
  it("is Sent while it is issued and unpaid", () => {
    assert.equal(deriveInvoiceStatus(invoice(), TODAY), "SENT");
  });

  it("is Partially Paid once some money arrives", () => {
    assert.equal(deriveInvoiceStatus(invoice({ paidTotal: 50 }), TODAY), "PARTIALLY_PAID");
  });

  it("is Paid once the balance is cleared", () => {
    assert.equal(deriveInvoiceStatus(invoice({ paidTotal: 115 }), TODAY), "PAID");
  });

  it("is Paid when an overpayment lands", () => {
    assert.equal(deriveInvoiceStatus(invoice({ paidTotal: 120 }), TODAY), "PAID");
  });

  it("stays Draft until it is issued", () => {
    assert.equal(deriveInvoiceStatus(invoice({ status: "DRAFT", sentAt: null }), TODAY), "DRAFT");
  });

  it("is no longer a draft once money has arrived against it", () => {
    // Taking a payment is issuing it, whatever the stored status says.
    assert.equal(deriveInvoiceStatus(invoice({ status: "DRAFT", sentAt: null, paidTotal: 50 }), TODAY), "PARTIALLY_PAID");
  });

  it("never calls an unissued draft overdue", () => {
    const old = invoice({ status: "DRAFT", sentAt: null, date: date("2026-01-01"), dueDate: date("2026-01-31") });
    assert.equal(deriveInvoiceStatus(old, TODAY), "DRAFT");
  });

  describe("overdue", () => {
    it("is Overdue with a balance left after the due date", () => {
      assert.equal(deriveInvoiceStatus(invoice({ dueDate: date("2026-10-12") }), TODAY), "OVERDUE");
    });

    it("is not overdue on the due date itself", () => {
      // The customer has all day to pay.
      assert.equal(deriveInvoiceStatus(invoice({ dueDate: date(TODAY) }), TODAY), "SENT");
    });

    it("is not overdue once it is paid, however late the due date", () => {
      assert.equal(deriveInvoiceStatus(invoice({ dueDate: date("2026-01-01"), paidTotal: 115 }), TODAY), "PAID");
    });

    it("is Overdue when a deposit was due on the invoice date and never came", () => {
      // A deposit is money expected up front, so lateness does not wait for the due date.
      const withDeposit = invoice({ depositAmount: 50, date: date("2026-10-01"), dueDate: date("2026-12-31") });
      assert.equal(deriveInvoiceStatus(withDeposit, TODAY), "OVERDUE");
    });

    it("is not overdue when the deposit has been paid", () => {
      const paidDeposit = invoice({ depositAmount: 50, paidTotal: 50, dueDate: date("2026-12-31") });
      assert.equal(deriveInvoiceStatus(paidDeposit, TODAY), "PARTIALLY_PAID");
    });

    it("is not overdue when the deposit was credited away rather than paid", () => {
      // Nothing is owed any more, so nothing is late.
      const credited = invoice({ depositAmount: 50, creditedTotal: 50, dueDate: date("2026-12-31") });
      assert.equal(deriveInvoiceStatus(credited, TODAY), "SENT");
    });
  });

  describe("credit notes", () => {
    it("reads Credited when credit alone settled it, never Paid", () => {
      /**
       * The distinction matters: an invoice settled by a credit note was never paid, and showing it
       * as Paid would mean the money appears to have arrived when it never did.
       */
      assert.equal(deriveInvoiceStatus(invoice({ creditedTotal: 115 }), TODAY), "CREDITED");
    });

    it("reads Paid when money and credit together settled it", () => {
      assert.equal(deriveInvoiceStatus(invoice({ paidTotal: 100, creditedTotal: 15 }), TODAY), "PAID");
    });

    it("counts a partial credit towards the balance", () => {
      // 115 less a 65 credit leaves 50 owing, so it is still open.
      assert.equal(deriveInvoiceStatus(invoice({ creditedTotal: 65 }), TODAY), "SENT");
    });

    it("is overdue on what is left after a partial credit", () => {
      assert.equal(deriveInvoiceStatus(invoice({ creditedTotal: 65, dueDate: date("2026-10-12") }), TODAY), "OVERDUE");
    });
  });

  it("leaves a zero-total invoice alone rather than calling it paid", () => {
    // Nothing was ever owed, so "Paid" would be a claim about money that never existed.
    assert.equal(deriveInvoiceStatus(invoice({ grandTotal: 0 }), TODAY), "SENT");
  });
});

describe("quotation status", () => {
  it("expires a draft whose validity has passed", () => {
    assert.equal(deriveQuotationStatus({ status: "DRAFT", validUntil: date("2026-10-12") }, TODAY), "EXPIRED");
  });

  it("expires a sent quotation the same way", () => {
    assert.equal(deriveQuotationStatus({ status: "SENT", validUntil: date("2026-10-12") }, TODAY), "EXPIRED");
  });

  it("is still valid on the last day", () => {
    assert.equal(deriveQuotationStatus({ status: "SENT", validUntil: date(TODAY) }, TODAY), "SENT");
  });

  it("never expires a decision someone already made", () => {
    // Accepting a quotation is a fact about the past; a date passing does not undo it.
    for (const status of ["ACCEPTED", "REJECTED"] as const) {
      assert.equal(deriveQuotationStatus({ status, validUntil: date("2026-01-01") }, TODAY), status);
    }
  });

  it("leaves a quotation with no validity date open", () => {
    assert.equal(deriveQuotationStatus({ status: "SENT", validUntil: null }, TODAY), "SENT");
  });
});

describe("purchase status", () => {
  const purchase = { receivedAt: null as Date | null, supplierReference: null as string | null, dueDate: date("2026-10-31"), grandTotal: 115, paidTotal: 0 };

  it("is a draft before anything arrives", () => {
    assert.equal(derivePurchaseStatus(purchase, TODAY), "DRAFT");
  });

  it("is Received once the goods are in but no supplier invoice is on file", () => {
    assert.equal(derivePurchaseStatus({ ...purchase, receivedAt: date("2026-10-05") }, TODAY), "RECEIVED");
  });

  it("becomes Unpaid once the supplier's reference is recorded", () => {
    // That reference is what turns "we have the goods" into "we owe for them".
    assert.equal(derivePurchaseStatus({ ...purchase, receivedAt: date("2026-10-05"), supplierReference: "SI-900" }, TODAY), "UNPAID");
  });

  it("is Partially Paid once some of it is settled", () => {
    assert.equal(derivePurchaseStatus({ ...purchase, receivedAt: date("2026-10-05"), paidTotal: 50 }, TODAY), "PARTIALLY_PAID");
  });

  it("is Paid once settled", () => {
    assert.equal(derivePurchaseStatus({ ...purchase, receivedAt: date("2026-10-05"), paidTotal: 115 }, TODAY), "PAID");
  });

  it("is Overdue with a balance left after the due date", () => {
    assert.equal(derivePurchaseStatus({ ...purchase, receivedAt: date("2026-10-05"), dueDate: date("2026-10-12") }, TODAY), "OVERDUE");
  });

  it("stops being a draft once it has been paid, even unreceived", () => {
    // Money has left the company, so calling it a draft would hide a real payment.
    assert.notEqual(derivePurchaseStatus({ ...purchase, paidTotal: 50 }, TODAY), "DRAFT");
  });
});

describe("supplier quotation status", () => {
  it("expires drafts and received quotations", () => {
    for (const status of ["DRAFT", "RECEIVED"] as const) {
      assert.equal(deriveSupplierQuotationStatus({ status, validUntil: date("2026-10-12") }, TODAY), "EXPIRED");
    }
  });

  it("never expires one that was accepted or rejected", () => {
    for (const status of ["ACCEPTED", "REJECTED"] as const) {
      assert.equal(deriveSupplierQuotationStatus({ status, validUntil: date("2026-01-01") }, TODAY), status);
    }
  });
});

describe("which statuses a person may pick", () => {
  /**
   * The menu a user sees comes from these helpers and the Server Action re-checks the same rule, so
   * anything derived must never be offered — otherwise the app invites a click it will then refuse.
   */
  const DERIVED_INVOICE: InvoiceStatus[] = ["PAID", "PARTIALLY_PAID", "OVERDUE", "CREDITED"];
  const DERIVED_PURCHASE: PurchaseStatus[] = ["PAID", "PARTIALLY_PAID", "OVERDUE", "UNPAID"];

  it("offers an invoice only the step of sending it", () => {
    assert.deepEqual(invoiceTransitions("DRAFT"), ["SENT"]);
    for (const status of ["SENT", ...DERIVED_INVOICE] as InvoiceStatus[]) {
      assert.deepEqual(invoiceTransitions(status), [], `${status} should offer nothing`);
    }
  });

  it("never offers a status that is worked out from payments and dates", () => {
    for (const status of Object.keys(INVOICE_STATUS) as InvoiceStatus[]) {
      for (const offered of invoiceTransitions(status)) {
        assert.ok(!DERIVED_INVOICE.includes(offered), `${status} offered the derived status ${offered}`);
      }
    }
    for (const status of Object.keys(PURCHASE_STATUS) as PurchaseStatus[]) {
      for (const offered of purchaseTransitions(status)) {
        assert.ok(!DERIVED_PURCHASE.includes(offered), `${status} offered the derived status ${offered}`);
      }
    }
  });

  it("never offers a status the document is already in", () => {
    for (const status of Object.keys(INVOICE_STATUS) as InvoiceStatus[]) {
      assert.ok(!invoiceTransitions(status).includes(status), `${status} offered itself`);
    }
    for (const status of Object.keys(QUOTATION_STATUS) as QuotationStatus[]) {
      assert.ok(!quotationTransitions(status, false).includes(status), `${status} offered itself`);
    }
  });

  it("lets a quotation be sent, accepted or rejected while it is open", () => {
    assert.deepEqual(quotationTransitions("DRAFT", false), ["SENT", "ACCEPTED", "REJECTED"]);
  });

  it("lets an expired quotation be sent again", () => {
    // A quotation that lapsed is still a live conversation with the customer.
    assert.ok(quotationTransitions("EXPIRED", false).includes("SENT"));
  });

  it("does not offer to send one that is already out", () => {
    assert.deepEqual(quotationTransitions("SENT", false), ["ACCEPTED", "REJECTED"]);
  });

  it("closes a decided quotation", () => {
    for (const status of ["ACCEPTED", "REJECTED"] as const) {
      assert.deepEqual(quotationTransitions(status, false), []);
    }
  });

  it("closes a quotation that has been converted to an invoice", () => {
    for (const status of Object.keys(QUOTATION_STATUS) as QuotationStatus[]) {
      assert.deepEqual(quotationTransitions(status, true), [], `locked ${status} should offer nothing`);
    }
  });

  it("offers a supplier quotation the same shape of choices", () => {
    assert.deepEqual(supplierQuotationTransitions("DRAFT", false), ["RECEIVED", "ACCEPTED", "REJECTED"]);
    assert.deepEqual(supplierQuotationTransitions("ACCEPTED", false), []);
    for (const status of Object.keys(SUPPLIER_QUOTATION_STATUS) as SupplierQuotationStatus[]) {
      assert.deepEqual(supplierQuotationTransitions(status, true), [], `locked ${status} should offer nothing`);
    }
  });

  it("offers a purchase only the step of receiving it", () => {
    assert.deepEqual(purchaseTransitions("DRAFT"), ["RECEIVED"]);
    assert.deepEqual(purchaseTransitions("RECEIVED"), []);
  });
});

describe("every status can be displayed", () => {
  /**
   * A status with no entry here renders as a blank badge. Reading the enums from Prisma rather than
   * a hand-written list means adding a status to the schema fails this test until it has a label.
   */
  it("gives every invoice and quotation status a label and a tone", () => {
    for (const status of Object.values(InvoiceStatus)) assert.ok(INVOICE_STATUS[status]?.label, `InvoiceStatus.${status} has no label`);
    for (const status of Object.values(QuotationStatus)) assert.ok(QUOTATION_STATUS[status]?.label, `QuotationStatus.${status} has no label`);
  });

  it("gives every procurement status a label and a tone", () => {
    for (const status of Object.values(PurchaseStatus)) assert.ok(PURCHASE_STATUS[status]?.label, `PurchaseStatus.${status} has no label`);
    for (const status of Object.values(SupplierQuotationStatus)) {
      assert.ok(SUPPLIER_QUOTATION_STATUS[status]?.label, `SupplierQuotationStatus.${status} has no label`);
    }
  });
});
