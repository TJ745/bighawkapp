"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/form-field";
import { updateOwnProfile } from "@/actions/profile";
import { getInitials } from "@/lib/format";
import { applyFieldErrors } from "@/lib/form-errors";

const formSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  phone: z.string().trim().max(100).optional(),
});
type FormValues = z.infer<typeof formSchema>;

type Props = { user: { name: string; email: string; phone: string | null; image: string | null } };

export function ProfileDetailsForm({ user }: Props) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  // Bumping the key remounts the file input, which clears the chosen file without reading the ref.
  const [fileKey, setFileKey] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: user.name, phone: user.phone ?? "" },
  });
  const { errors, isSubmitting } = form.formState;
  const watchedName = useWatch({ control: form.control, name: "name" });

  // Object URL for previewing a newly selected photo; revoked when it changes or on unmount.
  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function onSubmit(values: FormValues) {
    setFormError(null);
    const formData = new FormData();
    formData.set("name", values.name);
    formData.set("phone", values.phone ?? "");
    if (photo) formData.set("photo", photo);
    if (removePhoto) formData.set("removePhoto", "true");

    const result = await updateOwnProfile(formData);
    if (!result.success) {
      applyFieldErrors(form, result.fieldErrors);
      setFormError(result.error);
      return;
    }
    toast.success("Profile updated");
    setPhoto(null);
    setRemovePhoto(false);
    setFileKey((key) => key + 1);
    form.reset({ name: values.name, phone: values.phone ?? "" });
    router.refresh();
  }

  const currentImage = removePhoto ? null : (preview ?? user.image ?? null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Personal details</CardTitle>
        <CardDescription>How your name and photo appear across the app.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
          {formError ? (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex items-center gap-4">
            <Avatar className="size-16">
              <AvatarImage src={currentImage ?? undefined} alt="" />
              <AvatarFallback className="text-lg">{getInitials(watchedName)}</AvatarFallback>
            </Avatar>
            <div className="flex flex-wrap items-center gap-2">
              <input
                key={fileKey}
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  setPhoto(e.target.files?.[0] ?? null);
                  setRemovePhoto(false);
                }}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                {currentImage ? "Change photo" : "Upload photo"}
              </Button>
              {currentImage ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setPhoto(null);
                    setRemovePhoto(true);
                    setFileKey((key) => key + 1);
                  }}
                >
                  <X />
                  Remove
                </Button>
              ) : null}
              <p className="w-full text-xs text-muted-foreground">JPG, PNG or WEBP, up to 2 MB.</p>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="Name" htmlFor="profile-name" required error={errors.name?.message}>
              <Input id="profile-name" autoComplete="name" {...form.register("name")} />
            </FormField>
            <FormField label="Phone" htmlFor="profile-phone" error={errors.phone?.message}>
              <Input id="profile-phone" type="tel" autoComplete="tel" {...form.register("phone")} />
            </FormField>
            <FormField
              label="Email"
              htmlFor="profile-email"
              description="Your administrator manages the email address used to sign in."
              className="sm:col-span-2"
            >
              <Input id="profile-email" value={user.email} readOnly disabled />
            </FormField>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : null}
              Save changes
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
