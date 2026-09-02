import { redirect } from "next/navigation";

// /painel/config sem aba escolhida cai na primeira.
export default function Config() {
  redirect("/painel/config/google");
}
