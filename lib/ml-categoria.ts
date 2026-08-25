import { mlFetch } from "./mercadolivre";

// Achar a categoria certa no Mercado Livre.
//
// Ate 25/08 a categoria era digitada na mao no painel: alguem precisava saber
// que "MLB270052" e Cartoes SIM. Isso e conhecimento que mora numa cabeca so e
// some junto com ela — e errar a categoria nao da erro na hora, da anuncio no
// lugar errado, sem visitas, descoberto semanas depois.
//
// O ML tem um classificador proprio: manda-se o titulo, ele responde onde
// aquilo se encaixa. E a opiniao da casa, que vale mais que o nosso palpite.

export type CategoriaSugerida = {
  id: string;
  nome: string;
  caminho: string; // "Celulares e Telefones > Acessorios > Cartoes SIM"
  dominio: string;
};

// O caminho completo importa: o nome curto engana. Existe mais de uma categoria
// chamada "Outros", e escolher a errada so aparece quando o anuncio nao vende.
async function caminhoDa(canalId: string, categoriaId: string): Promise<string> {
  try {
    const c: any = await mlFetch(canalId, `/categories/${categoriaId}`);
    const partes = (c?.path_from_root ?? []).map((x: any) => String(x?.name ?? ""));
    return partes.join(" > ");
  } catch {
    return "";
  }
}

export async function sugerirCategorias(
  canalId: string,
  texto: string,
): Promise<CategoriaSugerida[]> {
  const q = String(texto ?? "").trim();
  if (q.length < 3) return [];

  let achados: any[] = [];
  try {
    achados = await mlFetch(
      canalId,
      `/sites/MLB/domain_discovery/search?limit=6&q=${encodeURIComponent(q)}`,
    );
  } catch {
    return [];
  }
  if (!Array.isArray(achados)) return [];

  // Sem repetir: o classificador as vezes devolve a mesma categoria por
  // dominios diferentes, e uma lista com o mesmo item tres vezes nao ajuda
  // ninguem a escolher.
  const vistos = new Set<string>();
  const unicos = achados.filter((a: any) => {
    const id = String(a?.category_id ?? "");
    if (!id || vistos.has(id)) return false;
    vistos.add(id);
    return true;
  });

  return Promise.all(
    unicos.map(async (a: any) => ({
      id: String(a?.category_id ?? ""),
      nome: String(a?.category_name ?? ""),
      caminho: await caminhoDa(canalId, String(a?.category_id ?? "")),
      dominio: String(a?.domain_name ?? ""),
    })),
  );
}
