/**
 * Prints a single-use sign-in link (valid 72 hours) without sending anything.
 * For the first admin on a server, or if every admin is signed out:
 *
 *   docker exec $(docker ps -qf name=rigtracker_rigtracker) node dist/scripts/sign-in-link.js you@example.com
 *   docker exec $(docker ps -qf name=rigtracker_rigtracker) node dist/scripts/sign-in-link.js you@example.com --admin "Your Name"
 *
 * --admin makes the person with that email an admin, creating them if there's no one with it yet.
 * Links use APP_URL (e.g. https://rigtracker.bhbslp.org); the database is DATABASE_URL(_FILE).
 */
import { eq, sql } from 'drizzle-orm';
import { loadConfig } from '../config.js';
import { createDb, createPool } from '../db/db.js';
import { auditLog, people, signInLinks } from '../db/schema.js';
import { SIGN_IN_LINK_TTL_MS, hashToken, newToken, signInLinkUrl } from '../auth/tokens.js';

async function main() {
  const args = process.argv.slice(2);
  const adminIdx = args.indexOf('--admin');
  const makeAdmin = adminIdx !== -1;
  const nameArg = args[adminIdx + 1];
  const fullName = makeAdmin && nameArg && !nameArg.startsWith('--') ? nameArg.trim() : undefined;
  const email = (args[0] || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Usage: sign-in-link <email> [--admin "Name"]');
    process.exit(1);
  }
  const appUrl = process.env.APP_URL?.trim();
  if (!appUrl) {
    console.error(
      'Set APP_URL (e.g. https://rigtracker.bhbslp.org) so the link points at the right site.',
    );
    process.exit(1);
  }

  const pool = createPool(loadConfig().DATABASE_URL);
  const db = createDb(pool);
  try {
    const matches = await db
      .select()
      .from(people)
      .where(sql`lower(${people.email}) = ${email}`);
    if (matches.length > 1) {
      const withAccess = matches.filter((p) => p.role);
      if (withAccess.length !== 1) {
        console.error(
          `${matches.length} people have the email ${email}. Fix that on People first.`,
        );
        process.exitCode = 1;
        return;
      }
    }
    let user = matches.find((p) => p.role) ?? matches[0];
    if (!user && !makeAdmin) {
      console.error(
        `No one has the email ${email}. Give them sign-in access on People, or run again with --admin.`,
      );
      process.exitCode = 1;
      return;
    }
    if (!user) {
      const [firstName, ...rest] = (fullName || email.split('@')[0]!).split(/\s+/);
      [user] = await db
        .insert(people)
        .values({
          firstName: firstName ?? null,
          lastName: rest.join(' ') || null,
          email,
          role: 'admin',
          isActive: true,
        })
        .returning();
      console.log(
        `Added ${[user!.firstName, user!.lastName].filter(Boolean).join(' ')} to People as an admin`,
      );
    } else if (makeAdmin && (user.role !== 'admin' || !user.isActive)) {
      [user] = await db
        .update(people)
        .set({ role: 'admin', isActive: true })
        .where(eq(people.id, user.id))
        .returning();
      console.log(`${email} is now an admin`);
    }
    if (!user!.role) {
      console.error(
        `${email} has no sign-in access. Give it on People, or run again with --admin.`,
      );
      process.exitCode = 1;
      return;
    }
    if (!user!.isActive) {
      console.error(`${email} has sign-in turned off.`);
      process.exitCode = 1;
      return;
    }

    const token = newToken();
    const expiresAt = new Date(Date.now() + SIGN_IN_LINK_TTL_MS);
    await db
      .insert(signInLinks)
      .values({ tokenHash: hashToken(token), personId: user!.id, expiresAt });
    await db.insert(auditLog).values({
      action: 'SIGN_IN_LINK',
      resource: 'people',
      resourceId: user!.id,
      resourceName: email,
      details: { via: 'command line' },
    });
    console.log(
      `Sign-in link for ${email} (single use, expires ${expiresAt.toISOString()}):\n${signInLinkUrl(appUrl, token)}`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
