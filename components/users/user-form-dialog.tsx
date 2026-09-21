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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { FormField } from "@/components/shared/form-field";
import { createUser, updateUser } from "@/actions/users";
import type { RoleOption } from "@/lib/data/users";
import { getInitials } from "@/lib/format";
import { applyFieldErrors } from "@/lib/form-errors";
import { describePasswordPolicy, passwordSchema, type PasswordPolicy } from "@/lib/validation/users";

// Client-side mirror of the server schema (files and the optional password are handled here).
const formSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.email("Enter a valid email address").trim(),
  phone: z.string().trim().max(100).optional(),
  roleId: z.string().min(1, "Role is required"),
  password: z.string(),
  isActive: z.boolean(),
});
type FormValues = z.infer<typeof formSchema>;

export type UserFormUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  image: string | null;
  roleId: string | null;
  isActive: boolean;
  isSuperAdmin: boolean;
};

type UserFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: RoleOption[];
  passwordPolicy: PasswordPolicy;
  user?: UserFormUser;
};

export function UserFormDialog({ open, onOpenChange, roles, passwordPolicy, user }: UserFormDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const isEdit = Boolean(user);

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit user" : "New user"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update this person's details and access." : "Create an account for a team member."}
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so every open starts with fresh form state. */}
        {open ? (
          <UserForm
            roles={roles}
            passwordPolicy={passwordPolicy}
            user={user}
            onClose={() => onOpenChange(false)}
            onSubmittingChange={setSubmitting}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

type UserFormProps = {
  roles: RoleOption[];
  passwordPolicy: PasswordPolicy;
  user?: UserFormUser;
  onClose: () => void;
  onSubmittingChange: (submitting: boolean) => void;
};

function UserForm({ roles, passwordPolicy, user, onClose, onSubmittingChange }: UserFormProps) {
  const router = useRouter();
  const isEdit = Boolean(user);
  const lockedAccount = Boolean(user?.isSuperAdmin);
  const [formError, setFormError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(
      formSchema.superRefine((values, ctx) => {
        if (!isEdit || values.password) {
          const result = passwordSchema(passwordPolicy).safeParse(values.password);
          if (!result.success) {
            ctx.addIssue({ code: "custom", path: ["password"], message: result.error.issues[0]?.message ?? "Invalid password" });
          }
        }
      }),
    ),
    defaultValues: {
      name: user?.name ?? "",
      email: user?.email ?? "",
      phone: user?.phone ?? "",
      roleId: user?.roleId ?? (user?.isSuperAdmin ? "super-admin" : ""),
      password: "",
      isActive: user?.isActive ?? true,
    },
  });
  const { errors, isSubmitting } = form.formState;
  const [watchedName, watchedRoleId, watchedActive] = useWatch({ control: form.control, name: ["name", "roleId", "isActive"] });

  // Object URL for previewing a newly selected photo; revoked when it changes or on unmount.
  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function onSubmit(values: FormValues) {
    setFormError(null);
    onSubmittingChange(true);
    try {
      const formData = new FormData();
      formData.set("name", values.name);
      formData.set("email", values.email);
      formData.set("phone", values.phone ?? "");
      formData.set("roleId", values.roleId);
      formData.set("password", values.password);
      formData.set("isActive", String(values.isActive));
      if (photo) formData.set("photo", photo);
      if (removePhoto) formData.set("removePhoto", "true");

      const result = user ? await updateUser(user.id, formData) : await createUser(formData);
      if (!result.success) {
        applyFieldErrors(form, result.fieldErrors);
        setFormError(result.error);
        return;
      }
      toast.success(user ? "User updated" : "User created");
      onClose();
      router.refresh();
    } finally {
      onSubmittingChange(false);
    }
  }

  const currentImage = removePhoto ? null : (preview ?? user?.image ?? null);

  return (
    <>
    <form id="user-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
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
                if (fileInputRef.current) fileInputRef.current.value = "";
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
        <FormField label="Name" htmlFor="user-name" required error={errors.name?.message}>
          <Input id="user-name" autoComplete="off" {...form.register("name")} />
        </FormField>
        <FormField label="Email" htmlFor="user-email" required error={errors.email?.message}>
          <Input id="user-email" type="email" autoComplete="off" {...form.register("email")} />
        </FormField>
        <FormField label="Phone" htmlFor="user-phone" error={errors.phone?.message}>
          <Input id="user-phone" type="tel" autoComplete="off" {...form.register("phone")} />
        </FormField>
        {!lockedAccount ? (
          <FormField label="Role" htmlFor="user-role" required error={errors.roleId?.message}>
            <Select value={watchedRoleId} onValueChange={(v) => form.setValue("roleId", v, { shouldValidate: true })}>
              <SelectTrigger id="user-role" className="w-full">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        ) : null}
        <FormField
          label={isEdit ? "New password" : "Password"}
          htmlFor="user-password"
          required={!isEdit}
          description={isEdit ? `Leave blank to keep the current password. ${describePasswordPolicy(passwordPolicy)}` : describePasswordPolicy(passwordPolicy)}
          error={errors.password?.message}
          className="sm:col-span-2"
        >
          <Input id="user-password" type="password" autoComplete="new-password" {...form.register("password")} />
        </FormField>
      </div>

      {!lockedAccount ? (
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Active</p>
            <p className="text-xs text-muted-foreground">Inactive users cannot sign in.</p>
          </div>
          <Switch checked={watchedActive} onCheckedChange={(v) => form.setValue("isActive", v)} />
        </div>
      ) : null}

    </form>
    <DialogFooter>
      <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
        Cancel
      </Button>
      <Button type="submit" form="user-form" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="animate-spin" /> : null}
        {isEdit ? "Save changes" : "Create user"}
      </Button>
    </DialogFooter>
    </>
  );
}
