import type { Metadata } from "next";
import { PlacesList } from "@/components/atlas-ui/places-list";

/* List · Missions › List — Figma frame 1:252. */

export const metadata: Metadata = { title: "Places" };

export default function ListPage() {
  return <PlacesList />;
}
