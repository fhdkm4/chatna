interface ChatnaLogoProps {
  className?: string;
  iconOnly?: boolean;
  size?: "sm" | "md" | "lg";
}

export function ChatnaLogo({ className = "", iconOnly = false, size = "md" }: ChatnaLogoProps) {
  const sizes = {
    sm: { icon: "h-8", text: "text-lg", gap: "gap-2" },
    md: { icon: "h-10 md:h-12", text: "text-[22px] md:text-[26px]", gap: "gap-3" },
    lg: { icon: "h-12 md:h-14", text: "text-[26px] md:text-[30px]", gap: "gap-3" },
  };

  const s = sizes[size];

  if (iconOnly) {
    return (
      <div className={`flex items-center ${className}`} data-testid="logo-chatna">
        <img
          src="/chatna-icon.png"
          alt="Chatna"
          className={`${s.icon} w-auto object-contain`}
          decoding="sync"
        />
      </div>
    );
  }

  return (
    <div className={`flex items-center ${s.gap} ${className} group`} data-testid="logo-chatna">
      <img
        src="/chatna-icon.png"
        alt="Chatna"
        className={`${s.icon} w-auto object-contain transition-transform duration-300 group-hover:scale-110`}
        decoding="sync"
      />
      <span
        className={`${s.text} font-semibold tracking-[1.5px] text-[var(--primary-green)]`}
        style={{ fontFamily: "inherit" }}
      >
        CHATNA
      </span>
    </div>
  );
}
