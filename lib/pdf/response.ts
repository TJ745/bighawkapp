import "server-only";
import { NextResponse } from "next/server";

/** Streams a PDF inline (preview/print) or as a download when ?download=1. */
export function pdfResponse(pdf: Buffer, filename: string, download: boolean) {
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(pdf.byteLength),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
