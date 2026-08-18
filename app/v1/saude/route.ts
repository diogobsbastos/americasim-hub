// GET /v1/saude — usado pelo monitoramento (SPEC/03 §4).
export async function GET() {
  return Response.json({ ok: true, versao: "0.1.0", instante: new Date().toISOString() });
}
