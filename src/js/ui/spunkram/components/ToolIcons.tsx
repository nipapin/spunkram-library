type IconProps = {
  className?: string;
};

export const CaptionsIcon = ({ className }: IconProps) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden
  >
    <rect
      x="3.5"
      y="5.5"
      width="17"
      height="13"
      rx="2.5"
      stroke="currentColor"
      strokeWidth="1.6"
    />
    <path
      d="M7 10.5h6M7 14h10"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

export const ChapterIcon = ({ className }: IconProps) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden
  >
    <text
      x="4"
      y="10"
      fill="currentColor"
      fontSize="7"
      fontWeight="600"
      fontFamily="system-ui, sans-serif"
    >
      1
    </text>
    <text
      x="4"
      y="17.5"
      fill="currentColor"
      fontSize="7"
      fontWeight="600"
      fontFamily="system-ui, sans-serif"
    >
      2
    </text>
    <path
      d="M10 7.5H20M10 12H20M10 16.5H16.5"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

export const VoiceoverIcon = ({ className }: IconProps) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden
  >
    <rect
      x="9"
      y="3.5"
      width="6"
      height="10"
      rx="3"
      stroke="currentColor"
      strokeWidth="1.6"
    />
    <path
      d="M6.5 11.5a5.5 5.5 0 0 0 11 0"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
    <path
      d="M12 17v3.5M9 20.5h6"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

export const SilenceCutIcon = ({ className }: IconProps) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden
  >
    <circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="7" cy="17" r="2.5" stroke="currentColor" strokeWidth="1.6" />
    <path
      d="M9.2 8.6 19.5 4.5M9.2 15.4 19.5 19.5"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
    <path
      d="M14 12h5"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);
