import { LinkTabs } from "@/components/shared/link-tabs";
import { PageHeader } from "@/components/shared/page-header";

export function UsersPageHeader() {
  return (
    <>
      <PageHeader title="Users & Roles" description="People who can use the system and what they can access." />
      <LinkTabs
        tabs={[
          { label: "Users", href: "/users", exact: true },
          { label: "Roles", href: "/users/roles" },
        ]}
      />
    </>
  );
}
