import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
const badgeVariants = cva("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", {
  variants: { variant: {
    default: "border-transparent bg-primary/15 text-primary",
    outline: "text-muted-foreground",
    good: "border-transparent bg-good/15 text-good",
    warn: "border-transparent bg-warn/15 text-warn",
    bad: "border-transparent bg-bad/15 text-bad",
  } },
  defaultVariants: { variant: "default" },
});
export function Badge({ className, variant, ...p }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...p} />;
}
