import { redirect } from "next/navigation";

// A tela mudou de endereco em 02/09/2026: Configuracoes → aba Google & E-mail.
// Este redirect preserva links antigos; CartaoGoogle/acoes/tipos CONTINUAM
// nesta pasta (a aba importa daqui) — nao apagar.
export default function GoogleEEmailAntigo() {
  redirect("/painel/config/google");
}
