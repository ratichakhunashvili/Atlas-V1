import { AtlasAsset, AtlasIcon } from "./asset";
import type { AchievementLabel as AchievementStatus } from "./demo/live";
import type { Place } from "./fixtures";
import { AtlasLink } from "./ui";

/*
 * Place card on the map sheet — "Card · …" in the Figma map layer (268 wide).
 *
 * The Figma frames have "strokes included in layout" turned on, so a stroke takes space like
 * a CSS border: the selected card (2px Deep Teal) is 2px taller than the others (1px Warm Beige).
 */

export function PlacePhoto({ place, size, radius }: { place: Place; size: number; radius: number }) {
  if (place.photo) {
    return (
      <div className="relative shrink-0 overflow-hidden bg-atlas-beige" style={{ width: size, height: size, borderRadius: radius }}>
        <AtlasAsset
          src={place.photo.src}
          width={place.photo.width}
          height={place.photo.height}
          className="absolute inset-0 size-full object-cover"
        />
      </div>
    );
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center bg-atlas-beige font-manrope text-[10px] leading-[14px] text-atlas-ink"
      style={{ width: size, height: size, borderRadius: radius }}
    >
      Photo
    </div>
  );
}

export function AchievementLabel({ status }: { status?: AchievementStatus }) {
  if (!status) return null;
  const unlocked = status.unlocked;
  return (
    <span className="flex items-center gap-[3px]">
      <AtlasIcon src={unlocked ? "/atlas-ui/icon-check-slate-13.svg" : "/atlas-ui/icon-ach-13.svg"} size={13} />
      <span className={`whitespace-nowrap font-manrope text-[12px] font-semibold leading-[16px] ${unlocked ? "text-atlas-slate" : "text-atlas-teal"}`}>
        {status.label}
      </span>
    </span>
  );
}

export function PriceLevel({ price }: { price: string }) {
  return (
    <span className="flex shrink-0 items-center justify-center whitespace-nowrap rounded-[9px] bg-atlas-beige px-[8px] py-px font-manrope text-[12px] font-semibold leading-[16px] text-atlas-teal">
      {price}
    </span>
  );
}

export function PlaceCard({
  place,
  selected,
  planLabel,
  achievement,
}: {
  place: Place;
  selected: boolean;
  /** "Stop 2 today" — from the demo plan. */
  planLabel?: string;
  achievement?: AchievementStatus;
}) {
  const hasStatus = Boolean(planLabel || achievement);
  return (
    <AtlasLink
      to={place.detail}
      className={`flex w-[268px] max-w-[calc(100vw-48px)] shrink-0 snap-start items-start wide:w-full wide:max-w-none gap-[10px] rounded-[16px] bg-atlas-paper px-[12px] py-[10px] ${
        selected ? "border-2 border-atlas-teal" : "border border-atlas-beige"
      }`}
    >
      <PlacePhoto place={place} size={56} radius={10} />
      <span className="flex min-w-0 flex-1 flex-col items-start gap-[3px] overflow-hidden text-left">
        <span className="whitespace-nowrap font-manrope text-[11px] font-semibold uppercase leading-[15px] tracking-[0.44px] text-atlas-slate">
          {place.eyebrow}
        </span>
        <span className="whitespace-nowrap font-grotesk text-[16px] font-bold leading-[20px] text-atlas-teal">{place.name}</span>
        <span className="flex items-center gap-[6px]">
          <span className="whitespace-nowrap font-manrope text-[13px] leading-[18px] text-atlas-ink">{place.meta}</span>
          {place.price ? <PriceLevel price={place.price} /> : null}
        </span>
        {hasStatus ? (
          <span className="flex items-center gap-[8px]">
            {planLabel ? <span className="font-manrope text-[12px] font-semibold leading-[16px] text-atlas-teal">{planLabel}</span> : null}
            <AchievementLabel status={achievement} />
          </span>
        ) : null}
      </span>
    </AtlasLink>
  );
}
