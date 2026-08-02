/**
 * Atom 3.0+ pack decode (ported from Spunkram Beta `app.js`).
 * Pack body is split by sentinel markers, then decoded with a custom alphabet.
 */

/** First divider (Protection System Chars: PDRefractoring). */
export const PD_GLOBAL_SPLIT_ONE = "\\uYY029kXMO\\u008C\\uc99188JXUUSpcuKXK";

/** Second divider. */
export const PD_GLOBAL_SPLIT_TWO = "\\u00C2\\u199G18C\\ufm9bBGNb1jvoMc9zPWX";

/** Divider between hash and decode key in prebody. */
export const PD_GLOBAL_PREBODY_SPLIT =
  "\\u00F0EA\\u0vh4dORc195LA\\u00C0\\u008C\\u00C2";

/** Old Atom JSXBIN marker (pre Atom 3.0). */
export const OLD_ATOM_JSXBIN_PIECE = "@JSXBIN@ES@2.0@";

/**
 * Split prebody into [hash stamp, decode key].
 */
export function headEqualMaster(
  data: string,
  delimiter: string,
): [string, string] | undefined {
  if (!data || data.indexOf(delimiter) === -1) return undefined;
  const [hashStamp, keyAssx] = data.split(delimiter);
  if (hashStamp && keyAssx) return [hashStamp, keyAssx];
  return undefined;
}

/**
 * Custom alphabet decoder for pack body.
 */
export function assessor(data: string, key: string): string {
  const symbols = key;
  const specialTabArr = ["©", "®", "¬"]; // \t, \n, \r
  let past = "";
  for (let i = 0; i < data.length; i++) {
    let cur = data[i];
    if (
      cur === specialTabArr[0] ||
      cur === specialTabArr[1] ||
      cur === specialTabArr[2]
    ) {
      if (cur === specialTabArr[0]) cur = "\t";
      if (cur === specialTabArr[1]) cur = "\n";
      if (cur === specialTabArr[2]) cur = "\r";
    } else if (symbols.lastIndexOf(cur) !== -1) {
      const idx = symbols.lastIndexOf(cur);
      if (idx <= symbols.length) {
        cur = symbols[symbols.length - idx];
        if (!cur) cur = symbols[symbols.lastIndexOf(data[i])];
      }
    } else {
      cur = " ";
    }
    past += cur;
  }
  return past;
}

/**
 * Unpack Atom 3.0+ encrypted pack file contents.
 * @returns [hash, headerBytes, decodedJsonBody] or undefined
 */
export function pdRefractoring(
  getFileData: string,
): [string, string, string] | undefined {
  if (!getFileData) return undefined;
  const text = getFileData.toString();
  if (
    text.indexOf(PD_GLOBAL_SPLIT_ONE) === -1 ||
    text.indexOf(PD_GLOBAL_SPLIT_TWO) === -1
  ) {
    return undefined;
  }

  const splitBlockTwo0 = text.split(PD_GLOBAL_SPLIT_TWO)[0];
  const splitBlockTwo1 = text.split(PD_GLOBAL_SPLIT_TWO)[1];
  const splitBlockOne0 = splitBlockTwo0.split(PD_GLOBAL_SPLIT_ONE)[0];
  const splitBlockOne1 = splitBlockTwo0.split(PD_GLOBAL_SPLIT_ONE)[1];

  const prebodyHashAKey = headEqualMaster(
    splitBlockOne0,
    PD_GLOBAL_PREBODY_SPLIT,
  );
  if (!prebodyHashAKey) return undefined;

  const [hashStr, xKeyStr] = prebodyHashAKey;
  const unpackedBody = assessor(splitBlockTwo1, xKeyStr);
  return [hashStr, splitBlockOne1, unpackedBody];
}

export function isEncryptedAtomPack(content: string): boolean {
  return content.indexOf(PD_GLOBAL_SPLIT_ONE) !== -1;
}

export function isLegacyJsxbinPack(content: string): boolean {
  return content.indexOf(OLD_ATOM_JSXBIN_PIECE) !== -1;
}
