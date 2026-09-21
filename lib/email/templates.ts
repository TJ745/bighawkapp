// Replaces {{placeholder}} tokens in email subjects/bodies. Unknown tokens are left blank.
export type TemplateVars = Partial<Record<string, string>>;

export function renderTemplate(text: string, vars: TemplateVars) {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, key: string) => vars[key.toLowerCase()] ?? "");
}
