import { CardSkeleton, HeaderSkeleton, Shimmer } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-5">
      <HeaderSkeleton />
      <CardSkeleton className="h-[340px] w-full" />
      <Shimmer className="h-9 w-full rounded-[var(--radius-card)]" />
    </div>
  );
}
