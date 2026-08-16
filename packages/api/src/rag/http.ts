export async function postJson<TResponse>(
  url: string,
  body: object,
  signal: AbortSignal,
): Promise<TResponse> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    throw new Error(`POST ${url} failed with status ${response.status}`);
  }
  return (await response.json()) as TResponse;
}

export function resolveEndpoint(baseUrl: string, path: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  return trimmed.endsWith(path) ? trimmed : `${trimmed}${path}`;
}
