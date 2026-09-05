// Cena de VIAGEM vetorial que vive ATRAS do hero (pedido do Diogo, 05/09:
// "vetor de imagem atras, como no queroconsertar, de viagens... o site ficara
// animado"). Desenho PROPRIO, flat, nas cores da marca — nada copiado de
// terceiros. As animacoes (nuvens deslizando, aviao cruzando, balao flutuando)
// sao CSS puro em app/globals.css e respeitam prefers-reduced-motion.
export default function CenaViagem() {
  return (
    <svg
      className="cena"
      viewBox="0 0 1200 480"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
    >
      {/* ceu */}
      <defs>
        <linearGradient id="cena-ceu" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e8eefc" />
          <stop offset="1" stopColor="#f7f8fc" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="1200" height="480" fill="url(#cena-ceu)" />

      {/* sol */}
      <circle cx="1050" cy="90" r="46" fill="#fde9ee" />
      <circle cx="1050" cy="90" r="28" fill="#f8b7c6" opacity="0.55" />

      {/* nuvens (3 camadas, velocidades diferentes) */}
      <g className="cena-nuvem cena-nuvem-1" fill="#ffffff" opacity="0.95">
        <ellipse cx="0" cy="80" rx="70" ry="22" />
        <ellipse cx="48" cy="68" rx="46" ry="18" />
        <ellipse cx="-42" cy="70" rx="40" ry="16" />
      </g>
      <g className="cena-nuvem cena-nuvem-2" fill="#ffffff" opacity="0.8">
        <ellipse cx="0" cy="150" rx="56" ry="18" />
        <ellipse cx="38" cy="140" rx="36" ry="14" />
      </g>
      <g className="cena-nuvem cena-nuvem-3" fill="#ffffff" opacity="0.65">
        <ellipse cx="0" cy="52" rx="44" ry="14" />
        <ellipse cx="-30" cy="46" rx="28" ry="11" />
      </g>

      {/* balao */}
      <g className="cena-balao">
        <path d="M905 210c0-34 24-58 52-58s52 24 52 58c0 26-20 44-34 54h-36c-14-10-34-28-34-54z" fill="#f80838" opacity="0.85" />
        <path d="M931 210c0-34 11-58 26-58s26 24 26 58c0 26-9 44-16 54h-20c-7-10-16-28-16-54z" fill="#ffffff" opacity="0.35" />
        <path d="M939 264h36l-5 16h-26z" fill="#001b54" />
        <rect x="947" y="280" width="20" height="14" rx="3" fill="#0a2a7a" />
      </g>

      {/* aviao com trilha */}
      <g className="cena-aviao">
        <path d="M-40 120h-150" stroke="#c9d5f2" strokeWidth="3" strokeDasharray="10 12" strokeLinecap="round" fill="none" />
        <g transform="rotate(6)">
          <path d="M0 96 L46 108 L0 120 L10 108 Z" fill="#001b54" />
          <path d="M8 108 L-14 88 L-4 106 Z" fill="#f80838" />
          <path d="M8 110 L-14 130 L-4 111 Z" fill="#f80838" />
        </g>
      </g>

      {/* montanhas ao fundo */}
      <path d="M0 400 L140 300 L260 388 L380 292 L520 400 Z" fill="#dce4f7" />
      <path d="M420 400 L560 316 L700 400 Z" fill="#d0dbf5" />

      {/* skyline generica */}
      <g fill="#c3d0f0">
        <rect x="640" y="330" width="34" height="80" />
        <rect x="682" y="300" width="26" height="110" />
        <rect x="716" y="344" width="40" height="66" />
        <rect x="764" y="316" width="22" height="94" />
        <rect x="794" y="352" width="34" height="58" />
        <rect x="836" y="326" width="28" height="84" />
      </g>
      <g fill="#b2c3ec">
        <rect x="900" y="340" width="30" height="70" />
        <rect x="938" y="356" width="42" height="54" />
        <rect x="988" y="330" width="24" height="80" />
        <path d="M1040 410v-64l14-18 14 18v64z" />
        <rect x="1076" y="352" width="34" height="58" />
        <rect x="1118" y="336" width="26" height="74" />
      </g>

      {/* chao suave */}
      <rect x="0" y="404" width="1200" height="76" fill="#e6ecfa" />
      <path d="M0 404h1200" stroke="#c9d5f2" strokeWidth="2" />
    </svg>
  );
}
