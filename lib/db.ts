import { Pool } from "pg";

// Um pool por processo. O global evita abrir pool novo a cada recarga de modulo
// (dev) e garante uma unica instancia no processo do Next em producao.
const g = globalThis as unknown as { _amPool?: Pool };

export const db: Pool =
  g._amPool ??
  (g._amPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
  }));
