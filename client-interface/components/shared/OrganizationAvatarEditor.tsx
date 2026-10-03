"use client";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Avatar } from "./Avatar";
import { organizationsApi } from "@/lib/services/organizations-api";
import { extractApiErrorMessage } from "@/lib/utils/api-error";

export function OrganizationAvatarEditor({
  name,
  logoUrl,
  disabled = false,
  onChanged,
}: {
  name: string;
  logoUrl?: string | null;
  disabled?: boolean;
  onChanged: (logoUrl: string | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file?: File) {
    if (!file) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      toast.error("Choose a PNG, JPG or WebP up to 5 MB");
      return;
    }
    setBusy(true);
    try {
      const organization = await organizationsApi.uploadLogo(file);
      onChanged(organization.logoUrl);
      toast.success("Organization logo updated");
    } catch (error) {
      toast.error(extractApiErrorMessage(error, "Could not upload organization logo"));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const organization = await organizationsApi.removeLogo();
      onChanged(organization.logoUrl);
    } catch (error) {
      toast.error(extractApiErrorMessage(error, "Could not remove organization logo"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-muted/30 p-4">
      <Avatar name={name} src={logoUrl} size="lg" />
      <div className="flex-1">
        <p className="text-sm font-medium">
          Organization logo{" "}
          <span className="font-normal text-muted-foreground">· optional</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          PNG, JPG or WebP · up to 5 MB. Initials appear when no logo is set.
        </p>
        <div className="mt-2 flex gap-3">
          <button
            disabled={disabled || busy}
            onClick={() => input.current?.click()}
            className="text-sm font-medium text-brand-700 disabled:opacity-50"
          >
            {busy ? "Updating…" : logoUrl ? "Change logo" : "Add logo"}
          </button>
          {logoUrl && (
            <button
              disabled={disabled || busy}
              onClick={remove}
              className="text-sm text-muted-foreground disabled:opacity-50"
            >
              Remove
            </button>
          )}
        </div>
      </div>
      <input
        ref={input}
        aria-label="Upload organization logo"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        disabled={disabled || busy}
        onChange={(event) => upload(event.target.files?.[0])}
      />
    </div>
  );
}