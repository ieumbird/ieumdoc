import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding text-sm leading-[var(--line-height-label)] font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-disabled:bg-muted aria-disabled:text-muted-foreground aria-disabled:border-border aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
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
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-[var(--size-control)] gap-[var(--space-2)] px-[var(--space-3)] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-[var(--size-control-compact)] gap-[var(--space-1)] rounded-[min(var(--radius-md),10px)] px-[var(--space-2)] text-xs leading-[var(--line-height-meta)] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-[var(--size-control-compact)] gap-[var(--space-2)] rounded-[min(var(--radius-md),12px)] px-[var(--space-3)] text-sm leading-[var(--line-height-label)] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-[var(--size-icon-slot)]",
        lg: "h-[var(--size-control)] gap-[var(--space-2)] px-[var(--space-3)] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-[var(--size-control)]",
        "icon-xs":
          "size-[var(--size-control-compact)] rounded-md in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-[var(--size-icon-slot)]",
        "icon-sm":
          "size-[var(--size-control-compact)] rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-[var(--size-control)]",
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

export { Button, buttonVariants }
