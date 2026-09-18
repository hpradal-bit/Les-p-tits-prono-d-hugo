import { HeaderSkeleton, ListSkeleton, Shimmer } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Shimmer className="size-16 rounded-full" />
        <HeaderSkeleton className="flex-1" />
      </div>
      <ListSkeleton rows={4} height="h-20" />
    </div>
  );
}
