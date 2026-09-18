import { BannerSkeleton, ListSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="-mx-4 flex flex-col">
      <BannerSkeleton />
      <div className="flex flex-col gap-3.5 px-4 pt-4">
        <ListSkeleton rows={5} height="h-16" />
      </div>
    </div>
  );
}
