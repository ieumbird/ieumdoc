import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding text-sm leading-[var(--line-height-label)] font-medium whitespace-nowrap outline-none select-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 aria-disabled:bg-muted aria-disabled:text-muted-foreground aria-disabled:border-border aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-[var(--id-color-accent-hover)]",
        outline:
          "border-input bg-background hover:bg-accent hover:text-foreground aria-expanded:bg-[var(--id-color-surface-pressed)] aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "border-input bg-secondary text-secondary-foreground hover:bg-accent aria-expanded:bg-[var(--id-color-surface-pressed)] aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-accent hover:text-foreground aria-expanded:border-input aria-expanded:bg-[var(--id-color-surface-pressed)] aria-expanded:text-foreground dark:hover:bg-muted/50",
      },
      size: {
        default:
          "h-[var(--size-control)] gap-[var(--space-2)] px-[var(--space-3)]",
        sm: "h-[var(--size-control-compact)] gap-[var(--space-2)] rounded-[min(var(--radius-md),12px)] px-[var(--space-3)] text-sm leading-[var(--line-height-label)] [&_svg:not([class*='size-'])]:size-[var(--size-icon-slot)]",
        icon: "size-[var(--size-control)]",
        "icon-xs":
          "size-[var(--size-control-compact)] rounded-md [&_svg:not([class*='size-'])]:size-[var(--size-icon-slot)]",
        "icon-sm":
          "size-[var(--size-control-compact)] rounded-[min(var(--radius-md),12px)]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button }
