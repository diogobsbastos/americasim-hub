// Icones de linha da loja (estilo do guia de identidade: traço fino, cor via
// currentColor — navy nos cartões, crimson nos destaques). SVG proprio, nada
// copiado de terceiros.
const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

function Svg({ children }: { children: React.ReactNode }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true" {...P}>
      {children}
    </svg>
  );
}

export function IcoIlimitado() {
  return (
    <Svg>
      <path d="M8.5 9.5c-1.9 0-3.5 1.1-3.5 2.5s1.6 2.5 3.5 2.5c2.8 0 4.2-5 7-5 1.9 0 3.5 1.1 3.5 2.5s-1.6 2.5-3.5 2.5c-2.8 0-4.2-5-7-5z" />
    </Svg>
  );
}

export function IcoRede() {
  return (
    <Svg>
      <path d="M4 18v-2M8.5 18v-5M13 18V9M17.5 18V5" />
    </Svg>
  );
}

export function IcoQr() {
  return (
    <Svg>
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <path d="M14 14h3v3h-3zM20 14v2M17 20h3" />
    </Svg>
  );
}

export function IcoChat() {
  return (
    <Svg>
      <path d="M20 12a8 8 0 1 0-3.1 6.3L20 19l-.6-3A7.9 7.9 0 0 0 20 12z" />
      <path d="M8.5 11h.01M12 11h.01M15.5 11h.01" strokeWidth={2.4} />
    </Svg>
  );
}

export function IcoEscudo() {
  return (
    <Svg>
      <path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z" />
      <path d="M9 11.5l2 2 4-4" />
    </Svg>
  );
}

export function IcoAviao() {
  return (
    <Svg>
      <path d="M10.5 13.5L3 11l1.5-1.5L10 10l4.5-4.5c.6-.6 1.6-.6 2.1 0 .6.6.6 1.6 0 2.1L12 12l.5 5.5L11 19l-2.5-7.5" />
    </Svg>
  );
}

export function IcoCadeado() {
  return (
    <Svg>
      <rect x="5.5" y="10.5" width="13" height="9" rx="2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5M12 14v2.5" />
    </Svg>
  );
}

export function IcoCelular() {
  return (
    <Svg>
      <rect x="7.5" y="3.5" width="9" height="17" rx="2" />
      <path d="M11 6h2M12 17.5h.01" strokeWidth={2.2} />
    </Svg>
  );
}

export function IcoLivro() {
  return (
    <Svg>
      <path d="M12 6c-1.5-1.3-3.6-2-6-2v14c2.4 0 4.5.7 6 2 1.5-1.3 3.6-2 6-2V4c-2.4 0-4.5.7-6 2v14" />
    </Svg>
  );
}

export function IcoFerramenta() {
  return (
    <Svg>
      <path d="M14.5 6.5a4 4 0 0 0-5.4 4.9L4 16.5 7.5 20l5.1-5.1a4 4 0 0 0 4.9-5.4l-2.6 2.6-2.4-.6-.6-2.4 2.6-2.6z" />
    </Svg>
  );
}
