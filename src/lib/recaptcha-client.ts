/**
 * Gets a reCAPTCHA token in the browser without ever blocking the form.
 *
 * `execute` is react-google-recaptcha-v3's executeRecaptcha. It is undefined until the Google script has loaded (or if it was
 * blocked) and it throws when the site key is wrong / not registered for this domain ("Invalid site key or not loaded in api.js").
 * In every such case we send an empty token and let the server decide: it accepts it where no secret is configured and answers
 * a clear "Bot check failed. Please try again." where one is. Without this, a bad key meant the request was never sent and the
 * user saw Google's technical message.
 */
export async function getRecaptchaToken(execute: ((action: string) => Promise<string>) | undefined, action: string, timeoutMs = 8000): Promise<string> {
  if (!execute) return '';
  try {
    return await Promise.race([
      execute(action),
      new Promise<string>((resolve) => setTimeout(() => resolve(''), timeoutMs)),
    ]);
  } catch {
    return '';
  }
}
