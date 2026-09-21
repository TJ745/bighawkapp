import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

// Not-found inside the app shell (e.g. a customer or invoice that doesn't exist).
export default function AppNotFound() {
  return (
    <EmptyState
      icon={FileQuestion}
      title="Not found"
      description="This record doesn't exist or may have been removed."
      action={
        <Button asChild variant="outline">
          <Link href="/dashboard">Go to Dashboard</Link>
        </Button>
      }
    />
  );
}
