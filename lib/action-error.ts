/**
 * Turning a failed Server Action into something worth reading.
 *
 * `runAction` answers a validation failure with "Please check the highlighted fields." plus the
 * field messages. That headline is fine above a form whose fields light up, and useless in a dialog
 * that only has room for a sentence — so this returns the field messages themselves when there are
 * any, and the headline when there are not.
 *
 * Client-safe: no server imports, so dialogs and forms can both use it.
 */
export type ActionFailure = { error: string; fieldErrors?: Record<string, string[]> };

export function actionErrorLines(result: ActionFailure): string[] {
  const messages = Object.values(result.fieldErrors ?? {}).flat();
  const unique = [...new Set(messages.filter((message) => message.trim().length > 0))];
  return unique.length > 0 ? unique : [result.error];
}

/** The same thing as one sentence, for a toast. */
export function actionErrorText(result: ActionFailure): string {
  return actionErrorLines(result).join(" ");
}
