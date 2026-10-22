// DEV-only visual verification surface for src/components/ui (C4).
// Registered in App.tsx only under `import.meta.env.DEV`, so neither the route
// nor this chunk reaches the production bundle. Not user-facing: labels are
// developer state names, intentionally not routed through i18n.
//
// States that CSS cannot hold statically (hover / focus-visible / active) are
// tagged `data-force="hover|focus-visible|active"`; the screenshot script
// forces those pseudo-classes over CDP. Overlays open via `?overlay=`
// (menu | dialog | sheet | command | toast).
import { useEffect, useState, type ReactNode } from "react"
import { useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  CircleAlert,
  Copy,
  Info,
  MoreHorizontal,
  Search,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Command,
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuSeparator,
  MenuShortcut,
  MenuTrigger,
} from "@/components/ui/menu"
import { PageHeader } from "@/components/ui/page-header"
import { RadioGroup, RadioItem } from "@/components/ui/radio-group"
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { StatTile } from "@/components/ui/stat-tile"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { BADGE_TONES } from "@/lib/statusTone"

const STATES = ["default", "hover", "focus-visible", "active", "disabled", "error"] as const
type State = (typeof STATES)[number]

function stateProps(state: State) {
  return {
    ...(state === "hover" || state === "focus-visible" || state === "active"
      ? { "data-force": state }
      : {}),
    ...(state === "disabled" ? { disabled: true } : {}),
    ...(state === "error" ? { "aria-invalid": true } : {}),
  }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  )
}

function StateGrid({
  rows,
  render,
}: {
  rows: readonly string[]
  render: (row: string, state: State) => ReactNode
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-x-3 border-spacing-y-2 text-left">
        <thead>
          <tr>
            <th className="text-xs font-medium text-muted-foreground" />
            {STATES.map((state) => (
              <th key={state} className="text-xs font-medium text-muted-foreground">
                {state}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row}>
              <td className="font-mono text-ui-meta text-muted-foreground">{row}</td>
              {STATES.map((state) => (
                <td key={state}>{render(row, state)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const BUTTON_VARIANTS = ["default", "glass", "outline", "ghost", "destructive", "link"] as const

const TONE_ICON: Record<string, ReactNode> = {
  neutral: <Info />,
  primary: <CheckCircle2 />,
  secondary: <ArrowUpFromLine />,
  success: <CheckCircle2 />,
  warning: <TriangleAlert />,
  destructive: <CircleAlert />,
  info: <Info />,
}

function OverlayDemos({ overlay }: { overlay: string | null }) {
  const [checked, setChecked] = useState(true)

  useEffect(() => {
    if (overlay !== "toast") return
    toast("Plain notification", { description: "Secondary detail line" })
    toast.success("Installed to 3 platforms")
    toast.info("12 skills exported")
    toast.warning("2 skills skipped")
    toast.error("Sync failed", { description: "Remote target unreachable" })
  }, [overlay])

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Menu defaultOpen={overlay === "menu"}>
          <MenuTrigger render={<Button variant="glass" />}>
            <MoreHorizontal />
            Menu
          </MenuTrigger>
          <MenuContent>
            <MenuGroup>
              <MenuGroupLabel>Actions</MenuGroupLabel>
              <MenuItem>
                <Copy />
                Copy path
                <MenuShortcut>Ctrl C</MenuShortcut>
              </MenuItem>
              <MenuItem disabled>
                <Sparkles />
                Disabled item
              </MenuItem>
              <MenuCheckboxItem checked={checked} onCheckedChange={setChecked}>
                Show hidden
              </MenuCheckboxItem>
            </MenuGroup>
            <MenuSeparator />
            <MenuItem variant="destructive">
              <Trash2 />
              Delete
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>

      <Dialog defaultOpen={overlay === "dialog"}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete skill</DialogTitle>
            <DialogDescription>
              The skill directory is removed from the central library.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-inner bg-destructive-tint px-3 py-2 text-xs text-destructive-text">
            Error banner: 2 platforms still link this skill.
          </div>
          <DialogFooter>
            <Button variant="glass">Cancel</Button>
            <Button variant="destructive">Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet defaultOpen={overlay === "sheet"}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Task center</SheetTitle>
            <SheetDescription>Recent background jobs</SheetDescription>
          </SheetHeader>
          <SheetBody className="space-y-3">
            <Card size="sm">
              <CardContent className="text-sm">Job card inside a sheet</CardContent>
            </Card>
            <StatTile tone="primary" label="Completed" value={42} icon={<CheckCircle2 />} />
          </SheetBody>
          <SheetFooter>
            <Button variant="glass">Close</Button>
            <Button>Retry</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <CommandDialog defaultOpen={overlay === "command"} title="Command" description="Gallery">
        <Command>
          <CommandInput placeholder="Search commands" />
          <CommandList>
            <CommandGroup heading="Actions">
              <CommandItem>
                <Sparkles />
                Import skill
                <CommandShortcut>Ctrl I</CommandShortcut>
              </CommandItem>
              <CommandItem>
                <Search />
                Search central library
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  )
}

export function PrimitivesGallery() {
  const [params] = useSearchParams()
  const overlay = params.get("overlay")

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
        <PageHeader
          title="Primitives gallery"
          meta="DEV only · src/components/ui"
          actions={
            <>
              <Button variant="glass" size="sm">
                Secondary
              </Button>
              <Button size="sm">Primary</Button>
            </>
          }
        />

        <Section title="Button">
          <StateGrid
            rows={BUTTON_VARIANTS}
            render={(variant, state) => (
              <Button
                variant={variant as (typeof BUTTON_VARIANTS)[number]}
                {...stateProps(state)}
              >
                Action
              </Button>
            )}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="xs">xs</Button>
            <Button size="sm">sm</Button>
            <Button>default</Button>
            <Button size="lg">lg</Button>
            <Button size="icon-xs" variant="ghost" aria-label="icon-xs">
              <Copy />
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label="icon-sm">
              <Copy />
            </Button>
            <Button size="icon" variant="glass" aria-label="icon">
              <Copy />
            </Button>
            <Button size="icon-lg" variant="outline" aria-label="icon-lg">
              <Copy />
            </Button>
            <Button aria-busy="true" disabled>
              Loading
            </Button>
          </div>
        </Section>

        <Section title="Badge">
          {(["sm", "md"] as const).map((size) => (
            <div key={size} className="flex flex-wrap items-center gap-2">
              {BADGE_TONES.map((tone) => (
                <Badge key={tone} tone={tone} size={size} icon={TONE_ICON[tone]}>
                  {tone}
                </Badge>
              ))}
            </div>
          ))}
        </Section>

        <Section title="StatTile">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile tone="primary" icon={<ArrowDownToLine />} label="Input tokens" value={76} />
            <StatTile
              tone="secondary"
              icon={<ArrowUpFromLine />}
              label="Output tokens"
              value={21870}
              hint="Avg 412 / min"
            />
            <StatTile tone="neutral" label="Skills" value={1234567} />
            <StatTile tone="primary" label="Loading" value={0} loading />
            <StatTile tone="secondary" label="Unavailable" value={null} hint="Usage log not found" />
            <StatTile tone="primary" size="compact" icon={<CheckCircle2 />} label="Compact" value={308} />
            <StatTile tone="secondary" size="compact" label="Compact text" value="98%" />
          </div>
        </Section>

        <div className="grid gap-5 md:grid-cols-2">
          {(["glass", "tint-primary", "tint-secondary", "plain"] as const).map((variant) => (
            <Card key={variant} variant={variant}>
              <CardHeader>
                <CardTitle>Card · {variant}</CardTitle>
                <CardDescription>Description in ink-muted body text.</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center gap-2">
                <Badge tone="success" icon={<CheckCircle2 />}>
                  Done
                </Badge>
                <span className="font-mono text-ui-meta text-muted-foreground">~/.skills/demo</span>
              </CardContent>
              <CardFooter className="justify-between">
                <span>Updated 2 min ago</span>
                <Button variant="link" size="sm" className="h-auto px-0">
                  View details
                </Button>
              </CardFooter>
            </Card>
          ))}
          <Card interactive tabIndex={0} data-force="hover">
            <CardContent>interactive · hover (forced)</CardContent>
          </Card>
          <Card interactive tabIndex={0} data-force="focus-visible">
            <CardContent>interactive · focus-visible (forced)</CardContent>
          </Card>
        </div>

        <Section title="PageHeader narrow (600px container)">
          <div className="w-[600px] max-w-full">
            <PageHeader
              title="Skill Usage"
              meta="Newest first · last 8 hours"
              actions={<Button size="sm">Refresh</Button>}
            />
          </div>
        </Section>

        <Section title="Inputs">
          <StateGrid
            rows={["input", "textarea", "input-group"]}
            render={(row, state) => {
              const props = stateProps(state)
              if (row === "input") return <Input placeholder="Placeholder" {...props} />
              if (row === "textarea") return <Textarea placeholder="Placeholder" rows={2} {...props} />
              // The group paints hover; focus-visible comes from the inner
              // control through `has-[…:focus-visible]`, so force it there.
              const groupForce = state === "hover" || state === "active" ? state : undefined
              return (
                <InputGroup data-force={groupForce}>
                  <InputGroupAddon>
                    <Search />
                  </InputGroupAddon>
                  <InputGroupInput
                    placeholder="Search"
                    data-force={state === "focus-visible" ? state : undefined}
                    disabled={state === "disabled"}
                    aria-invalid={state === "error" || undefined}
                  />
                </InputGroup>
              )
            }}
          />
          <StateGrid
            rows={["checkbox", "checkbox-on", "radio", "switch", "switch-on"]}
            render={(row, state) => {
              const props = stateProps(state)
              const on = row.endsWith("-on")
              if (row.startsWith("checkbox"))
                return <Checkbox defaultChecked={on} aria-label={row} {...props} />
              if (row === "radio")
                return (
                  <RadioGroup defaultValue="a" className="flex-row" aria-label="radio">
                    <RadioItem value="a" aria-label="a" {...props} />
                    <RadioItem value="b" aria-label="b" {...props} />
                  </RadioGroup>
                )
              return <Switch defaultChecked={on} aria-label={row} {...props} />
            }}
          />
        </Section>

        <Section title="Overlays (?overlay=menu|dialog|sheet|command|toast)">
          <OverlayDemos overlay={overlay} />
        </Section>
      </div>
    </div>
  )
}
