"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/shared/form-field";
import type { ActionResult } from "@/lib/actions";
import { applyFieldErrors } from "@/lib/form-errors";
import { sendDocumentSchema, type SendDocumentFormValues, type SendDocumentValues } from "@/lib/validation/sales";

type Draft = { to: string; subject: string; body: string };

type SendDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  attachmentName: string;
  prepare: () => Promise<ActionResult<Draft>>;
  send: (values: SendDocumentValues) => Promise<ActionResult>;
  emailConfigured: boolean;
};

// Email dialog for quotations/invoices/reminders: template-prefilled, editable, PDF attached automatically.
export function SendDialog({ open, onOpenChange, title, attachmentName, prepare, send, emailConfigured }: SendDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Review the message before sending. The PDF is attached automatically.</DialogDescription>
        </DialogHeader>
        {open ? <SendForm attachmentName={attachmentName} prepare={prepare} send={send} emailConfigured={emailConfigured} onClose={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function SendForm({
  attachmentName,
  prepare,
  send,
  emailConfigured,
  onClose,
}: Omit<SendDialogProps, "open" | "onOpenChange" | "title"> & { onClose: () => void }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    prepare().then((result) => {
      if (cancelled) return;
      if (result.success) setDraft(result.data);
      else setLoadError(result.error);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loadError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{loadError}</AlertDescription>
      </Alert>
    );
  }
  if (!draft) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  return (
    <SendFields
      draft={draft}
      attachmentName={attachmentName}
      emailConfigured={emailConfigured}
      formError={formError}
      onClose={onClose}
      onSubmit={async (values) => {
        setFormError(null);
        const result = await send(values);
        if (!result.success) {
          setFormError(result.error);
          return result;
        }
        toast.success("Email sent");
        onClose();
        router.refresh();
        return result;
      }}
    />
  );
}

function SendFields({
  draft,
  attachmentName,
  emailConfigured,
  formError,
  onClose,
  onSubmit,
}: {
  draft: Draft;
  attachmentName: string;
  emailConfigured: boolean;
  formError: string | null;
  onClose: () => void;
  onSubmit: (values: SendDocumentValues) => Promise<ActionResult>;
}) {
  const form = useForm<SendDocumentFormValues, unknown, SendDocumentValues>({
    resolver: zodResolver(sendDocumentSchema),
    defaultValues: draft,
  });
  const { errors, isSubmitting } = form.formState;

  return (
    <>
    <form
      id="send-document-form"
      onSubmit={form.handleSubmit(async (values) => {
        const result = await onSubmit(values);
        if (!result.success) applyFieldErrors(form, result.fieldErrors);
      })}
      className="space-y-4"
      noValidate
    >
      {!emailConfigured ? (
        <Alert>
          <AlertDescription>Email sending is not configured yet (SMTP). You can still download or print the PDF.</AlertDescription>
        </Alert>
      ) : null}
      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}
      <FormField label="To" htmlFor="send-to" required error={errors.to?.message}>
        <Input id="send-to" type="email" {...form.register("to")} />
      </FormField>
      <FormField label="Subject" htmlFor="send-subject" required error={errors.subject?.message}>
        <Input id="send-subject" {...form.register("subject")} />
      </FormField>
      <FormField label="Message" htmlFor="send-body" required error={errors.body?.message}>
        <Textarea id="send-body" rows={10} {...form.register("body")} />
      </FormField>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Paperclip className="size-3.5" />
        {attachmentName}
      </p>
    </form>
    <DialogFooter>
      <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
        Cancel
      </Button>
      <Button type="submit" form="send-document-form" disabled={isSubmitting || !emailConfigured}>
        {isSubmitting ? <Loader2 className="animate-spin" /> : null}
        Send email
      </Button>
    </DialogFooter>
    </>
  );
}
