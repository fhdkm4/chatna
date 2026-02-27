interface ChatnaLogoProps {
  className?: string;
}

export function ChatnaLogo({ className = "h-11 md:h-14 w-auto object-contain" }: ChatnaLogoProps) {
  return (
    <div className="flex items-center" data-testid="logo-chatna">
      <img
        src="/chatna-logo.png"
        alt="Chatna Logo"
        className={className}
        srcSet="/chatna-logo.png 1x, /chatna-logo.png 2x"
        decoding="sync"
      />
    </div>
  );
}
