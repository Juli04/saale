/**
 * Keep a workspace's GitHub credential from expiring in the dark.
 *
 * The file at `.saale/github.json` is what git's helper and the `gh` shim read
 * for a command Saale did not start — a terminal, or the agent's own shell. It
 * used to be written only when the source was applied, which is rare, and only
 * when a command happened to come through Saale. A workspace could therefore
 * carry a dead token for days, and the first command to use it read GitHub's
 * `401` as a broken server.
 *
 * So the file is refreshed on a timer, well before the token it holds runs out.
 * Nothing inside the sandbox can do that itself: it has no route to Saale and no
 * app credentials, and it should keep neither.
 */

import { prisma } from "@/lib/db";
import { readGithubUserAccess } from "./github-app";
import { readStoredGithubSource, syncGithubCredential } from "./github-credentials";

/** How often the sweep looks. */
const SWEEP_INTERVAL_MS = 5 * 60_000;

/** A token this close to its end is replaced now, not next time. */
const REFRESH_WITHIN_MS = 90 * 60_000;

/** The boot pass waits for the rest of the stack, like the other startup work. */
const BOOT_DELAY_MS = 15_000;

/**
 * One pass over the accounts whose token is about to run out.
 *
 * `now` is a parameter so a test can stand at a chosen moment; nothing here
 * depends on the wall clock otherwise.
 */
export async function runGithubCredentialSweep(now: Date = new Date()): Promise<void> {
  const due = await prisma.githubUserToken
    .findMany({
      where: { accessExpiresAt: { lt: new Date(now.getTime() + REFRESH_WITHIN_MS) } },
      select: { userId: true },
    })
    .catch((err: unknown) => {
      console.error("Failed to read the GitHub tokens that are about to expire:", err);
      return [];
    });

  for (const { userId } of due) {
    // A workspace whose source is the CLI carries no file on purpose. Writing one
    // would hand it a credential the account did not choose.
    if ((await readStoredGithubSource(userId)) !== "app") continue;

    // Reads the row and refreshes it, because this is exactly the window the
    // refresh is for.
    const access = await readGithubUserAccess(userId, { refreshWithinMs: REFRESH_WITHIN_MS }).catch(
      (err: unknown) => {
        console.error(`Failed to refresh the GitHub token of ${userId}:`, err);
        return null;
      },
    );
    if (!access) continue;

    // A write that fails is worth a line and nothing else: the next pass retries,
    // and the token is still good for a while.
    await syncGithubCredential(userId, access).catch((err: unknown) => {
      console.error(`Failed to write the GitHub credential of ${userId}:`, err);
    });
  }
}

/**
 * Run the sweep on a timer, and once shortly after boot.
 *
 * The boot pass is what a restart needs: the files on the volume are as old as
 * the time the process was down, and nothing else would look at them.
 */
export function startGithubCredentialSweep(): void {
  const boot = setTimeout(() => void runGithubCredentialSweep(), BOOT_DELAY_MS);
  // A sweep is never a reason for the process to stay up.
  boot.unref();
  const timer = setInterval(() => void runGithubCredentialSweep(), SWEEP_INTERVAL_MS);
  timer.unref();
}
