interface ChatnaLogoProps {
  className?: string;
  iconOnly?: boolean;
  size?: "sm" | "md" | "lg";
}

export function ChatnaLogo({ className = "", iconOnly = false, size = "md" }: ChatnaLogoProps) {
  const sizes = {
    sm: { icon: "h-7 md:h-8", text: "text-base md:text-lg", gap: "gap-2.5" },
    md: { icon: "h-8 md:h-9", text: "text-lg md:text-xl", gap: "gap-3" },
    lg: { icon: "h-7 sm:h-8 md:h-9", text: "text-lg sm:text-xl md:text-[22px]", gap: "gap-3 md:gap-4" },
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
    <div className={`flex flex-row-reverse items-center ${s.gap} ${className} group`} data-testid="logo-chatna">
      <img
        src="/chatna-icon.png"
        alt="Chatna"
        className={`${s.icon} w-auto object-contain transition-transform duration-300 group-hover:scale-105`}
        decoding="sync"
      />
      <span className={`${s.text} font-bold tracking-[2px] text-white`}>
        CHATNA
      </span>
    </div>
  );
}
