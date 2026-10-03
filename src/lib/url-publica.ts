/**
 * Endereço público do site, para dizer ao Mercado Pago onde avisar.
 * Prefere APP_URL. Sem ela, usa o endereço pelo qual o cliente chegou (a Vercel informa em x-forwarded-host).
 */
export function urlPublica(req: Request, env: Record<string, string | undefined> = process.env): string {
  const configurada = env.APP_URL?.trim();
  if (configurada) return configurada.replace(/\/$/, "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) {
    const proto = req.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
    return `${proto}://${host}`;
  }
  return new URL(req.url).origin;
}
