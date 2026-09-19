import type { ReactNode } from 'react'

function shapeFor(char: string): ReactNode {
  switch (char) {
    case '🔔': return <><path d="M6 17h12l-1.5-2.2V10a4.5 4.5 0 0 0-9 0v4.8L6 17Z" /><path d="M10 20h4" /></>
    case '💧': return <path d="M12 3s-5 5.7-5 10a5 5 0 0 0 10 0c0-4.3-5-10-5-10Z" />
    case '🚻': return <><circle cx="7.5" cy="5" r="2" /><path d="M7.5 8v6M4.5 11h6M6 14v6M9 14v6" /><circle cx="16.5" cy="5" r="2" /><path d="m16.5 8-3.5 8h7l-3.5-8ZM15 16v4M18 16v4" /></>
    case '💊': return <><path d="M8.5 18.5a4.2 4.2 0 0 1-6-6l7-7a4.2 4.2 0 0 1 6 6l-7 7Z" /><path d="m7 8 6 6" /></>
    case '🤕': return <><circle cx="12" cy="12" r="9" /><path d="m7 9 3 2M10 9l-3 2M14 9l3 2M17 9l-3 2M8 17l2-2 2 2 2-2 2 2" /></>
    case '🍽️': return <><path d="M6 3v8M3.5 3v5a2.5 2.5 0 0 0 5 0V3M6 11v10M16 3v18M16 3c3 2 3 7 0 9" /></>
    case '🔄': return <><path d="M19 8a8 8 0 0 0-13-2L4 8" /><path d="M4 4v4h4M5 16a8 8 0 0 0 13 2l2-2M20 20v-4h-4" /></>
    case '🛏️': return <><path d="M3 19V7M21 19v-7a3 3 0 0 0-3-3H9v7M3 16h18M6 9h3" /></>
    case '🌡️': return <><path d="M10 14.8V5a2 2 0 0 1 4 0v9.8a4 4 0 1 1-4 0Z" /><path d="M12 17v-7" /></>
    case '🧼': return <><path d="M4 15h16l-2 5H6l-2-5Z" /><path d="M8 4c0 1.5-1.5 2-1.5 3.5a1.5 1.5 0 0 0 3 0C9.5 6 8 5.5 8 4ZM15 3c0 2-2 2.5-2 4.5a2 2 0 0 0 4 0C17 5.5 15 5 15 3Z" /></>
    case '🧹': return <><path d="m17 3-7 11" /><path d="m8 13 7 4-3 4-8-5 4-3Z" /></>
    case '🗑️': return <><path d="M5 8h14l-1 12H6L5 8ZM8 8V5h8v3M9 12v4M15 12v4" /></>
    case '📞': return <path d="M7 3 4 5c0 8 7 15 15 15l2-3-5-3-2 2c-3-1-5-3-6-6l2-2-3-5Z" />
    case '👓': return <><circle cx="7" cy="14" r="4" /><circle cx="17" cy="14" r="4" /><path d="M11 14h2M3 13l1-6M21 13l-1-6" /></>
    case '🔌': return <><rect x="4" y="2" width="10" height="17" rx="2" /><path d="M8 16h2M14 9h2a4 4 0 0 1 4 4v4M18 17h4M19 17v3M21 17v3" /></>
    case '💡': return <><path d="M8 15a6 6 0 1 1 8 0l-1 2H9l-1-2ZM9 20h6" /></>
    case '😴': return <><path d="M19 14a7 7 0 1 1-9-9 8 8 0 0 0 9 9Z" /><path d="M16 4h4l-4 4h4" /></>
    case '🙋': return <><circle cx="12" cy="6" r="2.5" /><path d="M7 21v-5a5 5 0 0 1 10 0v5M9 21v-5M15 21v-5M8.5 13 5 9V4M5 4 3.5 6M5 4l1.5 2" /></>
    case '✋': return <><path d="M7 3h10l4 4v10l-4 4H7l-4-4V7l4-4Z" /><path d="M8 12h8" /></>
    case '➕': return <><path d="M12 4v16M4 12h16" /></>
    case '✅': return <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 6-7" /></>
    case '🙏': return <><path d="M10.8 19.2V7.4c0-1.5-2-1.8-2.4-.3L6 17.2a4.8 4.8 0 0 1-2 2.9l-1.4.9 3.1 2.1 3.7-2.1a2.1 2.1 0 0 0 1.4-1.8ZM13.2 19.2V7.4c0-1.5 2-1.8 2.4-.3L18 17.2a4.8 4.8 0 0 0 2 2.9l1.4.9-3.1 2.1-3.7-2.1a2.1 2.1 0 0 1-1.4-1.8Z" fill="currentColor" stroke="none" /><path d="M12 1v3M5.5 3.5l2.2 2.2M18.5 3.5l-2.2 2.2M2 8l3 1M22 8l-3 1" /></>
    case '💛': return <path d="M12 20S4 15.5 4 9a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6.5-8 11-8 11Z" />
    case '🔁': return <><path d="m17 3 4 4-4 4M3 7h18M7 21l-4-4 4-4M21 17H3" /></>
    case '❓': return <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.7 2.7 0 1 1 4.3 2.2c-1.2.8-1.8 1.3-1.8 2.8M12 18h.01" /></>
    case '⏳': return <><path d="M6 3h12M6 21h12M7 3c0 5 2 6 5 9-3 3-5 4-5 9M17 3c0 5-2 6-5 9 3 3 5 4 5 9" /></>
    case '💬': return <path d="M4 5h16v12H9l-5 4V5Z" />
    case '⚠️': return <><path d="M12 3 2.5 20h19L12 3Z" /><path d="M12 9v5M12 17h.01" /></>
    case '😣': return <><circle cx="12" cy="12" r="9" /><path d="m7 9 3 2M17 9l-3 2M8 17c2-2 6-2 8 0" /></>
    case '🚨': return <><path d="M6 17h12l-1-8a5 5 0 0 0-10 0l-1 8ZM4 21h16M12 1v3M3 7l2 1M21 7l-2 1" /></>
    case '🫁': return <><path d="M11 11V4M13 11V4M11 10c-2-3-5-2-6 1l-1 7c3 2 7 1 7-3v-5ZM13 10c2-3 5-2 6 1l1 7c-3 2-7 1-7-3v-5Z" /></>
    case '🤢': return <><circle cx="12" cy="12" r="9" /><path d="M8 9h.01M16 9h.01M8 16c2-2 6-2 8 0M7 19l2-2M17 17l2 2" /></>
    case '🩸': return <><path d="M12 3s-5 6-5 10a5 5 0 0 0 10 0c0-4-5-10-5-10Z" /><path d="M12 10v6M9 13h6" /></>
    case '😵‍💫': return <><circle cx="12" cy="12" r="9" /><path d="m7 8 3 2M10 8 7 10M14 8l3 2M17 8l-3 2M8 16c3 2 5-2 8 0" /></>
    case '🤒': return <><circle cx="12" cy="12" r="9" /><path d="M8 9h.01M14 9h.01M8 16h5M17 11v7M15 16h4" /></>
    default: return <circle cx="12" cy="12" r="7" />
  }
}

export default function Emoji({ char, className = '' }: { char: string; className?: string }) {
  return (
    <svg className={`emoji minimal-icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {shapeFor(char)}
    </svg>
  )
}
