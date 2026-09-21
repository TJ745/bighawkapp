import type { PartyKind } from "@/lib/data/parties";

// Client-safe labels/paths per party kind so one set of components serves customers and suppliers.
export const PARTY_CONFIG: Record<
  PartyKind,
  {
    singular: string;
    plural: string;
    basePath: string;
    totalLabel: string;
    quotationsTab: string;
    salesTab: string;
  }
> = {
  customer: {
    singular: "Customer",
    plural: "Customers",
    basePath: "/customers",
    totalLabel: "Total Sales",
    quotationsTab: "Quotations",
    salesTab: "Invoices",
  },
  supplier: {
    singular: "Supplier",
    plural: "Suppliers",
    basePath: "/procurement/suppliers",
    totalLabel: "Total Purchases",
    quotationsTab: "Supplier Quotations",
    salesTab: "Purchases",
  },
};

export const PARTY_FILTERS = [
  { value: "all", label: "All" },
  { value: "company", label: "Company" },
  { value: "individual", label: "Individual" },
];
