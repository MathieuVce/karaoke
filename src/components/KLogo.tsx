// Logo K stylisé (carré arrondi sombre + K en dégradé violet → rose)
export default function KLogo({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-label="Karaoké">
      <defs>
        <linearGradient id="klogo-grad" x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="#c084fc" />
          <stop offset="0.55" stopColor="#f472b6" />
          <stop offset="1" stopColor="#fb923c" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="#160a2e" />
      <rect x="1.5" y="1.5" width="61" height="61" rx="14.5" stroke="url(#klogo-grad)" strokeOpacity="0.35" strokeWidth="3" />
      <path
        d="M22 15 V49 M22 33 L41 15 M23.5 31.5 L43 49"
        stroke="url(#klogo-grad)"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
