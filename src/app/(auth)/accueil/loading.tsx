import { CardSkeleton, HeaderSkeleton, ListSkeleton, Shimmer } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <HeaderSkeleton />
      <ListSkeleton rows={2} height="h-[72px]" />
      <div className="flex flex-col gap-2.5">
        <Shimmer className="h-[54px] w-full rounded-full" />
        <Shimmer className="h-[54px] w-full rounded-full" />
      </div>
      <CardSkeleton className="h-16 w-full" />
    </div>
  );
}
