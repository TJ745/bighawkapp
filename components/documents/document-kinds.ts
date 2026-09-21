// Client-safe configuration shared by the document form/view for all four commercial documents.
export type DocumentKind = "quotation" | "invoice" | "supplier-quotation" | "purchase";

export const DOCUMENT_KIND: Record<
  DocumentKind,
  {
    label: string;
    basePath: string;
    pdfPath: string;
    partyKind: "customer" | "supplier";
    partyLabel: string;
    partyBasePath: string;
    hasValidity: boolean;
    hasPaymentTerms: boolean;
    hasDeposit: boolean;
    hasTerms: boolean; // customer-facing terms & conditions
    hasInternalNotes: boolean;
    hasSupplierReference: boolean;
    hasLinks: boolean; // optional customer/project links (purchases)
  }
> = {
  quotation: {
    label: "Quotation",
    basePath: "/sales/quotations",
    pdfPath: "/api/sales/quotations",
    partyKind: "customer",
    partyLabel: "Customer",
    partyBasePath: "/customers",
    hasValidity: true,
    hasPaymentTerms: false,
    hasDeposit: false,
    hasTerms: true,
    hasInternalNotes: false,
    hasSupplierReference: false,
    hasLinks: false,
  },
  invoice: {
    label: "Invoice",
    basePath: "/sales/invoices",
    pdfPath: "/api/sales/invoices",
    partyKind: "customer",
    partyLabel: "Customer",
    partyBasePath: "/customers",
    hasValidity: false,
    hasPaymentTerms: true,
    hasDeposit: true,
    hasTerms: true,
    hasInternalNotes: true,
    hasSupplierReference: false,
    hasLinks: false,
  },
  "supplier-quotation": {
    label: "Supplier Quotation",
    basePath: "/procurement/supplier-quotations",
    pdfPath: "/api/procurement/supplier-quotations",
    partyKind: "supplier",
    partyLabel: "Supplier",
    partyBasePath: "/procurement/suppliers",
    hasValidity: true,
    hasPaymentTerms: false,
    hasDeposit: false,
    hasTerms: false,
    hasInternalNotes: true,
    hasSupplierReference: true,
    hasLinks: false,
  },
  purchase: {
    label: "Purchase",
    basePath: "/procurement/purchases",
    pdfPath: "/api/procurement/purchases",
    partyKind: "supplier",
    partyLabel: "Supplier",
    partyBasePath: "/procurement/suppliers",
    hasValidity: false,
    hasPaymentTerms: true,
    hasDeposit: false,
    hasTerms: false,
    hasInternalNotes: true,
    hasSupplierReference: true,
    hasLinks: true,
  },
};
