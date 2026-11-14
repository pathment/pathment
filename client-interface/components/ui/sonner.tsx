"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      // Every toast can be dismissed at once; nobody should have to wait one out.
      closeButton
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--success-bg": "#f0fdf4",
          "--success-text": "#14532d",
          "--success-border": "#86efac",
          "--error-bg": "#fff1f2",
          "--error-text": "#881337",
          "--error-border": "#fda4af",
          "--warning-bg": "#fffbeb",
          "--warning-text": "#78350f",
          "--warning-border": "#fcd34d",
          "--info-bg": "#eff6ff",
          "--info-text": "#1e3a5f",
          "--info-border": "#93c5fd",
          "--description-color": "#374151",
          // Sonner puts the close button on the top-left corner; ours sits
          // top-right, where people look for it.
          "--toast-close-button-start": "unset",
          "--toast-close-button-end": "0",
          "--toast-close-button-transform": "translate(35%, -35%)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          title: "font-semibold text-sm",
          description: "toast-description text-sm font-medium !opacity-100 !text-inherit",
          error: "!text-[#881337]",
          success: "!text-[#14532d]",
          closeButton: "!bg-card !text-slate-500 hover:!text-slate-900 !border-slate-200 dark:!border-slate-700",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
