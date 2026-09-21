import type { Metadata } from "next";
import { PartyEditPage } from "@/components/parties/party-pages";

export const metadata: Metadata = { title: "Edit Supplier" };

export default async function Page({ params }: PageProps<"/procurement/suppliers/[id]/edit">) {
  const { id } = await params;
  return <PartyEditPage kind="supplier" id={id} />;
}
