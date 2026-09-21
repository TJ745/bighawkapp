import type { Metadata } from "next";
import { PartyNewPage } from "@/components/parties/party-pages";

export const metadata: Metadata = { title: "New Customer" };

export default function Page() {
  return <PartyNewPage kind="customer" />;
}
