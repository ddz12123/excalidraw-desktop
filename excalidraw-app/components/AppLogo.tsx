import { useId } from "react";

export const AppLogo = () => {
  const gradientId = `app-logo-${useId().replace(/:/g, "")}`;

  return (
    <svg viewBox="0 0 1024 1024" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6c63ff" />
          <stop offset="1" stopColor="#4a47b1" />
        </linearGradient>
      </defs>
      <rect width="1024" height="1024" rx="224" fill={`url(#${gradientId})`} />
      <g fill="#fff">
        <rect x="336" y="280" width="96" height="464" rx="28" />
        <rect x="336" y="280" width="352" height="96" rx="28" />
        <rect x="336" y="464" width="288" height="96" rx="28" />
        <rect x="336" y="648" width="352" height="96" rx="28" />
      </g>
    </svg>
  );
};
