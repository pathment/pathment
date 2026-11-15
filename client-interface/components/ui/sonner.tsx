"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      // Top-right: at the bottom they sat over drawer footers and the very
      // buttons someone was about to press.
      position="top-right"
      offset={16}
      mobileOffset={12}
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
          // Sonner hangs a tiny close button off the top-left corner. Ours sits
          // inside the toast, top-right, where people reach for it.
          "--toast-close-button-start": "unset",
          "--toast-close-button-end": "0.5rem",
          "--toast-close-button-transform": "none",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          title: "font-semibold text-sm",
          description: "toast-description text-sm font-medium !opacity-100 !text-inherit",
          error: "!text-[#881337]",
          success: "!text-[#14532d]",
          // Room on the right for the close button, so text never runs under it.
          toast: "!pr-11",
          // A real target (28px), in the toast's own colour so it belongs to
          // a success or an error alike, with a hover and a visible focus ring.
          closeButton:
            "!top-2.5 !h-[26px] !w-[26px] !rounded-full !border-0 !bg-current/[0.09] !text-current opacity-75 " +
            "transition-[opacity,background-color,transform,box-shadow] duration-200 ease-out " +
            "hover:!bg-current/[0.17] hover:opacity-100 hover:shadow-sm active:scale-90 " +
            "focus-visible:opacity-100 focus-visible:!outline-none focus-visible:!ring-2 focus-visible:!ring-current/40 focus-visible:!ring-offset-1 " +
            // The cross turns a quarter on hover: a small, clear "yes, this closes it".
            "[&>svg]:!h-3 [&>svg]:!w-3 [&>svg]:!stroke-[2.75] [&>svg]:transition-transform [&>svg]:duration-200 hover:[&>svg]:rotate-90",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
