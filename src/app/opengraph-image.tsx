import { ImageResponse } from "next/og";

export const alt = "Karaoké : paroles synchronisées mot par mot";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #1a0533 0%, #2d0a5e 35%, #1e1060 60%, #0a1a4a 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        {/* Logo K */}
        <svg width="180" height="180" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="g" x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
              <stop stopColor="#c084fc" />
              <stop offset="0.55" stopColor="#f472b6" />
              <stop offset="1" stopColor="#fb923c" />
            </linearGradient>
          </defs>
          <rect width="64" height="64" rx="16" fill="#160a2e" />
          <path d="M22 15 V49 M22 33 L41 15 M23.5 31.5 L43 49" stroke="url(#g)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        <div
          style={{
            marginTop: 40,
            fontSize: 96,
            fontWeight: 900,
            background: "linear-gradient(90deg, #c084fc, #f472b6, #fb923c)",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          Karaoké
        </div>
        <div style={{ marginTop: 12, fontSize: 36, color: "rgba(255,255,255,0.6)" }}>
          Paroles synchronisées mot par mot
        </div>
      </div>
    ),
    { ...size }
  );
}
