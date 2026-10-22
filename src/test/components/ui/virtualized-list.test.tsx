import { useRef } from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import { VirtualizedList } from "@/components/ui/virtualized-list";

const items = Array.from({ length: 300 }, (_, index) => `item-${index}`);

function Harness({ as, pinnedIndex, revealItem }: {
  as?: "div" | "ul";
  pinnedIndex?: number;
  revealItem?: { index: number };
}) {
  const viewport = useRef<HTMLDivElement>(null);
  return (
    <div ref={viewport} data-testid="viewport" style={{ height: 200, overflowY: "auto" }}>
      <VirtualizedList
        items={items} itemHeight={40} fallbackHeight={200}
        scrollContainerRef={viewport} itemKey={(item) => item}
        renderItem={(item) => <span>{item}</span>}
        as={as} pinnedIndex={pinnedIndex} revealItem={revealItem}
      />
    </div>
  );
}

describe("VirtualizedList compatibility", () => {
  it("retains default div semantics, viewport range and overscan for existing consumers", () => {
    render(<Harness />);
    const list = screen.getByRole("list");
    expect(list.tagName).toBe("DIV");
    expect(list).toHaveStyle({ height: "12000px" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(17);
    expect(screen.getByText("item-0")).toBeInTheDocument();
    const viewport = screen.getByTestId("viewport");
    viewport.scrollTop = 800;
    fireEvent.scroll(viewport);
    expect(screen.queryByText("item-0")).not.toBeInTheDocument();
    expect(screen.getByText("item-14")).toBeInTheDocument();
    expect(screen.getByText("item-30")).toBeInTheDocument();
    expect(within(list).getAllByRole("listitem")).toHaveLength(17);
  });

  it("supports ul/li without nested list items, one pinned origin and repeated reveal requests", () => {
    const { rerender } = render(<Harness as="ul" pinnedIndex={299} />);
    const list = screen.getByRole("list");
    expect(list.tagName).toBe("UL");
    expect(list.querySelector("li li")).toBeNull();
    expect(within(list).getAllByRole("listitem")).toHaveLength(18);
    expect(screen.getByText("item-299").closest("li")).toHaveAttribute("aria-posinset", "300");
    const viewport = screen.getByTestId("viewport");
    rerender(<Harness as="ul" pinnedIndex={299} revealItem={{ index: 299 }} />);
    expect(viewport.scrollTop).toBe(11800);
    viewport.scrollTop = 0;
    fireEvent.scroll(viewport);
    rerender(<Harness as="ul" pinnedIndex={299} revealItem={{ index: 299 }} />);
    expect(viewport.scrollTop).toBe(11800);
    expect(within(list).getAllByRole("listitem").length).toBeLessThanOrEqual(18);
  });
});
