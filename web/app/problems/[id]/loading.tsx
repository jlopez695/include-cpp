export default function Loading() {
  return (
    <div className="flex flex-col h-full">
      <div className="h-12 flex items-center px-4 gap-3 bg-bg-1 border-b border-border-soft shrink-0">
        <div className="w-14 h-3 rounded bg-bg-3 animate-pulse" />
        <div className="w-40 h-4 rounded bg-bg-3 animate-pulse" />
      </div>
      <div className="flex-1 flex overflow-hidden">
        <div className="w-[38%] bg-bg-1 border-r border-border-soft p-5 flex flex-col gap-3">
          <div className="w-3/4 h-4 rounded bg-bg-3 animate-pulse" />
          <div className="w-full h-3 rounded bg-bg-3 animate-pulse" />
          <div className="w-full h-3 rounded bg-bg-3 animate-pulse" />
          <div className="w-2/3 h-3 rounded bg-bg-3 animate-pulse" />
        </div>
        <div className="flex-1 bg-[#1e1e1e]" />
      </div>
      <div className="h-6 bg-bg-1 border-t border-border-soft" />
    </div>
  );
}
