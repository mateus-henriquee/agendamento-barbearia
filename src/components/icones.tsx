type P = { className?: string };
const base = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": true } as const;

export const Instagram = ({ className }: P) => (
  <svg {...base} className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
  </svg>
);
export const Facebook = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M13.5 21v-8h2.7l.5-3.2h-3.2V7.7c0-.9.4-1.7 1.8-1.7h1.5V3.2S15.5 3 14.3 3C11.8 3 10.2 4.5 10.2 7.3v2.5H7.5V13h2.7v8h3.3z" />
  </svg>
);
export const TikTok = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M16.6 3h-3.1v11.4a2.5 2.5 0 1 1-2.5-2.5c.2 0 .4 0 .6.1V8.8a5.6 5.6 0 1 0 5 5.6V9a6.9 6.9 0 0 0 3.9 1.2V7.1A4.1 4.1 0 0 1 16.6 3z" />
  </svg>
);
export const YouTube = ({ className }: P) => (
  <svg {...base} className={className}>
    <path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2C2 8.8 2 12 2 12s0 3.2.4 4.8a2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8C22 15.2 22 12 22 12s0-3.2-.4-4.8zM10 15V9l5.2 3L10 15z" />
  </svg>
);
export const WhatsApp = ({ className }: P) => (
  <svg {...base} className={className} width={30} height={30}>
    <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 1.9a8.1 8.1 0 1 1-4.3 15l-.3-.2-2.9.8.8-2.8-.2-.3A8.1 8.1 0 0 1 12 3.9zM8.7 7.6c-.2 0-.5.1-.7.4-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3 2.4.9 2.9.7 3.4.7.5-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3l-1.9-.9c-.3-.1-.5-.1-.7.1l-.9 1.1c-.2.2-.3.2-.6.1-.3-.1-1.2-.4-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.4-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.1c-.2-.5-.4-.5-.6-.5h-.5z" />
  </svg>
);