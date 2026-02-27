interface ChatnaLogoProps {
  className?: string;
  iconOnly?: boolean;
}

export function ChatnaLogo({ className = "", iconOnly = false }: ChatnaLogoProps) {
  if (iconOnly) {
    return (
      <div className={`flex items-center ${className}`} data-testid="logo-chatna">
        <img
          src="/chatna-icon.png"
          alt="Chatna"
          className="h-9 w-auto object-contain"
          decoding="sync"
        />
      </div>
    );
  }

  return (
    <div className={`flex items-center ${className}`} data-testid="logo-chatna">
      <img
        src="/chatna-logo.svg"
        alt="Chatna"
        width="420"
        height="90"
        className="w-auto object-contain"
        style={{ height: "50px" }}
        decoding="sync"
      />
    </div>
  );
}
