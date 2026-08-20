import type { SVGProps } from 'react';

function Svg(props: SVGProps<SVGSVGElement>) {
  return <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} {...props} />;
}

export const IconPanel = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </Svg>
);

export const IconChart = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </Svg>
);

export const IconUser = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5" />
    <path d="M17 11h5" />
  </Svg>
);

export const IconInbox = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="14" rx="3" />
    <path d="M3 12h5l2 3h4l2-3h5" />
  </Svg>
);

export const IconTarget = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="12" cy="12" r="1" />
  </Svg>
);

export const IconGear = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5" />
    <circle cx="18" cy="16" r="2.5" />
    <path d="M18 12.5v1M18 18.5v1M21 16h-1M16 16h-1" />
  </Svg>
);

export const IconLogout = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5" />
    <path d="M21 12H9" />
  </Svg>
);

export const IconCalendar = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="17" rx="2" />
    <path d="M3 10h18M8 2v4M16 2v4" />
  </Svg>
);

export const IconStar = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="m12 3 1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9Z" />
  </Svg>
);

export const IconDocs = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M4 5a2 2 0 0 1 2-2h4v18H6a2 2 0 0 1-2-2Z" />
    <path d="M20 5a2 2 0 0 0-2-2h-4v18h4a2 2 0 0 0 2-2Z" />
  </Svg>
);

export const IconTray = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="14" rx="3" />
    <path d="M3 12h5l2 3h4l2-3h5" />
  </Svg>
);
