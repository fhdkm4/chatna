interface ChatnaLogoProps {
  className?: string;
  iconOnly?: boolean;
  color?: string;
  height?: number;
}

export function ChatnaLogo({ className = "", iconOnly = false, color = "#4CAF50", height = 32 }: ChatnaLogoProps) {
  const iconW = 32;
  const textW = 145;
  const gap = 8;
  const totalW = iconOnly ? iconW : iconW + gap + textW;
  const scale = height / 32;

  return (
    <svg
      viewBox={`0 0 ${totalW} 32`}
      height={height}
      width={totalW * scale}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      data-testid="logo-chatna"
    >
      <g>
        <path
          d="M16 2C8.268 2 2 7.373 2 14c0 3.442 1.719 6.553 4.5 8.734L5 28l6.5-3.25C12.62 25.25 14.28 25.5 16 25.5c7.732 0 14-4.873 14-11.5S23.732 2 16 2z"
          fill={color}
        />
        <line x1="9" y1="10" x2="21" y2="10" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
        <line x1="9" y1="14.5" x2="17" y2="14.5" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
        <path
          d="M21 14.5 L22.2 17.5 L23.4 14.5 L26 13.3 L23.4 12.1 L22.2 9 L21 12.1 L18.4 13.3 Z"
          fill="white"
        />
      </g>

      {!iconOnly && (
        <text
          x={iconW + gap}
          y="23.5"
          fill={color}
          fontFamily="'IBM Plex Sans Arabic', sans-serif"
          fontSize="23"
          fontWeight="300"
          letterSpacing="4"
        >
          CHATNA
        </text>
      )}
    </svg>
  );
}
