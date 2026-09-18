import { BannerSkeleton, ListSkeleton, SegmentedSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col">
      <BannerSkeleton />
      <div className="flex flex-col gap-3.5 px-4 pt-4">
        <SegmentedSkeleton items={2} />
        <ListSkeleton rows={6} height="h-14" />
      </div>
    </div>
  );
}
