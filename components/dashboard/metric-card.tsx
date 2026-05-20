import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  tone = "default"
}: {
  label: string;
  value: string | number;
  tone?: "default" | "alert" | "success";
}) {
  return (
    <div
      className={cn(
        "rounded-[24px] border border-line/70 p-4 shadow-panel",
        tone === "default" && "bg-white/85",
        tone === "alert" && "bg-dangerSoft/70",
        tone === "success" && "bg-accentSoft/80"
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-bold tracking-tight text-ink">{value}</p>
    </div>
  );
}
