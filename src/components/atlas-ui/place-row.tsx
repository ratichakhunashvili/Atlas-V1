import { AtlasAsset, AtlasIcon } from "./asset";
import type { AchievementLabel as AchievementStatus } from "./demo/live";
import type { Photo, Place } from "./fixtures";
import { AchievementLabel, PriceLevel } from "./place-card";
import { AtlasLink } from "./ui";

/*
 * Place row — "Place · …" in List results (1:4283) and on No partner fits (1:352): a 60px photo,
 * the name with its price level, the category line, walk / visit time and achievement status,
 * and a chevron. The whole row opens the place.
 */

export function PlaceRow({ place, photo, achievement }: { place: Place; photo?: Photo; achievement?: AchievementStatus }) {
  return (
    <AtlasLink to={place.detail} className="flex w-full items-center gap-[10px] rounded-[14px] border border-atlas-beige p-[10px] text-left">
      {photo ? (
        <span className="relative size-[60px] shrink-0 overflow-hidden rounded-[10px] bg-atlas-beige">
          <AtlasAsset src={photo.src} width={photo.width} height={photo.height} className="absolute inset-0 size-full object-cover" />
        </span>
      ) : (
        <span className="flex size-[60px] shrink-0 items-center justify-center rounded-[10px] bg-atlas-beige font-manrope text-[10px] leading-[14px] text-atlas-ink">
          Photo
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col items-start gap-[2px]">
        <span className="flex w-full items-center justify-between gap-[6px]">
          <span className="min-w-0 font-grotesk text-[16px] font-bold leading-[20px] text-atlas-teal">{place.name}</span>
          {place.price ? <PriceLevel price={place.price} /> : null}
        </span>
        <span className="font-manrope text-[13px] leading-[18px] text-atlas-slate">{place.eyebrow}</span>
        <span className="flex w-full flex-wrap items-center gap-[8px]">
          <span className="font-manrope text-[13px] leading-[18px] text-atlas-ink">{place.meta}</span>
          <AchievementLabel status={achievement} />
        </span>
      </span>
      <AtlasIcon src="/atlas-ui/icon-chevron-18.svg" size={18} className="shrink-0" />
    </AtlasLink>
  );
}
