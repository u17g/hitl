import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const sectionVariants = cva("", {
  variants: {
    variant: {
      default: "py-24 md:py-32",
      muted: "border-y border-border bg-muted/20 py-24 md:py-32",
      hero: "relative overflow-hidden",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export function Section({
  className,
  variant,
  ...props
}: ComponentProps<"section"> & VariantProps<typeof sectionVariants>) {
  return (
    <section className={cn(sectionVariants({ variant }), className)} {...props} />
  );
}

const containerSizeVariants = cva("mx-auto px-4", {
  variants: {
    size: {
      "6xl": "max-w-6xl",
      "4xl": "max-w-4xl",
      "3xl": "max-w-3xl",
      "2xl": "max-w-2xl",
      xl: "max-w-xl",
    },
  },
  defaultVariants: {
    size: "4xl",
  },
});

export function SectionContainer({
  className,
  size,
  ...props
}: ComponentProps<"div"> & VariantProps<typeof containerSizeVariants>) {
  return (
    <div
      className={cn(containerSizeVariants({ size }), className)}
      {...props}
    />
  );
}

export function SectionHeader({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cn("mx-auto", className)}
      {...props}
    />
  );
}

export function SectionLabel({
  className,
  ...props
}: ComponentProps<"p">) {
  return (
    <p
      className={cn("parallel-section-label mb-4", className)}
      {...props}
    />
  );
}

export function SectionTitle({
  className,
  ...props
}: ComponentProps<"h2">) {
  return (
    <h2
      className={cn(
        "font-display text-3xl font-normal tracking-tight md:text-4xl lg:text-4xl",
        className,
      )}
      {...props}
    />
  );
}

export function SectionDescription({
  className,
  ...props
}: ComponentProps<"p">) {
  return (
    <p
      className={cn("max-w-4xl mt-4 text-base text-muted-foreground md:text-lg", className)}
      {...props}
    />
  );
}
