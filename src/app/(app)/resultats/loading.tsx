import { HeaderSkeleton, ListSkeleton, Shimmer } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <Shimmer className="h-9 w-full rounded-full" />
      <HeaderSkeleton />
      <Shimmer className="h-12 w-full rounded-2xl" />
      <ListSkeleton rows={5} height="h-[104px]" />
    </div>
  );
}
