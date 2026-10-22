import { cva } from "class-variance-authority"

// DESIGN.md Components → button-primary / button-glass.
// - Shape: pill (`rounded-full`) for text buttons; icon-only sizes use
//   `rounded-control` (Shapes: "小图标按钮" = 12px).
// - Focus: unified outline ring (2px `ring`, 2px offset) so it stays visible
//   on translucent glass; no ring-offset box-shadow.
// - Press: Button family keeps `active:translate-y-px` (the "双轨" rule; hand
//   written tiles use `active:scale-[0.96]` instead). Transitions name their
//   properties, never `transition-all`.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,translate] duration-150 outline-none select-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:not-aria-[haspopup]:translate-y-px motion-reduce:active:not-aria-[haspopup]:translate-y-0 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive-text aria-invalid:focus-visible:outline-destructive-text aria-busy:cursor-progress [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Mint fill + on-mint text (4.93:1 light / 8.96:1 dark).
        default:
          "bg-primary text-primary-foreground hover:bg-primary-hover aria-expanded:bg-primary-hover",
        // White glass capsule: overlay fill, glass stroke + hairline outer
        // line, hover washes surface-hover over the fill. No real blur — the
        // button lives in scrolling content (Blur-Has-A-Reason).
        glass:
          "border-glass-stroke bg-popover text-foreground ring-1 ring-glass-hairline hover:bg-linear-to-b hover:from-accent hover:to-accent aria-expanded:bg-linear-to-b aria-expanded:from-accent aria-expanded:to-accent",
        // Kept for existing call sites; renders as the glass capsule.
        secondary:
          "border-glass-stroke bg-secondary text-secondary-foreground ring-1 ring-glass-hairline hover:bg-linear-to-b hover:from-accent hover:to-accent aria-expanded:bg-linear-to-b aria-expanded:from-accent aria-expanded:to-accent",
        // Transparent capsule with the glass edge (stroke + hairline).
        outline:
          "border-glass-stroke bg-transparent text-foreground ring-1 ring-glass-hairline hover:bg-accent aria-expanded:bg-accent",
        ghost:
          "text-foreground hover:bg-accent aria-expanded:bg-accent",
        // Rose tint + rose text; hover deepens the tint base to 20%
        // (DESIGN.md Known Gaps: rose-text / rose 20% = 4.57 light, 4.73 dark).
        destructive:
          "bg-destructive-tint text-destructive-text hover:bg-[rgb(from_var(--destructive-tint)_r_g_b/0.2)] aria-expanded:bg-[rgb(from_var(--destructive-tint)_r_g_b/0.2)] focus-visible:outline-destructive-text",
        // Mint text link ("查看详情").
        link: "text-primary-text underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-3.5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-8 min-w-8 gap-1 px-2.5 text-xs md:h-6 md:min-w-0 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 min-w-8 gap-1 px-3 text-xs md:h-7 md:min-w-0 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-4 has-data-[icon=inline-end]:pr-3.5 has-data-[icon=inline-start]:pl-3.5",
        icon: "size-8 rounded-control",
        "icon-xs":
          "size-8 rounded-control md:size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 rounded-control md:size-7",
        "icon-lg": "size-9 rounded-control",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export { buttonVariants }
