import { useId, type SVGProps } from 'react';

/**
 * Kiko, Pathment's mascot: a navy penguin in a leather aviator cap with brass
 * goggles. The guide who keeps you on track.
 *
 * One drawing, many moments. Pick a `mood` for the face and a `pose` for the
 * flippers; anything the mood implies (a wave for a wink, both flippers up to
 * celebrate) is the default, so `<Kiko mood="celebrate" />` is enough.
 *
 * Pure SVG: it scales to any size, works on light and dark surfaces, and needs
 * no image request. A static copy lives in /public/mascot for email and social.
 */

export type KikoMood = 'happy' | 'wink' | 'celebrate' | 'thinking' | 'sleepy' | 'sad' | 'surprised';
export type KikoPose = 'rest' | 'wave' | 'cheer';

export interface KikoProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  mood?: KikoMood;
  /** Flippers. Defaults follow the mood. */
  pose?: KikoPose;
  /** Rendered width in px (height follows). */
  size?: number;
  /** A gentle idle bob. Off when the visitor prefers reduced motion. */
  animated?: boolean;
  /** Spoken name for screen readers; omit for a purely decorative Kiko. */
  title?: string;
}

const DEFAULT_POSE: Record<KikoMood, KikoPose> = {
  happy: 'rest', wink: 'wave', celebrate: 'cheer', thinking: 'rest', sleepy: 'rest', sad: 'rest', surprised: 'cheer',
};

const INK = '#141a33';

export function Kiko({ mood = 'happy', pose, size = 120, animated = false, title, className, ...rest }: KikoProps) {
  // Gradient ids must be unique per instance, and React's ids carry colons,
  // which url(#…) does not accept everywhere.
  const uid = `kiko${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const id = (name: string) => `${uid}-${name}`;
  const url = (name: string) => `url(#${id(name)})`;
  const flippers = pose ?? DEFAULT_POSE[mood];

  return (
    <svg
      viewBox="0 0 200 224"
      width={size}
      height={(size * 224) / 200}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={className}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <radialGradient id={id('body')} cx="35%" cy="28%" r="80%">
          <stop offset="0" stopColor="#4f74dc" />
          <stop offset=".45" stopColor="#253c9a" />
          <stop offset="1" stopColor="#141f57" />
        </radialGradient>
        <radialGradient id={id('flip')} cx="40%" cy="20%" r="90%">
          <stop offset="0" stopColor="#36529f" />
          <stop offset="1" stopColor="#121b4d" />
        </radialGradient>
        <radialGradient id={id('white')} cx="45%" cy="30%" r="75%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".7" stopColor="#f3f5fb" />
          <stop offset="1" stopColor="#d9dfee" />
        </radialGradient>
        <radialGradient id={id('cap')} cx="35%" cy="25%" r="85%">
          <stop offset="0" stopColor="#c9864d" />
          <stop offset=".5" stopColor="#8c4f26" />
          <stop offset="1" stopColor="#5a3016" />
        </radialGradient>
        <linearGradient id={id('brass')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6dca4" />
          <stop offset=".55" stopColor="#c48b45" />
          <stop offset="1" stopColor="#8a5a26" />
        </linearGradient>
        <radialGradient id={id('lens')} cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor="#eefaff" />
          <stop offset=".45" stopColor="#8fd0f5" />
          <stop offset="1" stopColor="#2f7fc4" />
        </radialGradient>
        <linearGradient id={id('beak')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd25e" />
          <stop offset="1" stopColor="#f2841b" />
        </linearGradient>
        <radialGradient id={id('foot')} cx="40%" cy="30%" r="80%">
          <stop offset="0" stopColor="#ffbf5a" />
          <stop offset="1" stopColor="#e2701a" />
        </radialGradient>
        <filter id={id('soft')} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
      </defs>

      {animated ? (
        <style>{`@media (prefers-reduced-motion: no-preference){.${uid}-bob{animation:${uid}-bob 2.8s ease-in-out infinite;transform-origin:100px 210px}@keyframes ${uid}-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px) rotate(-1.5deg)}}}`}</style>
      ) : null}

      {/* Ground shadow stays put while Kiko bobs. */}
      <ellipse cx="100" cy="214" rx="58" ry="6" fill={INK} opacity=".14" />

      <g className={animated ? `${uid}-bob` : undefined}>
        {/* Feet */}
        <ellipse cx="76" cy="205" rx="19" ry="8.5" fill={url('foot')} />
        <ellipse cx="124" cy="205" rx="19" ry="8.5" fill={url('foot')} />

        {/* Flippers behind the body when resting */}
        {flippers === 'rest' || flippers === 'wave' ? (
          <path d="M34 122 C14 136 12 168 27 186 C37 178 42 152 42 130 Z" fill={url('flip')} />
        ) : null}
        {flippers === 'rest' ? (
          <path d="M166 122 C186 136 188 168 173 186 C163 178 158 152 158 130 Z" fill={url('flip')} />
        ) : null}

        {/* Body */}
        <path d="M100 38 C150 38 179 88 179 138 C179 182 146 206 100 206 C54 206 21 182 21 138 C21 88 50 38 100 38 Z" fill={url('body')} />
        <ellipse cx="68" cy="78" rx="22" ry="12" fill="#fff" opacity=".14" transform="rotate(-28 68 78)" />

        {/* Raised flippers, in front so the gesture reads */}
        {flippers === 'wave' || flippers === 'cheer' ? (
          <path d="M156 152 C163 133 175 114 189 103 C197 97 203 106 197 116 C190 130 178 145 166 160 Z" fill={url('flip')} />
        ) : null}
        {flippers === 'cheer' ? (
          <path d="M44 152 C37 133 25 114 11 103 C3 97 -3 106 3 116 C10 130 22 145 34 160 Z" fill={url('flip')} />
        ) : null}

        {/* Belly and heart-shaped face, one continuous white front */}
        <ellipse cx="100" cy="162" rx="50" ry="40" fill={url('white')} />
        <path d="M100 98 C88 80 46 82 44 118 C42 148 70 162 100 162 C130 162 158 148 156 118 C154 82 112 80 100 98 Z" fill={url('white')} />

        {/* Cheeks */}
        <ellipse cx="61" cy="141" rx="10" ry="6" fill="#ff7f9f" opacity=".55" filter={url('soft')} />
        <ellipse cx="139" cy="141" rx="10" ry="6" fill="#ff7f9f" opacity=".55" filter={url('soft')} />

        <Eyes mood={mood} />

        {/* Beak; open when there is something to say */}
        {mood === 'celebrate' || mood === 'surprised' ? (
          <g>
            <path d="M89 133 Q100 126 111 133 Q106 139 100 140 Q94 139 89 133 Z" fill={url('beak')} />
            <path d="M92 140 Q100 137 108 140 Q105 151 100 152 Q95 151 92 140 Z" fill="#7d2f2a" />
            <path d="M95 147 Q100 144 105 147 Q103 151 100 151.5 Q97 151 95 147 Z" fill="#ff8a8a" />
          </g>
        ) : (
          <path
            d="M89 133 Q100 126 111 133 Q105 147 100 148 Q95 147 89 133 Z"
            fill={url('beak')}
            transform={mood === 'sad' ? 'translate(0 2)' : undefined}
          />
        )}
        <ellipse cx="96" cy="131.5" rx="4" ry="1.6" fill="#fff" opacity=".6" />

        {/* Aviator cap */}
        <path d="M29 110 C24 62 58 33 100 33 C142 33 176 62 171 110 C160 97 138 89 100 89 C62 89 40 97 29 110 Z" fill={url('cap')} />
        <path d="M100 35 L100 60" stroke="#5a3016" strokeWidth="2" strokeDasharray="3 3" strokeLinecap="round" opacity=".7" />
        <ellipse cx="72" cy="50" rx="20" ry="8" fill="#fff" opacity=".2" transform="rotate(-20 72 50)" />

        {/* Goggle strap and goggles, pushed up on the cap */}
        <path d="M30 96 C58 74 142 74 170 96" fill="none" stroke="#3f2110" strokeWidth="9" strokeLinecap="round" />
        <rect x="93" y="68" width="14" height="7" rx="3.5" fill={url('brass')} />
        {[77, 123].map((cx) => (
          <g key={cx}>
            <circle cx={cx} cy="72" r="19" fill={url('brass')} />
            <circle cx={cx} cy="72" r="19" fill="none" stroke="#6b4319" strokeWidth="1.5" opacity=".6" />
            <circle cx={cx} cy="72" r="13" fill={url('lens')} />
            <ellipse cx={cx - 4} cy="67" rx="5" ry="3.2" fill="#fff" opacity=".85" transform={`rotate(-30 ${cx - 4} 67)`} />
            <circle cx={cx + 5} cy="78" r="1.6" fill="#fff" opacity=".7" />
          </g>
        ))}
      </g>

      <Extras mood={mood} />
    </svg>
  );
}

function OpenEye({ cx, cy, look = [0, 0], scale = 1 }: { cx: number; cy: number; look?: [number, number]; scale?: number }) {
  const [dx, dy] = look;
  return (
    <g>
      <ellipse cx={cx + dx} cy={cy + dy} rx={12 * scale} ry={14 * scale} fill={INK} />
      <circle cx={cx + dx + 4 * scale} cy={cy + dy - 5 * scale} r={4.4 * scale} fill="#fff" />
      <circle cx={cx + dx - 4 * scale} cy={cy + dy + 5 * scale} r={1.9 * scale} fill="#fff" opacity=".9" />
    </g>
  );
}

/** A closed eye. `up` is a happy ^ curve; otherwise a sleepy downward arc. */
function ClosedEye({ cx, cy, up = true }: { cx: number; cy: number; up?: boolean }) {
  const d = up
    ? `M${cx - 11} ${cy + 4} Q${cx} ${cy - 9} ${cx + 11} ${cy + 4}`
    : `M${cx - 11} ${cy - 1} Q${cx} ${cy + 8} ${cx + 11} ${cy - 1}`;
  return <path d={d} fill="none" stroke={INK} strokeWidth="4.5" strokeLinecap="round" />;
}

function Eyes({ mood }: { mood: KikoMood }) {
  const L = 78, R = 122, Y = 119;
  switch (mood) {
    case 'wink':
      return <><OpenEye cx={L} cy={Y} /><ClosedEye cx={R} cy={Y + 2} /></>;
    case 'celebrate':
      return <><ClosedEye cx={L} cy={Y + 2} /><ClosedEye cx={R} cy={Y + 2} /></>;
    case 'sleepy':
      return <><ClosedEye cx={L} cy={Y + 3} up={false} /><ClosedEye cx={R} cy={Y + 3} up={false} /></>;
    case 'thinking':
      return <><OpenEye cx={L} cy={Y} look={[3, -3]} /><OpenEye cx={R} cy={Y} look={[3, -3]} /></>;
    case 'surprised':
      return <><OpenEye cx={L} cy={Y} scale={1.12} /><OpenEye cx={R} cy={Y} scale={1.12} /></>;
    case 'sad':
      return (
        <>
          <OpenEye cx={L} cy={Y + 2} scale={0.92} />
          <OpenEye cx={R} cy={Y + 2} scale={0.92} />
          <path d="M66 101 L88 97" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
          <path d="M134 101 L112 97" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
        </>
      );
    default:
      return <><OpenEye cx={L} cy={Y} /><OpenEye cx={R} cy={Y} /></>;
  }
}

/** Small marks around Kiko that finish a mood: sparkles, a thought, sleep. */
function Extras({ mood }: { mood: KikoMood }) {
  const sparkle = (x: number, y: number, s: number, fill: string) => (
    <path
      key={`${x}-${y}`}
      d={`M${x} ${y - s} Q${x + s * 0.2} ${y - s * 0.2} ${x + s} ${y} Q${x + s * 0.2} ${y + s * 0.2} ${x} ${y + s} Q${x - s * 0.2} ${y + s * 0.2} ${x - s} ${y} Q${x - s * 0.2} ${y - s * 0.2} ${x} ${y - s} Z`}
      fill={fill}
    />
  );
  if (mood === 'celebrate') return <g>{sparkle(22, 40, 9, '#fbbf24')}{sparkle(182, 30, 7, '#fde68a')}{sparkle(186, 150, 5, '#fbbf24')}</g>;
  if (mood === 'wink') return <g>{sparkle(184, 44, 7, '#fbbf24')}</g>;
  if (mood === 'thinking') {
    return (
      <g fill="#c7d2fe">
        <circle cx="168" cy="44" r="4" /><circle cx="178" cy="30" r="6" />
        <text x="178" y="35" textAnchor="middle" fontSize="11" fontWeight="800" fill="#3730a3" fontFamily="system-ui, sans-serif">?</text>
      </g>
    );
  }
  if (mood === 'sleepy') {
    return (
      <g fill="#93a4d8" fontFamily="system-ui, sans-serif" fontWeight="800">
        <text x="162" y="46" fontSize="14">z</text><text x="174" y="30" fontSize="19">z</text>
      </g>
    );
  }
  return null;
}

export default Kiko;
