import { type } from "./ui";

/* Stay card — the outlined hotel-and-dates summary on StayConfirmed (70:3759) and StayEnded (70:3775). */

export function StayCard({ title, dates }: { title: string; dates: string }) {
  return (
    <div className="flex w-full flex-col items-start gap-[2px] rounded-[14px] border border-atlas-beige px-[16px] py-[12px] text-left">
      <h2 className={type.heading16}>{title}</h2>
      <p className="font-manrope text-[13px] leading-[18px] text-atlas-slate">{dates}</p>
    </div>
  );
}
