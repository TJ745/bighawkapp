import type { Metadata } from "next";
import { PartyEditPage } from "@/components/parties/party-pages";

export const metadata: Metadata = { title: "Edit Customer" };

export default async function Page({ params }: PageProps<"/customers/[id]/edit">) {
  const { id } = await params;
  return <PartyEditPage kind="customer" id={id} />;
}
