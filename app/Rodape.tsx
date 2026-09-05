import Link from "next/link";
import { marcaAtual } from "../lib/marcas";

// Rodape completo do site (estrutura de referencia: Holafly) — colunas de
// navegacao, ajuda e legal. Alem de orientar o cliente, e o que o Google le
// para entender o site: links internos para as paginas que importam.
// Fundo Noite fixo (identidade oficial): o rodape e escuro nas duas marcas e
// nos dois temas, de proposito — e o "chao" da pagina.
export default async function Rodape() {
  const m = await marcaAtual();
  const prefixo = m.nome.endsWith("Sim") ? m.nome.slice(0, -3) : m.nome;
  const ano = new Date().getFullYear();

  return (
    <footer className="pe-site">
      <div className="pe-grade">
        <div className="pe-marca">
          <p className="pe-logo">
            <b>{prefixo}</b>
            <i>{m.nome.endsWith("Sim") ? "Sim" : ""}</i>
          </p>
          <p>
            Internet de viagem sem roaming e sem susto. Compre antes de embarcar, ative
            quando o avião tocar o chão.
          </p>
        </div>

        <div>
          <h3>Comprar</h3>
          <ul>
            <li><Link href="/#planos">Planos</Link></li>
            <li><Link href="/#como">Como funciona</Link></li>
            <li><Link href="/conta/criar">Criar conta</Link></li>
            <li><Link href="/conta">Meus pedidos</Link></li>
          </ul>
        </div>

        <div>
          <h3>Ajuda</h3>
          <ul>
            <li><Link href="/duvidas">Central de dúvidas</Link></li>
            <li><Link href="/duvidas#compatibilidade">Celulares compatíveis</Link></li>
            <li><Link href="/duvidas#instalar">Instalar e ativar</Link></li>
            <li><Link href="/duvidas#problemas">Problemas e soluções</Link></li>
          </ul>
        </div>

        <div>
          <h3>Legal</h3>
          <ul>
            <li><Link href="/termos">Termos de uso</Link></li>
            <li><Link href="/privacidade">Política de privacidade</Link></li>
            <li><Link href="/reembolso">Política de reembolso</Link></li>
          </ul>
        </div>
      </div>

      <div className="pe-baixo">
        <span>© {ano} {m.nome} · pagamento seguro processado pela Stripe</span>
        <span>Feito por quem também odeia roaming. 🛬</span>
      </div>
    </footer>
  );
}
