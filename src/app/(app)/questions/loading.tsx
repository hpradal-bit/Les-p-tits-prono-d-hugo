import { HeaderSkeleton, ListSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <HeaderSkeleton />
      <ListSkeleton rows={4} height="h-32" />
    </div>
  );
}
