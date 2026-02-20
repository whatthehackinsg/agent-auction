import { PixelTrailLayer } from "./PixelTrailLayer";

const floatingPixels = [
  { left: "6%", top: 300, size: 24, color: "#FDA4AF" },
  { left: "83%", top: 700, size: 16, color: "#C4B5FD" },
  { left: "14%", top: 1280, size: 32, color: "#F5C46E" },
];

const tinyPixels = [
  { left: "14%", top: 180, color: "#F5C46E" },
  { left: "14%", top: 220, color: "#F5C46E" },
  { left: "17%", top: 220, color: "#F5C46E" },
  { left: "17%", top: 180, color: "#F5C46E" },
  { left: "83%", top: 248, color: "#C4B5FD" },
  { left: "84.5%", top: 248, color: "#C4B5FD" },
  { left: "86%", top: 248, color: "#C4B5FD" },
  { left: "12%", top: 980, color: "#F5C46E" },
  { left: "90%", top: 1468, color: "#A78BFA" },
];

const twinklePixels = [
  { left: "4%", top: 136, size: 2, color: "#6EE7B7" },
  { left: "19%", top: 88, size: 2, color: "#A78BFA" },
  { left: "34%", top: 134, size: 3, color: "#FDA4AF" },
  { left: "52%", top: 158, size: 2, color: "#6EE7B7" },
  { left: "66%", top: 122, size: 2, color: "#F5C46E" },
  { left: "77%", top: 96, size: 2, color: "#A78BFA" },
  { left: "91%", top: 146, size: 2, color: "#FDA4AF" },
  { left: "8%", top: 532, size: 2, color: "#C4B5FD" },
  { left: "24%", top: 604, size: 3, color: "#6EE7B7" },
  { left: "40%", top: 680, size: 2, color: "#F5C46E" },
  { left: "58%", top: 614, size: 2, color: "#A78BFA" },
  { left: "75%", top: 644, size: 3, color: "#FDA4AF" },
  { left: "89%", top: 578, size: 2, color: "#6EE7B7" },
  { left: "10%", top: 1008, size: 2, color: "#A78BFA" },
  { left: "26%", top: 1044, size: 2, color: "#FDA4AF" },
  { left: "38%", top: 1120, size: 2, color: "#6EE7B7" },
  { left: "54%", top: 1068, size: 3, color: "#F5C46E" },
  { left: "68%", top: 1102, size: 2, color: "#A78BFA" },
  { left: "82%", top: 1166, size: 2, color: "#6EE7B7" },
  { left: "94%", top: 1228, size: 2, color: "#FDA4AF" },
  { left: "14%", top: 1496, size: 2, color: "#6EE7B7" },
  { left: "33%", top: 1602, size: 2, color: "#F5C46E" },
  { left: "57%", top: 1542, size: 3, color: "#A78BFA" },
  { left: "79%", top: 1622, size: 2, color: "#FDA4AF" },
];

const separators = [250, 550, 850, 1150, 1450];

function ModePanel({
  title,
  subtitle,
  color,
  edgeColor,
  bgColor,
  className,
}: {
  title: string;
  subtitle: string;
  color: string;
  edgeColor: string;
  bgColor: string;
  className: string;
}) {
  return (
    <div
      className={className}
      style={{
        backgroundColor: bgColor,
        borderTop: `1px solid ${edgeColor}`,
        borderRight: `1px solid ${edgeColor}`,
        borderBottom: `2px solid ${edgeColor}`,
        borderLeft: `3px solid ${edgeColor}`,
      }}
    >
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color }}>
        {title}
      </p>
      <p className="mt-2 font-mono text-[10px] text-[#6d7497]">{subtitle}</p>
      <span
        className="absolute left-0 top-0 h-2 w-2 -translate-x-1 -translate-y-1"
        style={{ backgroundColor: color }}
      />
    </div>
  );
}

export function DoodleBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-[-5%] animate-bg-drift-slow opacity-40 [background-image:radial-gradient(circle_at_20%_20%,rgba(104,95,172,0.22)_0,transparent_44%),radial-gradient(circle_at_78%_28%,rgba(78,166,151,0.2)_0,transparent_42%),radial-gradient(circle_at_52%_82%,rgba(224,167,103,0.16)_0,transparent_40%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#111935_0%,#080f20_52%,#04050a_100%)]" />
      <div className="absolute inset-0 animate-grid-breathe opacity-60 [background-image:radial-gradient(circle,_rgba(43,66,108,0.8)_1px,_transparent_1px)] [background-size:10px_10px]" />
      <div className="absolute inset-0 animate-scanline-shift opacity-45 [background-image:repeating-linear-gradient(to_bottom,rgba(14,20,42,0)_0,rgba(14,20,42,0)_4px,rgba(24,36,66,0.35)_5px)] [background-size:100%_6px]" />
      <PixelTrailLayer />

      <div className="absolute left-[92px] top-0 h-full w-px bg-[#121d34]" />
      <div className="absolute right-[92px] top-0 h-full w-px bg-[#121d34]" />
      <div className="absolute inset-x-0 top-[96px] h-px bg-[#10182d]" />
      <div className="absolute inset-x-0 bottom-[148px] h-px bg-[#10182d]" />

      {separators.map((line, index) => (
        <div
          key={line}
          className={`absolute inset-x-0 h-px ${index % 2 === 0 ? "bg-[#1E1E32]" : "bg-[#161625]"}`}
          style={{ top: line }}
        />
      ))}

      <p className="absolute right-[7%] top-[156px] hidden animate-watermark-flicker font-mono text-[48px] font-bold leading-none text-[#16294a] lg:block xl:text-[72px]">
        AUCTION_PURPOSE
      </p>
      <p className="absolute right-[6.7%] top-[161px] hidden animate-watermark-flicker font-mono text-[48px] font-bold leading-none text-[#274574] lg:block xl:text-[72px]">
        AUCTION_PURPOSE
      </p>

      <ModePanel
        title="MODE_01 :: IDENTITY"
        subtitle="erc-8004 + runtime session"
        color="#84e4cb"
        edgeColor="#58c7ad"
        bgColor="#0a1b19"
        className="absolute left-[48px] top-[54px] hidden h-[86px] w-[240px] animate-panel-float p-3 lg:block xl:left-[56px] xl:w-[258px]"
      />
      <ModePanel
        title="MODE_02 :: LIVE_BIDDING"
        subtitle="sequenced bids + room state"
        color="#ebc486"
        edgeColor="#d7aa61"
        bgColor="#20180d"
        className="absolute left-1/2 top-[82px] hidden h-[86px] w-[250px] -translate-x-1/2 animate-panel-float p-3 lg:block xl:w-[278px]"
      />
      <ModePanel
        title="MODE_03 :: SETTLEMENT"
        subtitle="CRE verify -> escrow finality"
        color="#eaa6ba"
        edgeColor="#d68da6"
        bgColor="#20111a"
        className="absolute right-[48px] top-[48px] hidden h-[92px] w-[274px] animate-panel-float p-3 lg:block xl:right-[108px] xl:w-[322px]"
      />

      <div className="absolute left-1/2 top-[206px] hidden h-[46px] w-[min(1040px,calc(100%-120px))] -translate-x-1/2 lg:block">
        <div className="absolute inset-x-0 top-[12px] h-[2px] bg-[#4c6db0]" />
        <div className="absolute inset-x-0 top-[18px] h-px bg-[#2c4a82]" />
        <div className="absolute inset-x-0 top-[24px] h-px bg-[#1d3663]" />
        <span className="absolute left-0 top-[6px] h-6 w-28 animate-route-scan bg-[linear-gradient(90deg,transparent,rgba(145,196,255,0.75),transparent)]" />
        <span className="absolute left-[2%] top-0 h-7 w-7 bg-[#62d8b3]" />
        <span className="absolute left-[48%] top-0 h-7 w-7 bg-[#dfb66f]" />
        <span className="absolute left-[94%] top-0 h-7 w-7 bg-[#ad93ea]" />
        <p className="absolute left-[1%] top-[38px] font-mono text-[11px] font-bold text-[#75cdb1]">
          IDENTITY_PATH
        </p>
        <p className="absolute left-[45%] top-[38px] font-mono text-[11px] font-bold text-[#caa66a]">
          LIVE_BIDDING_PATH
        </p>
        <p className="absolute left-[89%] top-[38px] font-mono text-[11px] font-bold text-[#ce89a0]">
          SETTLEMENT_PATH
        </p>
      </div>

      {floatingPixels.map((pixel, index) => (
        <span
          key={`${pixel.left}-${pixel.top}`}
          className="absolute animate-pixel-float"
          style={{
            left: pixel.left,
            top: pixel.top,
            width: pixel.size,
            height: pixel.size,
            backgroundColor: pixel.color,
            animationDelay: `${index * 0.7}s`,
            animationDuration: `${8 + index * 2}s`,
          }}
        />
      ))}

      {tinyPixels.map((pixel, index) => (
        <span
          key={`${pixel.left}-${pixel.top}-${pixel.color}`}
          className="absolute h-1 w-1 animate-pixel-twinkle"
          style={{
            left: pixel.left,
            top: pixel.top,
            backgroundColor: pixel.color,
            animationDelay: `${index * 0.22}s`,
            animationDuration: `${2.1 + (index % 4) * 0.6}s`,
          }}
        />
      ))}

      {twinklePixels.map((pixel, index) => (
        <span
          key={`${pixel.left}-${pixel.top}-${pixel.color}-${pixel.size}`}
          className="absolute animate-pixel-spark"
          style={{
            left: pixel.left,
            top: pixel.top,
            width: pixel.size,
            height: pixel.size,
            backgroundColor: pixel.color,
            animationDelay: `${index * 0.18}s`,
            animationDuration: `${1.4 + (index % 5) * 0.45}s`,
          }}
        />
      ))}

      <p className="absolute left-[9%] top-[284px] font-mono text-[10px] font-bold text-[#5ba696]">
        {"// identity first"}
      </p>
      <p className="absolute right-[7%] top-[286px] font-mono text-[10px] font-bold text-[#4f6fa8]">
        [ doodle: keep bids fair ]
      </p>
      <p className="absolute left-[13%] top-[352px] font-mono text-base font-bold text-[#355387]">{`{`}</p>
      <p className="absolute right-[20%] top-[352px] font-mono text-base font-bold text-[#355387]">{`}`}</p>
      <p className="absolute left-[87%] top-[516px] font-mono text-sm font-bold text-[#84e4cb]">+</p>
      <p className="absolute left-[13%] top-[978px] font-mono text-sm font-bold text-[#ebc486]">+</p>
    </div>
  );
}
