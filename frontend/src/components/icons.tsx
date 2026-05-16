export function PlayIcon({ small }: { small?: boolean } = {}) {
  return (
    <svg width={small ? 9 : 11} height={small ? 10 : 12} viewBox="0 0 14 13" fill="currentColor">
      <polygon points="3.5,1 13.5,6.5 3.5,12" />
    </svg>
  );
}

export function PauseIcon({ small }: { small?: boolean } = {}) {
  return (
    <svg width={small ? 10 : 12} height={small ? 10 : 12} viewBox="0 0 12 12" fill="currentColor">
      <rect x="1.6" y="1.75" width="3.4" height="8.5" rx="1" />
      <rect x="7" y="1.75" width="3.4" height="8.5" rx="1" />
    </svg>
  );
}
