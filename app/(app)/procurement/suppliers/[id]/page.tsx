import type { Metadata } from "next";
import { PartyDetailPage } from "@/components/parties/party-pages";

export const metadata: Metadata = { title: "Supplier" };

export default async function Page({ params, searchParams }: PageProps<"/procurement/suppliers/[id]">) {
  const { id } = await params;
  return <PartyDetailPage kind="supplier" id={id} searchParams={await searchParams} />;
}
