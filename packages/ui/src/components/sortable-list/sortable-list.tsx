import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import * as React from "react";
import { cn } from "../../lib/cn.ts";
import { focusRing, typography } from "../../lib/styles.ts";

export type SortableListItem = {
  readonly disabled?: boolean;
  readonly id: string;
  readonly content: React.ReactNode;
};

export type SortableListProps = Omit<React.HTMLAttributes<HTMLDivElement>, "children"> & {
  readonly handleLabel?: (item: SortableListItem) => string;
  readonly items: readonly SortableListItem[];
  readonly onOrderChange?: (nextIds: readonly string[]) => void;
};

const SortableListRow = ({
  handleLabel,
  item,
}: {
  readonly handleLabel: (item: SortableListItem) => string;
  readonly item: SortableListItem;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    disabled: item.disabled,
    id: item.id,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "grid min-h-11 grid-cols-[2rem_minmax(0,1fr)] items-center gap-2 rounded-md border border-border bg-elevated px-2 py-1.5 text-elevated-foreground shadow-sm",
        isDragging && "relative z-10 opacity-80 shadow-elevated",
      )}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <button
        {...attributes}
        {...listeners}
        aria-label={handleLabel(item)}
        className={cn(
          "grid size-8 place-items-center rounded-md text-muted-foreground transition hover:bg-subtle hover:text-foreground",
          focusRing,
        )}
        disabled={item.disabled}
        type="button"
      >
        <GripVertical aria-hidden className="size-4" />
      </button>
      <div className={cn("min-w-0", typography.bodyCompact)}>{item.content}</div>
    </div>
  );
};

export const SortableList = React.forwardRef<HTMLDivElement, SortableListProps>(
  function SortableList(
    { className, handleLabel = (item) => `Reorder ${item.id}`, items, onOrderChange, ...props },
    ref,
  ) {
    const itemIds = React.useMemo(() => items.map((item) => item.id), [items]);
    const knownIds = React.useMemo(() => new Set(itemIds), [itemIds]);
    const sensors = useSensors(
      useSensor(PointerSensor),
      useSensor(KeyboardSensor, {
        coordinateGetter: sortableKeyboardCoordinates,
      }),
    );

    const handleDragEnd = React.useCallback(
      (event: DragEndEvent) => {
        const { active, over } = event;

        if (over === null || active.id === over.id) return;
        if (!knownIds.has(String(active.id)) || !knownIds.has(String(over.id))) return;

        const oldIndex = itemIds.indexOf(String(active.id));
        const newIndex = itemIds.indexOf(String(over.id));

        if (oldIndex === -1 || newIndex === -1) return;

        onOrderChange?.(arrayMove(itemIds, oldIndex, newIndex));
      },
      [itemIds, knownIds, onOrderChange],
    );

    return (
      <div {...props} ref={ref} className={cn("grid gap-2", className)}>
        <DndContext
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          onDragEnd={handleDragEnd}
          sensors={sensors}
        >
          <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
            {items.map((item) => (
              <SortableListRow handleLabel={handleLabel} item={item} key={item.id} />
            ))}
          </SortableContext>
        </DndContext>
      </div>
    );
  },
);
