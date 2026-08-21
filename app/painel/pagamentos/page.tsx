import { redirect } from "next/navigation";

// `/painel/pagamentos` nao tem tela propria: a primeira aba e a resposta.
// Uma "visao geral" aqui repetiria o que as abas ja mostram e viraria mais um
// lugar para desatualizar.
export default function Pagamentos() {
  redirect("/painel/pagamentos/conta");
}
