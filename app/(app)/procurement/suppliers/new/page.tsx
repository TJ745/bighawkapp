import type { Metadata } from "next";
import { PartyNewPage } from "@/components/parties/party-pages";

export const metadata: Metadata = { title: "New Supplier" };

export default function Page() {
  return <PartyNewPage kind="supplier" />;
}
