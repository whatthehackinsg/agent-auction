export type AccentTone = "mint" | "gold" | "violet" | "rose";

export const accentStyles: Record<
  AccentTone,
  {
    panel: string;
    border: string;
    headerRule: string;
    label: string;
    value: string;
    muted: string;
    dim: string;
    chip: string;
    glowRgb: string;
  }
> = {
  mint: {
    panel: "bg-[#101b27]/90",
    border: "border-[#58c7ad]",
    headerRule: "border-b-[#31547d]",
    label: "text-[#73d6bd]",
    value: "text-[#6EE7B7]",
    muted: "text-[#93a7ba]",
    dim: "text-[#557090]",
    chip: "bg-[#6EE7B7]",
    glowRgb: "88, 199, 173",
  },
  gold: {
    panel: "bg-[#241b10]/90",
    border: "border-[#d7aa61]",
    headerRule: "border-b-[#635033]",
    label: "text-[#deb678]",
    value: "text-[#F5C46E]",
    muted: "text-[#b4a58a]",
    dim: "text-[#7f6d4f]",
    chip: "bg-[#F5C46E]",
    glowRgb: "215, 170, 97",
  },
  violet: {
    panel: "bg-[#17132d]/90",
    border: "border-[#b79bf0]",
    headerRule: "border-b-[#56407f]",
    label: "text-[#c8b4ff]",
    value: "text-[#A78BFA]",
    muted: "text-[#9c96bb]",
    dim: "text-[#6c6296]",
    chip: "bg-[#A78BFA]",
    glowRgb: "183, 155, 240",
  },
  rose: {
    panel: "bg-[#25121e]/90",
    border: "border-[#d68da6]",
    headerRule: "border-b-[#8f5a6c]",
    label: "text-[#eaa6ba]",
    value: "text-[#FDA4AF]",
    muted: "text-[#b497a3]",
    dim: "text-[#886375]",
    chip: "bg-[#FDA4AF]",
    glowRgb: "214, 141, 166",
  },
};
