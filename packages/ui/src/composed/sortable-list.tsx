import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";

function SortableItem({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id });
  return (
    <div
      data-sortable-id={id}
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <div className="flex min-w-0 items-start gap-2">
        <button
          {...attributes}
          {...listeners}
          aria-label={label}
          className="mt-2 shrink-0 cursor-grab rounded border px-2 py-2 active:cursor-grabbing"
          style={{ touchAction: "none" }}
          type="button"
        >
          <span aria-hidden="true">⋮⋮</span>
        </button>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

export function SortableList<T extends { id: string }>({
  items,
  onMove,
  dragLabel,
  instructions,
  announce,
  renderItem,
}: {
  items: T[];
  onMove: (from: number, to: number) => void;
  dragLabel: (item: T, index: number) => string;
  instructions: string;
  announce: (
    event: "start" | "over" | "end" | "cancel",
    name: string,
    target: string
  ) => string;
  renderItem: (item: T, index: number) => ReactNode;
}) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = items.findIndex((item) => item.id === active.id);
    const to = items.findIndex((item) => item.id === over.id);
    if (from >= 0 && to >= 0) onMove(from, to);
  }
  function label(id: string | number | undefined) {
    const index = items.findIndex((item) => item.id === id);
    return index < 0 ? "" : dragLabel(items[index]!, index);
  }
  return (
    <DndContext
      accessibility={{
        screenReaderInstructions: { draggable: instructions },
        announcements: {
          onDragStart: ({ active }) => announce("start", label(active.id), ""),
          onDragOver: ({ active, over }) =>
            announce("over", label(active.id), label(over?.id)),
          onDragEnd: ({ active, over }) =>
            announce("end", label(active.id), label(over?.id)),
          onDragCancel: ({ active }) =>
            announce("cancel", label(active.id), ""),
        },
      }}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      sensors={sensors}
    >
      <SortableContext
        items={items.map((item) => item.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-3">
          {items.map((item, index) => (
            <SortableItem
              id={item.id}
              key={item.id}
              label={dragLabel(item, index)}
            >
              {renderItem(item, index)}
            </SortableItem>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
