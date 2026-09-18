import { HeaderSkeleton, ListSkeleton, SegmentedSkeleton, Shimmer } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <HeaderSkeleton />
      <Shimmer className="h-24 w-full rounded-[var(--radius-card)]" />
      <SegmentedSkeleton items={3} />
      <ListSkeleton rows={5} height="h-28" />
    </div>
  );
}
