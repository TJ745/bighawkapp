import type { Metadata } from "next";
import { PartyDetailPage } from "@/components/parties/party-pages";

export const metadata: Metadata = { title: "Customer" };

export default async function Page({ params, searchParams }: PageProps<"/customers/[id]">) {
  const { id } = await params;
  return <PartyDetailPage kind="customer" id={id} searchParams={await searchParams} />;
}
