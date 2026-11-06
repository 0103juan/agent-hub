const MAX_DETAIL_LENGTH = 70;

/** Resume una llamada a herramienta en una línea legible para la interfaz. */
export function describeToolCall(name: string, input: unknown): string {
  const params = (input ?? {}) as Record<string, unknown>;
  const detail =
    params.file_path ?? params.Path ?? params.AbsolutePath ?? params.path ??
    params.command ?? params.CommandLine ?? params.pattern ?? params.Pattern ?? params.query;
  if (typeof detail !== 'string' || !detail) return name;
  const oneLine = detail.replace(/\s+/g, ' ').trim();
  return `${name}: ${oneLine.length > MAX_DETAIL_LENGTH ? `${oneLine.slice(0, MAX_DETAIL_LENGTH)}…` : oneLine}`;
}
