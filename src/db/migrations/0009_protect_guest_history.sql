-- Guest history survives an admin's delete button.
--
-- hotel_stays.hotel_id and itinerary_days.hotel_id were ON DELETE CASCADE, so
-- deleting a hotel silently erased every stay at it and every itinerary and
-- completed visit inside those stays. They are now RESTRICT: the database refuses.
--
-- No data is changed or dropped — only the constraints are rebuilt. A hotel with
-- no guest history still deletes; one with history must be kept (hotel archival is
-- not implemented and is flagged as an open product decision).

ALTER TABLE "hotel_stays" DROP CONSTRAINT "hotel_stays_hotel_id_hotels_id_fk";
--> statement-breakpoint
ALTER TABLE "itinerary_days" DROP CONSTRAINT "itinerary_days_hotel_id_hotels_id_fk";
--> statement-breakpoint
ALTER TABLE "hotel_stays" ADD CONSTRAINT "hotel_stays_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_days" ADD CONSTRAINT "itinerary_days_hotel_id_hotels_id_fk" FOREIGN KEY ("hotel_id") REFERENCES "public"."hotels"("id") ON DELETE restrict ON UPDATE no action;