"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useFormat } from "@/components/providers/format-provider";
import type { DocumentItem, DocumentAttachment } from "@/lib/data/sales";
import { AttachmentList } from "./attachment-list";
import { DOCUMENT_KIND, type DocumentKind } from "./document-kinds";
import { TotalsSummary } from "./totals-summary";

export type DocumentParty = {
  id: string;
  name: string;
  contactPerson: string | null;
  email: string | null;
  phone: string;
  address: string | null;
  vatNumber: string | null;
};

type DocumentViewProps = {
  kind: DocumentKind;
  documentId: string;
  party: DocumentParty;
  meta: { label: string; value: React.ReactNode }[];
  items: DocumentItem[];
  totals: { subtotal: number; discountTotal: number; vatTotal: number; grandTotal: number };
  extraTotals?: { label: string; value: number; emphasis?: boolean; negative?: boolean }[];
  terms?: string | null;
  internalNotes?: string | null;
  attachments: DocumentAttachment[];
  canEdit: boolean;
  showVat: boolean;
};

// Read-only rendering of a commercial document: party, meta, items, totals, terms/notes, attachments.
export function DocumentView({ kind, documentId, party, meta, items, totals, extraTotals, terms, internalNotes, attachments, canEdit, showVat }: DocumentViewProps) {
  const format = useFormat();
  const config = DOCUMENT_KIND[kind];
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">{config.partyLabel}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <Link href={`${config.partyBasePath}/${party.id}`} className="font-medium hover:underline">
              {party.name}
            </Link>
            {party.contactPerson ? <p>{party.contactPerson}</p> : null}
            {party.address ? <p className="text-muted-foreground">{party.address}</p> : null}
            <p className="text-muted-foreground">{[party.phone, party.email].filter(Boolean).join(" · ")}</p>
            {party.vatNumber ? <p className="text-muted-foreground">VAT {party.vatNumber}</p> : null}
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {meta.map((m) => (
                <div key={m.label} className="contents">
                  <dt className="text-muted-foreground">{m.label}</dt>
                  <dd className="font-medium">{m.value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Description</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit price</TableHead>
                  <TableHead className="text-right">Disc.</TableHead>
                  {showVat ? <TableHead className="text-right">VAT</TableHead> : null}
                  <TableHead className="pr-6 text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="pl-6 whitespace-pre-wrap">{item.description}</TableCell>
                    <TableCell className="text-right tabular-nums">{format.number(item.quantity)}</TableCell>
                    <TableCell className="text-right tabular-nums">{format.number(item.unitPrice)}</TableCell>
                    <TableCell className="text-right tabular-nums">{item.discountPercent > 0 ? `${format.number(item.discountPercent)}%` : "—"}</TableCell>
                    {showVat ? <TableCell className="text-right tabular-nums">{item.vatRate > 0 ? `${format.number(item.vatRate)}%` : "—"}</TableCell> : null}
                    <TableCell className="pr-6 text-right font-medium tabular-nums">{format.number(item.lineTotal)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="px-6 pb-2">
            <TotalsSummary totals={totals} extra={extraTotals} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {config.hasTerms ? (
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">Terms & conditions</CardTitle>
            </CardHeader>
            <CardContent className="text-sm whitespace-pre-wrap">{terms || <span className="text-muted-foreground">None.</span>}</CardContent>
          </Card>
        ) : null}
        {config.hasInternalNotes ? (
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">Internal notes</CardTitle>
            </CardHeader>
            <CardContent className="text-sm whitespace-pre-wrap">
              {internalNotes || <span className="text-muted-foreground">None. Only visible to your team.</span>}
            </CardContent>
          </Card>
        ) : null}
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Attachments</CardTitle>
          </CardHeader>
          <CardContent>
            <AttachmentList kind={kind} documentId={documentId} attachments={attachments} canEdit={canEdit} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
