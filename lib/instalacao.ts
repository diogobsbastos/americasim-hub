// Links de instalacao "1 toque" do eSIM — fonte unica da verdade.
//
// Apple (iOS 17.4+) e Android (10+, com servicos do Google) mantem paginas
// oficiais que abrem o instalador de eSIM do aparelho com o codigo ja
// preenchido — o mesmo caminho que Airalo/Holafly usam. Quem nao suporta cai
// no QR ou no codigo manual, que continuam na tela e no e-mail.
//
// Regra: LPA vazio => link vazio. Um botao "Instalar" apontando para uma
// pagina sem carddata instala nada e queima confianca.

export function linkInstalacaoApple(lpa: string): string {
  if (!lpa) return "";
  return `https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=${encodeURIComponent(lpa)}`;
}

export function linkInstalacaoAndroid(lpa: string): string {
  if (!lpa) return "";
  return `https://esimsetup.android.com/esim_qrcode_provisioning?carddata=${encodeURIComponent(lpa)}`;
}
