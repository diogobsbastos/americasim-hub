import { headers } from "next/headers";
import { MARCAS, MARCA_PADRAO, type Marca } from "./marcas-dados";

// Uma base, N vitrines — SPEC/07 e decisão 5 de 17/08.
//
// Os DADOS das vitrines (a tabela de marcas, os tokens de cor, o gerador de
// CSS) moraram aqui até 07/09; agora vivem em ./marcas-dados, que não importa
// `next/headers` e por isso pode ser testado. Este arquivo ficou só com o que
// depende da requisição. Tudo continua sendo exportado daqui — os 15
// importadores não mudaram.
export { MARCA_PADRAO, MARCAS, cssDaMarca } from "./marcas-dados";
export type { Marca } from "./marcas-dados";

export async function hostAtual(): Promise<string> {
  const h = await headers();
  const bruto = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  return bruto.split(":")[0].trim().toLowerCase();
}

export async function marcaAtual(): Promise<Marca> {
  return MARCAS[await hostAtual()] ?? MARCA_PADRAO;
}
