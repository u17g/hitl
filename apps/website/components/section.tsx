import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const sectionVariants = cva("", {
  variants: {
    variant: {
      default: "border-b border-border py-12 md:py-16",
      muted: "border-b border-border bg-muted/20 py-12 md:py-16",
      hero: "relative overflow-hidden border-b border-border",
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

const sectionSpacerVariants = cva("border-b border-border", {
  variants: {
    size: {
      sm: "h-8 md:h-12",
      default: "h-12 md:h-16",
      lg: "h-16 md:h-24",
      xl: "h-24 md:h-32",
    },
  },
  defaultVariants: {
    size: "default",
  },
});

export function SectionSpacer({
  className,
  size,
  ...props
}: ComponentProps<"section"> & VariantProps<typeof sectionSpacerVariants>) {
  return (
    <section
      aria-hidden
      className={cn(sectionSpacerVariants({ size }), className)}
      {...props}
    />
  );
}

const containerSizeVariants = cva("w-full px-6 md:px-8", {
  variants: {
    size: {
      "6xl": "",
      "4xl": "max-w-4xl mx-auto px-0",
      "3xl": "max-w-3xl mx-auto px-0",
      "2xl": "max-w-2xl mx-auto px-0",
      xl: "max-w-xl mx-auto px-0",
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
      className={cn("mt-4 text-base text-muted-foreground md:text-lg", className)}
      {...props}
    />
  );
}

export function SectionInfo({
  className,
  ...props
}: ComponentProps<"div">) {
  return <div className={cn(className)} {...props} />;
}

export function SectionBody({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cn("min-w-0", className)}
      {...props}
    />
  );
}
