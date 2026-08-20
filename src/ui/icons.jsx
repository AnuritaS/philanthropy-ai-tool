/**
 * Inline stroke icons.
 *
 * Drawn here rather than loaded from an icon CDN: the published page should
 * have no external requests, and a missing icon font would leave the interface
 * covered in tofu boxes.
 */

const PATHS = {
  'wave-sine': <path d="M3 12c1.5-6 3.5-6 5 0s3.5 6 5 0 3.5-6 5 0" />,
  download: <><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /><path d="M7 11l5 5 5-5" /><path d="M12 4v12" /></>,
  'math-function': <><path d="M14 10h-4v10" /><path d="M9 14h4" /><path d="M17 7a2 2 0 0 0-2-2h-1a2 2 0 0 0-2 2v1" /><path d="M4 20h2" /></>,
  'alert-triangle': <><path d="M10.24 4.5 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.76 4.5a2 2 0 0 0-3.52 0z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>,
  leaf: <><path d="M5 21c.5-4.5 2.5-8 6-10" /><path d="M19 5c1 8-3.5 13-9 13a5 5 0 0 1-5-5c0-5.5 5-9 14-8z" /></>,
  target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="1" /></>,
  'map-pin': <><path d="M12 21s-6-5.5-6-10a6 6 0 1 1 12 0c0 4.5-6 10-6 10z" /><circle cx="12" cy="11" r="2.5" /></>,
  sparkles: <><path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z" /><path d="M18 15l.7 1.9L20.6 18l-1.9.7L18 21l-.7-2.3L15.4 18l1.9-1.1z" /></>,
  'chevron-right': <path d="M9 6l6 6-6 6" />,
  'cloud-upload': <><path d="M7 17a4 4 0 0 1-.6-7.95 5.5 5.5 0 0 1 10.7-1.6A3.75 3.75 0 0 1 17.5 17H17" /><path d="M12 20v-8" /><path d="M9 15l3-3 3 3" /></>,
  'file-spreadsheet': <><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M19 9v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7z" /><path d="M8 12h8" /><path d="M8 16h8" /><path d="M12 12v4" /></>,
  'arrow-right': <><path d="M5 12h13" /><path d="M13 7l5 5-5 5" /></>,
  wand: <><path d="M6 21l12-12" /><path d="M15 6l3 3" /><path d="M9 4l.6 1.6L11 6l-1.4.6L9 8l-.6-1.4L7 6l1.4-.4z" /><path d="M18 14l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5z" /></>,
  check: <path d="M5 12l5 5L19 7" />,
  'circle-check': <><circle cx="12" cy="12" r="9" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></>,
  refresh: <><path d="M20 11a8 8 0 1 0-.6 4" /><path d="M20 5v6h-6" /></>,
  database: <><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.66 3.13 3 7 3s7-1.34 7-3V6" /><path d="M5 12v6c0 1.66 3.13 3 7 3s7-1.34 7-3v-6" /></>,
  scale: <><path d="M12 4v16" /><path d="M7 8h10" /><path d="M5 8l-2.5 6h5z" /><path d="M19 8l-2.5 6h5z" /></>,
  'chart-bar': <><path d="M5 20V10" /><path d="M12 20V4" /><path d="M19 20v-7" /></>,
};

export function Icon({ name, size = 16, color = 'currentColor', style, className }) {
  const path = PATHS[name];
  if (!path) return null;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={{ flex: 'none', display: 'block', ...style }}
    >
      {path}
    </svg>
  );
}

export default Icon;
