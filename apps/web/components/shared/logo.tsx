export function Logo({
  className,
  size,
  color = "currentColor",
}: {
  className?: string;
  size?: number;
  color?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      width={size}
      height={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <clipPath id="globe-clip">
          <circle cx="16" cy="16" r="14" />
        </clipPath>
      </defs>
      <circle cx="16" cy="16" r="14" stroke={color} strokeWidth="1.8" />
      <g clipPath="url(#globe-clip)" transform="rotate(-20 16 16)">
        <ellipse
          cx="16"
          cy="16"
          rx="5.5"
          ry="14"
          stroke={color}
          strokeWidth="1.5"
        />
        <ellipse
          cx="16"
          cy="16"
          rx="14"
          ry="5"
          stroke={color}
          strokeWidth="1.5"
        />
        <circle cx="11" cy="11.5" r="1.5" fill={color} />
        <circle cx="21" cy="11.5" r="1.5" fill={color} />
        <circle cx="11" cy="20.5" r="1.5" fill={color} />
        <circle cx="21" cy="20.5" r="1.5" fill={color} />
      </g>
    </svg>
  );
}
