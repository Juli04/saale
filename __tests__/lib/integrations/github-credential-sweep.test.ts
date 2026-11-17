import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Fakes: the rows, the refresh, and the file write ───────────────────────

const { db } = vi.hoisted(() => ({
  db: { githubUserToken: { findMany: vi.fn() } },
}));

vi.mock("@/lib/db", () => ({ prisma: db }));

const app = vi.hoisted(() => ({ readGithubUserAccess: vi.fn() }));
vi.mock("@/lib/integrations/github-app", () => app);

const credentials = vi.hoisted(() => ({
  readStoredGithubSource: vi.fn(),
  syncGithubCredential: vi.fn(),
}));
vi.mock("@/lib/integrations/github-credentials", () => credentials);

import { runGithubCredentialSweep } from "@/lib/integrations/github-credential-sweep";

// ─── Fixtures ───────────────────────────────────────────────────────────────

const NOW = new Date("2026-11-14T12:00:00Z");
const ACCESS = { accessToken: "ghu_fresh", login: "Juli04", expiresAt: new Date() };

beforeEach(() => {
  vi.clearAllMocks();
  db.githubUserToken.findMany.mockResolvedValue([]);
  credentials.readStoredGithubSource.mockResolvedValue("app");
  app.readGithubUserAccess.mockResolvedValue(ACCESS);
  credentials.syncGithubCredential.mockResolvedValue(undefined);
});

// ─── What the sweep looks at ────────────────────────────────────────────────

describe("runGithubCredentialSweep", () => {
  it("asks only for the tokens that run out inside its window", async () => {
    await runGithubCredentialSweep(NOW);

    const call = db.githubUserToken.findMany.mock.calls[0]?.[0] as {
      where: { accessExpiresAt: { lt: Date } };
    };
    // 90 minutes ahead of the moment it was given, not ahead of the wall clock:
    // a pass that refreshes everything would make a GitHub call per user.
    expect(call.where.accessExpiresAt.lt).toEqual(new Date(NOW.getTime() + 90 * 60_000));
  });

  it("refreshes the row and writes the file for an app workspace", async () => {
    db.githubUserToken.findMany.mockResolvedValue([{ userId: "user-1" }]);

    await runGithubCredentialSweep(NOW);

    // The window is what makes the refresh happen now rather than five minutes
    // before the token dies.
    expect(app.readGithubUserAccess).toHaveBeenCalledWith("user-1", {
      refreshWithinMs: 90 * 60_000,
    });
    expect(credentials.syncGithubCredential).toHaveBeenCalledWith("user-1", ACCESS);
  });

  it("leaves a workspace whose source is the CLI alone", async () => {
    db.githubUserToken.findMany.mockResolvedValue([{ userId: "user-1" }]);
    credentials.readStoredGithubSource.mockResolvedValue("cli");

    await runGithubCredentialSweep(NOW);

    // Writing the file would hand that workspace a credential it did not choose.
    expect(app.readGithubUserAccess).not.toHaveBeenCalled();
    expect(credentials.syncGithubCredential).not.toHaveBeenCalled();
  });

  it("writes nothing when GitHub refused the refresh", async () => {
    db.githubUserToken.findMany.mockResolvedValue([{ userId: "user-1" }]);
    app.readGithubUserAccess.mockResolvedValue(null);

    await runGithubCredentialSweep(NOW);

    expect(credentials.syncGithubCredential).not.toHaveBeenCalled();
  });

  it("keeps going when one account's write fails", async () => {
    db.githubUserToken.findMany.mockResolvedValue([{ userId: "user-1" }, { userId: "user-2" }]);
    credentials.syncGithubCredential
      .mockRejectedValueOnce(new Error("volume is read-only"))
      .mockResolvedValueOnce(undefined);

    await expect(runGithubCredentialSweep(NOW)).resolves.toBeUndefined();

    // The second account is not skipped because the first one's volume broke.
    expect(credentials.syncGithubCredential).toHaveBeenCalledTimes(2);
  });

  it("survives a query that fails, rather than ending the timer", async () => {
    db.githubUserToken.findMany.mockRejectedValue(new Error("database is down"));

    await expect(runGithubCredentialSweep(NOW)).resolves.toBeUndefined();
    expect(credentials.syncGithubCredential).not.toHaveBeenCalled();
  });
});
