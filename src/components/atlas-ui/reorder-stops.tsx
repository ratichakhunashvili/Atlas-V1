"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { AtlasIcon } from "./asset";
import { reorderStops, seedDemo, useDemoState } from "./demo/demo-store";
import { STOPS, timePlan, type StopId, type TimedStop } from "./demo/plan-model";
import { scenarioState } from "./demo/scenarios";
import { DoneStop, MissionsShell, NumberDot, ReturnRow, Row, StartRow, StopName, UnavailableStop, nextStopMeta, stopMeta } from "./my-plan";
import { screenHref } from "./screen-hrefs";
import { AtlasTextLink } from "./ui";

/*
 * ReorderStops · Reorder stops — Figma frame 70:3786. My plan's timeline with drag handles on the
 * stops still to visit. Visited and unavailable stops keep their place; only the available stops
 * after them trade places. Times, "Next" and the way back are recalculated from the draft order
 * by the same planning model as My plan, so the preview always matches what saving produces.
 *
 * Each handle is a button: drag it with a finger or mouse, or focus it and press the up and down
 * arrow keys. Tapping or pressing it without dragging opens "Move up" / "Move down" under the
 * stop, for screen readers (whose browse modes don't pass arrow keys or drags through) and for
 * anyone who finds dragging hard. Every move is announced. "Save order" writes the order to the demo plan (with Undo
 * on My plan); Cancel leaves it untouched.
 *
 * As a design-review route it opens the plan the frame draws (My plan after adding Partner
 * Place 4) and seeds the demo state with it, like the other /plan state routes.
 */

const SCENARIO = "reorder";
const START = { ...scenarioState("addedP4"), flash: undefined };

/** Moves `id` into `target`'s place among the movable stops; fixed stops keep their index. */
function moveTo(order: StopId[], id: StopId, target: StopId): StopId[] {
  const slots = order.flatMap((stop, index) => (STOPS[stop].available ? [index] : []));
  const movable = slots.map((index) => order[index]);
  const from = movable.indexOf(id);
  const to = movable.indexOf(target);
  if (from < 0 || to < 0 || from === to) return order;
  movable.splice(from, 1);
  movable.splice(to, 0, id);
  const next = [...order];
  slots.forEach((slot, k) => {
    next[slot] = movable[k];
  });
  return next;
}

function neighbour(order: StopId[], id: StopId, step: -1 | 1): StopId | undefined {
  const movable = order.filter((stop) => STOPS[stop].available);
  return movable[movable.indexOf(id) + step];
}

/** The drag handle. A press without a drag (keyboard, screen reader or tap) toggles the move buttons. */
function Handle({
  stop,
  open,
  onKeyDown,
  onPointerDown,
  onToggle,
}: {
  stop: TimedStop;
  open: boolean;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      data-grip={stop.id}
      aria-label={`Move ${STOPS[stop.id].name}, stop ${stop.position}`}
      aria-describedby="reorder-help"
      aria-expanded={open}
      aria-controls={`move-${stop.id}`}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      // Pointer taps are handled on the list (it holds the pointer capture); this catches Enter,
      // Space and screen-reader activation, which report no click count.
      onClick={(event) => {
        if (event.detail === 0) onToggle();
      }}
      className="flex size-[44px] shrink-0 cursor-grab touch-none items-center justify-center rounded-[12px] active:cursor-grabbing"
    >
      <AtlasIcon src="/atlas-ui/icon-grip-slate-22.svg" size={22} />
    </button>
  );
}

const MOVE_BUTTON =
  "flex h-[44px] min-w-0 flex-1 items-center justify-center rounded-[12px] border border-atlas-teal px-[8px] font-manrope text-[13px] font-semibold leading-[18px] text-atlas-teal disabled:border-atlas-beige disabled:text-atlas-slate/60";

/** "Move up" / "Move down" for one stop, shown after its handle is pressed without dragging. */
function MoveButtons({
  stop,
  canUp,
  canDown,
  onMove,
}: {
  stop: TimedStop;
  canUp: boolean;
  canDown: boolean;
  onMove: (step: -1 | 1) => void;
}) {
  const name = STOPS[stop.id].name;
  return (
    <div id={`move-${stop.id}`} className="flex w-full items-start gap-[8px]">
      <button type="button" disabled={!canUp} onClick={() => onMove(-1)} className={MOVE_BUTTON}>
        Move up<span className="sr-only"> {name}</span>
      </button>
      <button type="button" disabled={!canDown} onClick={() => onMove(1)} className={MOVE_BUTTON}>
        Move down<span className="sr-only"> {name}</span>
      </button>
    </div>
  );
}

export function ReorderStopsScreen() {
  const router = useRouter();
  const live = useDemoState();
  const [draft, setDraft] = useState<StopId[] | null>(null);
  const [dragging, setDragging] = useState<StopId | null>(null);
  const [focusId, setFocusId] = useState<StopId | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [menuFor, setMenuFor] = useState<StopId | null>(null);
  const moved = useRef(false);
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => {
    seedDemo(SCENARIO, START);
  }, []);

  // Moving a row re-inserts it in the DOM; keep keyboard focus on the handle that was moved.
  useEffect(() => {
    if (focusId) list.current?.querySelector<HTMLElement>(`[data-grip="${focusId}"]`)?.focus();
  }, [focusId, draft]);

  const state = live.seededFrom === SCENARIO ? live : START;
  const { plan, preferences } = state;
  const order = draft ?? plan.upcoming;
  const timing = timePlan({ ...plan, upcoming: order }, preferences.time);
  const timedPositions = timing.stops.filter((s) => s.status !== "unavailable").map((s) => s.position);
  const previousOf = (position: number) => timedPositions.filter((p) => p < position).at(-1) ?? 1;

  const apply = (next: StopId[], id: StopId) => {
    if (next === order) return;
    setDraft(next);
    const position = plan.completed.length + next.indexOf(id) + 1;
    setAnnouncement(`${STOPS[id].name} moved to stop ${position}.`);
  };

  const step = (id: StopId, direction: -1 | 1) => {
    const target = neighbour(order, id, direction);
    if (target) apply(moveTo(order, id, target), id);
  };

  const toggleMenu = (id: StopId) => setMenuFor((open) => (open === id ? null : id));

  const onKeyDown = (id: StopId) => (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Escape" && menuFor === id) {
      event.preventDefault();
      setMenuFor(null);
      return;
    }
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    setFocusId(id);
    step(id, event.key === "ArrowUp" ? -1 : 1);
  };

  // The list, not the handle, holds the pointer: a handle is re-mounted when its stop moves into
  // or out of the Next card, which would otherwise release the capture mid-drag.
  const onPointerDown = (id: StopId) => (event: PointerEvent<HTMLButtonElement>) => {
    list.current?.setPointerCapture(event.pointerId);
    moved.current = false;
    setDragging(id);
  };

  const endDrag = () => setDragging(null);

  // A tap on a handle (no stop moved while the pointer was down) opens that stop's move buttons.
  const onPointerUp = () => {
    if (dragging && !moved.current) toggleMenu(dragging);
    endDrag();
  };

  const onPointerMove = (event: PointerEvent<HTMLOListElement>) => {
    const id = dragging;
    if (!id || !list.current) return;
    const rows = [...list.current.querySelectorAll<HTMLElement>("[data-movable]")];
    const own = rows.findIndex((row) => row.dataset.movable === id);
    for (const [index, row] of rows.entries()) {
      const rect = row.getBoundingClientRect();
      const target = row.dataset.movable as StopId;
      const middle = rect.top + rect.height / 2;
      // Swap only once the pointer passes the other card's middle, so cards of different heights don't flip back and forth.
      const crossed = index < own ? event.clientY < middle : event.clientY > middle;
      if (index !== own && crossed && event.clientY >= rect.top && event.clientY <= rect.bottom) {
        moved.current = true;
        setFocusId(id);
        apply(moveTo(order, id, target), id);
        break;
      }
    }
  };

  const save = () => {
    if (draft) reorderStops(draft, "Stops reordered");
    router.push(screenHref("MyPlan") ?? "/plan");
  };

  return (
    <MissionsShell>
      <div className="flex w-full max-w-[560px] flex-col items-start gap-[12px] self-center">
        <div className="flex w-full items-center justify-between gap-[8px]">
          <h1 className="font-grotesk text-[20px] font-bold leading-[26px] text-atlas-teal">Reorder stops</h1>
          <button
            type="button"
            onClick={save}
            className="flex h-[44px] shrink-0 items-center justify-center rounded-[22px] bg-atlas-teal px-[16px] font-manrope text-[13px] font-semibold leading-[18px] text-atlas-paper"
          >
            Save order
          </button>
        </div>

        <div className="flex w-full items-start gap-[8px] rounded-[12px] bg-atlas-sand px-[12px] py-[10px]">
          <AtlasIcon src="/atlas-ui/icon-info-teal-16.svg" size={16} className="mt-[1px] shrink-0" />
          <p id="reorder-help" className="min-w-0 flex-1 font-manrope text-[13px] leading-[1.45] text-atlas-ink">
            Drag the handles to change the order. Visited and unavailable stops can&apos;t be moved.
            <span className="sr-only">
              {" "}
              With a keyboard, focus a handle and use the up and down arrow keys, or press it for Move up and Move down buttons.
            </span>
          </p>
        </div>

        <ol
          ref={list}
          aria-label="Today's stops"
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={endDrag}
          onLostPointerCapture={endDrag}
          className="flex w-full flex-col items-start"
        >
          <StartRow />
          {timing.stops.map((stop) => {
            if (stop.status === "done") return <DoneStop key={stop.id} stop={stop} />;
            if (stop.status === "unavailable") return <UnavailableStop key={stop.id} stop={stop} />;
            const open = menuFor === stop.id;
            const handle = (
              <Handle
                stop={stop}
                open={open}
                onKeyDown={onKeyDown(stop.id)}
                onPointerDown={onPointerDown(stop.id)}
                onToggle={() => toggleMenu(stop.id)}
              />
            );
            const moveButtons = open ? (
              <MoveButtons
                stop={stop}
                canUp={Boolean(neighbour(order, stop.id, -1))}
                canDown={Boolean(neighbour(order, stop.id, 1))}
                onMove={(direction) => {
                  setFocusId(stop.id);
                  step(stop.id, direction);
                }}
              />
            ) : null;
            const lifted = stop.status === "next" || dragging === stop.id ? "drop-shadow-[0px_8px_8px_rgba(28,41,41,0.25)]" : "";
            return (
              <Row key={stop.id} dot={<NumberDot n={stop.position} />} line="beige">
                {stop.status === "next" ? (
                  <div
                    data-movable={stop.id}
                    className={`flex min-w-0 flex-1 flex-col items-start gap-[8px] rounded-[14px] border-2 border-atlas-teal bg-atlas-paper p-[10px] ${lifted}`}
                  >
                    <div className="flex w-full flex-wrap items-center justify-between gap-[8px] text-atlas-teal">
                      <StopName stop={stop} className="min-w-[min(100%,96px)] flex-1 font-grotesk text-[16px] font-bold leading-[20px] [overflow-wrap:anywhere]" />
                      <span className="shrink-0 font-manrope text-[12px] font-semibold leading-[16px]">Next</span>
                      {handle}
                    </div>
                    <p className="font-manrope text-[12px] leading-[16px] text-atlas-slate">{nextStopMeta(stop)}</p>
                    {moveButtons}
                  </div>
                ) : (
                  <div
                    data-movable={stop.id}
                    className={`flex min-w-0 flex-1 flex-wrap items-center gap-[10px] rounded-[14px] border border-atlas-beige bg-atlas-paper p-[10px] ${lifted}`}
                  >
                    <span className="flex min-w-0 flex-1 flex-col items-start gap-px text-left">
                      <StopName stop={stop} className="font-grotesk text-[16px] font-bold leading-[20px] text-atlas-teal [overflow-wrap:anywhere]" />
                      <span className="font-manrope text-[12px] leading-[16px] text-atlas-slate">{stopMeta(stop, previousOf(stop.position))}</span>
                    </span>
                    {handle}
                    {moveButtons}
                  </div>
                )}
              </Row>
            );
          })}
          <ReturnRow at={timing.returnAt} />
        </ol>
        <p role="status" className="sr-only">
          {announcement}
        </p>

        <AtlasTextLink to="MyPlan" tone="slate">
          Cancel
        </AtlasTextLink>
      </div>
    </MissionsShell>
  );
}
