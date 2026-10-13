import { useEffect, useLayoutEffect, useMemo, useState, type Key, type ReactNode, type RefObject } from "react";

interface VirtualizedListProps<T> {
  items: T[];
  itemHeight: number;
  itemGap?: number;
  overscan?: number;
  fallbackHeight?: number;
  scrollContainerRef: RefObject<HTMLElement | null>;
  itemKey: (item: T, index: number) => Key;
  renderItem: (item: T, index: number) => ReactNode;
  as?: "div" | "ul";
  /** 单个详情来源可在可视窗口之外保留，以便关闭后恢复焦点。 */
  pinnedIndex?: number;
  revealItem?: { index: number } | null;
}

export function VirtualizedList<T>({
  items,
  itemHeight,
  itemGap = 0,
  overscan = 6,
  fallbackHeight = 640,
  scrollContainerRef,
  itemKey,
  renderItem,
  as: Root = "div",
  pinnedIndex,
  revealItem,
}: VirtualizedListProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(fallbackHeight);
  const rowStride = itemHeight + itemGap;

  useEffect(() => {
    const scrollNode = scrollContainerRef.current;
    if (!scrollNode) return;

    const updateViewport = () => {
      const nextHeight = scrollNode.clientHeight;
      setViewportHeight(nextHeight > 0 ? nextHeight : fallbackHeight);
    };

    const updateScroll = () => {
      setScrollTop(scrollNode.scrollTop);
    };

    updateViewport();
    updateScroll();

    scrollNode.addEventListener("scroll", updateScroll, { passive: true });

    if (typeof ResizeObserver !== "undefined") {
      const resizeObserver = new ResizeObserver(updateViewport);
      resizeObserver.observe(scrollNode);
      return () => {
        resizeObserver.disconnect();
        scrollNode.removeEventListener("scroll", updateScroll);
      };
    }

    window.addEventListener("resize", updateViewport);
    return () => {
      window.removeEventListener("resize", updateViewport);
      scrollNode.removeEventListener("scroll", updateScroll);
    };
  }, [fallbackHeight, scrollContainerRef]);

  useLayoutEffect(() => {
    const scrollNode = scrollContainerRef.current;
    if (!scrollNode || !revealItem || revealItem.index < 0 || revealItem.index >= items.length) return;
    const height = scrollNode.clientHeight || fallbackHeight;
    const top = revealItem.index * rowStride;
    const bottom = top + itemHeight;
    const next = top < scrollNode.scrollTop
      ? top
      : bottom > scrollNode.scrollTop + height
        ? bottom - height
        : scrollNode.scrollTop;
    scrollNode.scrollTop = next;
    setScrollTop(next);
  }, [revealItem, fallbackHeight, itemHeight, items.length, rowStride, scrollContainerRef]);

  const visibleRange = useMemo(() => {
    if (items.length === 0) {
      return { start: 0, end: 0 };
    }

    const visibleRowCount = Math.max(1, Math.ceil(viewportHeight / rowStride));
    const maxStart = Math.max(0, items.length - visibleRowCount);
    const start = Math.min(
      maxStart,
      Math.max(0, Math.floor(scrollTop / rowStride) - overscan)
    );
    const end = Math.min(
      items.length,
      start + visibleRowCount + overscan * 2
    );

    return { start, end };
  }, [items.length, overscan, rowStride, scrollTop, viewportHeight]);

  const totalHeight = items.length > 0 ? items.length * rowStride - itemGap : 0;
  const visibleIndices = Array.from(
    { length: visibleRange.end - visibleRange.start },
    (_, offset) => visibleRange.start + offset,
  );
  if (pinnedIndex != null && pinnedIndex >= 0 && pinnedIndex < items.length &&
    (pinnedIndex < visibleRange.start || pinnedIndex >= visibleRange.end)) {
    visibleIndices.push(pinnedIndex);
    visibleIndices.sort((a, b) => a - b);
  }
  const Item = Root === "ul" ? "li" : "div";

  return (
    <Root role="list" className="relative w-full" style={{ height: totalHeight }}>
      {visibleIndices.map((index) => {
        const item = items[index];
        return (
          <Item
            key={itemKey(item, index)}
            role="listitem"
            aria-posinset={index + 1}
            aria-setsize={items.length}
            className="absolute left-0 right-0"
            style={{
              top: index * rowStride,
              height: itemHeight,
            }}
          >
            {renderItem(item, index)}
          </Item>
        );
      })}
    </Root>
  );
}
