interface ChatnaLogoProps {
  className?: string;
  height?: number;
}

export function ChatnaLogo({ className = "", height = 42 }: ChatnaLogoProps) {
  return (
    <div className={`brand ${className}`} style={{ display: "flex", alignItems: "center", gap: "12px" }} data-testid="logo-chatna">
      <img
        src="/chatna-logo.png"
        alt="Chatna Logo"
        className="logo"
        style={{ height: `${height}px`, width: "auto" }}
        width={Math.round(height * 1.5)}
        height={height}
        decoding="sync"
      />
    </div>
  );
}
