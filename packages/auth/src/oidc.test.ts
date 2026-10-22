// Behavioural checks for the OIDC claim mapping.
//
//   npx tsx packages/auth/src/oidc.test.ts
//
// Exit code is non-zero on failure.

import { claimToEmailVerified } from "./oidc.js";

// This package typechecks against the Workers runtime (no node types); the
// test script itself runs under tsx/node, so shim the one node global used.
declare const process: { exit(code: number): void };

let failures = 0;
let checks = 0;
function check(label: string, ok: boolean, detail?: unknown): void {
  checks++;
  if (ok) console.log(`ok    ${label}`);
  else {
    failures++;
    console.error(`FAIL  ${label}${detail !== undefined ? `\n      ${JSON.stringify(detail)}` : ""}`);
  }
}

// ── claimToEmailVerified ────────────────────────────────────────────────
//
// Only an explicit negative assertion from the IdP may reject a sign-in.
// Absence is not an assertion: `email_verified` is optional in OIDC and
// some IdPs (Microsoft Entra ID among them) never send it.

check("boolean true → verified", claimToEmailVerified(true) === true);
check('string "true" → verified', claimToEmailVerified("true") === true);
check("absent (undefined) → verified", claimToEmailVerified(undefined) === true);
check("null → verified", claimToEmailVerified(null) === true);
check("boolean false → unverified", claimToEmailVerified(false) === false);
check('string "false" → unverified', claimToEmailVerified("false") === false);

// Nonconformant spellings are not explicit denials; they must not lock a
// directory's users out (that is the exact failure mode this mapping fixes).
check("numeric 1 → verified", claimToEmailVerified(1) === true);
check("unrecognised junk → verified", claimToEmailVerified("banana") === true);

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);
