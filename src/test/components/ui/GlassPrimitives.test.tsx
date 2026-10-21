import { describe, expect, it } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { CheckCircle2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardFooter } from "@/components/ui/card"
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
} from "@/components/ui/menu"
import { PageHeader } from "@/components/ui/page-header"
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet"
import { StatTile } from "@/components/ui/stat-tile"
import {
  BADGE_TONES,
  BADGE_TONE_CLASS,
  statusChipClass,
  statusSoftClass,
} from "@/lib/statusTone"
import { cn } from "@/lib/utils"

describe("Badge", () => {
  it.each(BADGE_TONES)("renders the %s tone as a tinted capsule", (tone) => {
    render(<Badge tone={tone}>{`label-${tone}`}</Badge>)
    const badge = screen.getByText(`label-${tone}`).closest("[data-slot=badge]")
    expect(badge).not.toBeNull()
    expect(badge).toHaveAttribute("data-tone", tone)
    expect(badge).toHaveClass("rounded-full", "text-xs")
    for (const token of BADGE_TONE_CLASS[tone].split(" ")) {
      expect(badge).toHaveClass(token)
    }
  })

  it("hides the decorative icon and keeps the text as the accessible content", () => {
    render(
      <Badge tone="success" icon={<CheckCircle2 data-testid="icon" />}>
        Installed
      </Badge>,
    )
    const badge = screen.getByText("Installed").closest("[data-slot=badge]")!
    expect(screen.getByTestId("icon").parentElement).toHaveAttribute(
      "aria-hidden",
      "true",
    )
    expect(badge).toHaveTextContent("Installed")
  })

  it("maps legacy status helpers onto Badge tones", () => {
    expect(statusSoftClass.success).toBe(BADGE_TONE_CLASS.success)
    expect(statusSoftClass.error).toBe(BADGE_TONE_CLASS.destructive)
    expect(statusSoftClass.info).toBe(BADGE_TONE_CLASS.info)
    expect(statusChipClass.warning).toContain(BADGE_TONE_CLASS.warning)
  })
})

describe("StatTile", () => {
  it("names the group with label and formatted value", () => {
    render(<StatTile label="Output tokens" value={21870} />)
    const group = screen.getByRole("group", { name: /Output tokens/ })
    expect(group).toHaveAttribute("data-tone", "primary")
    // en / zh i18n both use grouping separators for 21870.
    expect(group.getAttribute("aria-label")).toMatch(/21[,.\s ]?870/)
    expect(within(group).getByText(/21[,.\s ]?870/)).toHaveClass(
      "text-display-stat",
      "tabular-nums",
    )
  })

  it("renders strings as-is and supports compact size", () => {
    render(<StatTile label="Ratio" value="98%" size="compact" tone="secondary" />)
    const group = screen.getByRole("group", { name: /Ratio/ })
    expect(group).toHaveAttribute("data-size", "compact")
    expect(within(group).getByText("98%")).toHaveClass("text-xl")
  })

  it("shows an em dash instead of a fake zero when the value is unavailable", () => {
    render(<StatTile label="Usage" value={null} />)
    const group = screen.getByRole("group", { name: /Usage/ })
    expect(group).toHaveTextContent("—")
    expect(group).not.toHaveTextContent("0")
  })

  it("keeps height with a skeleton and marks the group busy while loading", () => {
    render(<StatTile label="Skills" value={12} loading />)
    const group = screen.getByRole("group", { name: /Skills/ })
    expect(group).toHaveAttribute("aria-busy", "true")
    expect(group.querySelector("[data-slot=stat-tile-skeleton]")).not.toBeNull()
    expect(group).not.toHaveTextContent("12")
  })
})

describe("PageHeader", () => {
  it("renders a single h1 with meta and actions", () => {
    render(
      <PageHeader
        title="Skill Usage"
        meta="Newest first"
        actions={<Button>Refresh</Button>}
      />,
    )
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Skill Usage",
    )
    expect(screen.getByText("Newest first")).toHaveClass(
      "text-xs",
      "text-muted-foreground",
    )
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument()
  })

  it("wraps meta under the title below the 900px container breakpoint", () => {
    const { container } = render(<PageHeader title="T" meta="M" />)
    const header = container.querySelector("[data-slot=page-header]")!
    expect(header.className).toContain("@container/page-header")
    const row = header.firstElementChild!
    expect(row).toHaveClass("flex-col")
    expect(row.className).toContain("@min-[900px]/page-header:flex-row")
  })

  it("keeps the title width at the wide breakpoint but caps it so long names wrap", () => {
    const { container } = render(<PageHeader title="T" meta="M" />)
    const title = screen.getByRole("heading", { level: 1 })
    expect(title.className).toContain("@min-[900px]/page-header:shrink-0")
    expect(title.className).toContain("@min-[900px]/page-header:max-w-2/3")
    expect(title).toHaveClass("break-words")
    const aside = container.querySelector("[data-slot=page-header-aside]")!
    expect(aside.className).toContain("@min-[900px]/page-header:flex-1")
  })

  it("omits the aside when there is no meta or action", () => {
    const { container } = render(<PageHeader title="Only title" />)
    expect(container.querySelector("[data-slot=page-header-aside]")).toBeNull()
  })
})

describe("Card", () => {
  it("uses the L2 glass panel and the card radius by default", () => {
    render(<Card data-testid="card" />)
    const card = screen.getByTestId("card")
    expect(card).toHaveClass("glass-panel", "rounded-card")
    expect(card).not.toHaveClass("glass-panel-hover")
  })

  it("composes tint variants over the panel and opts into hover", () => {
    render(<Card data-testid="card" variant="tint-secondary" interactive />)
    const card = screen.getByTestId("card")
    expect(card).toHaveClass("glass-panel", "tint-secondary", "glass-panel-hover")
  })

  it("renders the footer as a divider row of small muted text", () => {
    render(<CardFooter data-testid="footer" />)
    expect(screen.getByTestId("footer")).toHaveClass(
      "border-t",
      "border-border",
      "text-xs",
      "text-muted-foreground",
    )
  })
})

describe("Button", () => {
  it("is a pill with the unified outline focus ring", () => {
    render(<Button>Go</Button>)
    const button = screen.getByRole("button", { name: "Go" })
    expect(button).toHaveClass(
      "rounded-full",
      "focus-visible:outline-2",
      "focus-visible:outline-offset-2",
      "focus-visible:outline-ring",
    )
  })

  it("renders icon sizes with the control radius and a glass variant", () => {
    render(
      <>
        <Button size="icon-sm" aria-label="icon" />
        <Button variant="glass">Glass</Button>
      </>,
    )
    const icon = screen.getByRole("button", { name: "icon" })
    expect(icon).toHaveClass("rounded-control")
    expect(icon).not.toHaveClass("rounded-full")
    expect(screen.getByRole("button", { name: "Glass" })).toHaveClass(
      "bg-popover",
      "border-glass-stroke",
    )
  })
})

describe("cn token awareness", () => {
  it("keeps semantic font-size tokens next to text colours", () => {
    expect(cn("text-ui-meta", "text-muted-foreground")).toBe(
      "text-ui-meta text-muted-foreground",
    )
    expect(cn("text-display-stat text-foreground")).toBe(
      "text-display-stat text-foreground",
    )
  })

  it("resolves radius and shadow ladder conflicts", () => {
    expect(cn("rounded-full", "rounded-control")).toBe("rounded-control")
    expect(cn("shadow-glass", "shadow-none")).toBe("shadow-none")
  })
})

describe("Menu", () => {
  it("opens a glass overlay popup with items", async () => {
    render(
      <Menu>
        <MenuTrigger render={<Button />}>Open</MenuTrigger>
        <MenuContent>
          <MenuItem>First</MenuItem>
          <MenuItem variant="destructive">Delete</MenuItem>
        </MenuContent>
      </Menu>,
    )
    fireEvent.click(screen.getByRole("button", { name: "Open" }))
    const menu = await screen.findByRole("menu")
    expect(menu).toHaveClass("glass-overlay", "rounded-card")
    expect(within(menu).getByRole("menuitem", { name: "First" })).toHaveClass(
      "rounded-control",
    )
    expect(within(menu).getByRole("menuitem", { name: "Delete" })).toHaveClass(
      "text-destructive-text",
    )
  })
})

describe("Sheet", () => {
  it("renders a side drawer with the dialog blur and a labelled close button", async () => {
    render(
      <Sheet defaultOpen>
        <SheetContent>
          <SheetTitle>Tasks</SheetTitle>
        </SheetContent>
      </Sheet>,
    )
    const dialog = await screen.findByRole("dialog", { name: "Tasks" })
    expect(dialog).toHaveClass("glass-overlay", "glass-overlay-dialog", "rounded-shell")
    expect(dialog).toHaveAttribute("data-side", "right")
    expect(within(dialog).getByRole("button")).toBeInTheDocument()
  })
})
