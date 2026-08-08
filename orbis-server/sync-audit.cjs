const { execSync } = require("child_process");
const path = require("path");
const rootPath = path.join(__dirname, "../");

let PrismaClient;
try {
  PrismaClient = require("../src/generated/prisma").PrismaClient;
} catch (e) {
  console.log(
    "⚠️ Prisma Client require path issue, skipping direct DB sync execution.",
  );
  process.exit(0);
}

const prisma = new PrismaClient();

async function syncLogs() {
  try {
    console.log("🔄 Syncing Git Commits with Postgres Audit Log Database...");

    // শেষ ২০টি কমিট নেওয়া
    const rawLog = execSync(
      `git log -n 20 --pretty=format:"COMMIT_START|%h|%s|%aI"`,
      { cwd: rootPath },
    ).toString();

    const blocks = rawLog.split("COMMIT_START|").filter(Boolean);

    for (const block of blocks) {
      const lines = block.trim().split("\n");
      const [hash, message, isoDate] = lines[0].split("|");
      if (!hash) continue;

      // ডাটাবেসে অলরেডি সেভ আছে কিনা দেখা
      const existing = await prisma.foundationAdminAuditLog.findFirst({
        where: { commitHash: hash },
      });

      if (!existing) {
        const filesRaw = execSync(`git show --name-only --format="" ${hash}`, {
          cwd: rootPath,
        }).toString();
        const changedFiles = filesRaw
          .split("\n")
          .map((f) => f.trim())
          .filter(Boolean);

        await prisma.foundationAdminAuditLog.create({
          data: {
            commitHash: hash,
            actionType: "GIT_PUSH",
            commitMessage: message || "Automated Commit",
            changedFiles: changedFiles,
            createdAt: isoDate ? new Date(isoDate) : new Date(),
          },
        });
        console.log(`✅ Synced Commit [${hash}] to Postgres DB`);
      }
    }
    console.log("🎉 Audit Log Sync Completed Successfully!");
  } catch (err) {
    console.error("❌ Audit Sync Error:", err.message);
  } finally {
    await prisma.$disconnect();
  }
}

syncLogs();
