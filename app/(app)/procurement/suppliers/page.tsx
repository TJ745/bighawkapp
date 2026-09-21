import type { Metadata } from "next";
import { PartyListPage } from "@/components/parties/party-pages";

export const metadata: Metadata = { title: "Suppliers" };

export default async function Page({ searchParams }: PageProps<"/procurement/suppliers">) {
  return <PartyListPage kind="supplier" searchParams={await searchParams} />;
}
