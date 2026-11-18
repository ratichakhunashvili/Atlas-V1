import { enterTestHotelFormAction } from "@/features/hotel-stays/actions";

export type JoinableHotel = { id: string; name: string; address: string | null };

/** Open-join hotels (features/hotel-stays/test-hotel-picker.ts): a row with the name, address and a Join button. */
export function OpenJoinHotels({ hotels }: { hotels: readonly JoinableHotel[] }) {
  return hotels.map((hotel) => (
    <form key={hotel.id} action={enterTestHotelFormAction} className="flex w-full items-center justify-between gap-[12px] rounded-[16px] bg-atlas-sand px-[16px] py-[12px]">
      <input type="hidden" name="hotelId" value={hotel.id} />
      <span className="min-w-0">
        <span className="block font-grotesk text-[17px] font-bold leading-[22px] text-atlas-teal">{hotel.name}</span>
        {hotel.address ? <span className="block font-manrope text-[13px] text-atlas-slate">{hotel.address}</span> : null}
      </span>
      <button type="submit" className="min-h-[44px] shrink-0 rounded-[22px] bg-atlas-teal px-[20px] font-grotesk text-[15px] font-bold text-atlas-paper">
        Join
      </button>
    </form>
  ));
}
