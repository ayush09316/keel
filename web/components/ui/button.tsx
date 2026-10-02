import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type Size = "xs" | "sm" | "md" | "icon" | "icon-sm";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg shadow-card hover:brightness-110",
  secondary: "bg-muted text-fg hover:bg-border-strong/60",
  outline: "border border-border bg-surface text-fg shadow-card hover:border-border-strong hover:bg-surface-2",
  ghost: "text-fg-muted hover:bg-muted hover:text-fg",
  danger: "bg-bad text-white hover:brightness-110",
};

const sizes: Record<Size, string> = {
  xs: "h-7 px-2 text-xs gap-1.5 [&_svg]:size-3.5",
  sm: "h-8 px-3 text-[13px] gap-1.5 pointer-coarse:h-10",
  md: "h-9 px-4 text-sm gap-2 pointer-coarse:h-11",
  icon: "size-9 pointer-coarse:size-11",
  "icon-sm": "size-8 pointer-coarse:size-10",
};

const base =
  "ap-press inline-flex shrink-0 items-center justify-center rounded-lg font-medium whitespace-nowrap select-none disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "outline", size = "sm", type = "button", ...props },
  ref,
) {
  return <button ref={ref} type={type} className={cn(base, variants[variant], sizes[size], className)} {...props} />;
});

export function buttonClass(variant: Variant = "outline", size: Size = "sm", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}
