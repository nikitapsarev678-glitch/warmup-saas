import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-[0.78rem] border px-2.5 py-0.5 text-[0.7rem] font-medium whitespace-nowrap tracking-[0.02em] transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "border-primary/15 bg-primary/10 text-primary [a]:hover:bg-primary/14",
        secondary: "border-border/70 bg-secondary/80 text-secondary-foreground [a]:hover:bg-secondary",
        destructive: "border-destructive/15 bg-destructive/10 text-destructive [a]:hover:bg-destructive/16",
        outline: "border-border/80 bg-background/60 text-foreground [a]:hover:bg-accent/70",
        ghost: "border-transparent bg-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground",
        link: "border-transparent px-0 text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
