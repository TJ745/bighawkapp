import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardFooter } from "@/components/ui/card";

// Consistent "Save changes" footer for settings cards.
export function SettingsFormFooter({ saving, disabled }: { saving: boolean; disabled?: boolean }) {
  return (
    <CardFooter className="justify-end border-t">
      <Button type="submit" disabled={saving || disabled}>
        {saving ? <Loader2 className="animate-spin" /> : null}
        Save changes
      </Button>
    </CardFooter>
  );
}
