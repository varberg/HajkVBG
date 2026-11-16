// Kept the same as Client, see plugins/AiChat/personalNumbers.ts
//
// An optional century, a date (YYMMDD, where a coordination number adds 60 to
// the day), an optional separator and four digits, with no digit right before or
// after. The date check keeps most other long numbers out. There's no checksum
// check, as a mistyped number should be masked too.
const PERSONAL_NUMBER =
  /(?<!\d)(?:19|20)?\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01]|6[1-9]|[78]\d|9[01])[-+ ]?\d{4}(?!\d)/g;

/**
 * @summary Replace the digits of Swedish personal and coordination numbers with
 * `x`, so that they never reach the model, such as `19791027-5934` to
 * `xxxxxxxx-xxxx`. The length stays the same.
 * @description Client masks them too, before they're sent. This is for
 * whatever calls the API without it. A phone number written without a dash,
 * such as `0701234567`, can be masked too, which is fine.
 */
export function maskPersonalNumbers(text: string): string {
  return text.replace(PERSONAL_NUMBER, (match) => match.replace(/\d/g, "x"));
}
