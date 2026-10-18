/**
 * One-off: sign-in accounts used to live in `users`, separate from `people`. This gives each
 * account's person record the sign-in fields, so a person and a login are one record.
 *
 *   docker exec $(docker ps -qf name=rigtracker_rigtracker) node dist/scripts/merge-users-into-people.js           # report only
 *   docker exec $(docker ps -qf name=rigtracker_rigtracker) node dist/scripts/merge-users-into-people.js --apply   # do it
 *
 * Each account is matched to a person by email, then by full name, then by a unique first
 * name with no last name; otherwise a person is added. Sessions, sign-in links and audit
 * entries are re-pointed at the person. `users` is then renamed to `users_merged` (kept as a
 * backup). Safe to run again: accounts already merged are skipped.
 */
import mongoose, { Types } from 'mongoose';
import { readSecret } from '../common/secrets';

const norm = (s?: string | null) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');

async function main() {
  const apply = process.argv.includes('--apply');
  await mongoose.connect(readSecret('MONGO_URI') || 'mongodb://localhost:27017/rigtracker');
  const db = mongoose.connection.db!;
  try {
    const names = (await db.listCollections().toArray()).map((c) => c.name);
    if (!names.includes('users')) {
      console.log(
        names.includes('users_merged')
          ? 'Already merged (users_merged exists).'
          : 'No users collection.',
      );
      return;
    }
    const users = await db.collection('users').find().toArray();
    const people = db.collection('people');
    const all = await people.find().toArray();
    const plan: { user: any; person: any | null; how: string }[] = [];

    for (const u of users) {
      const email = norm(u.email);
      const display = norm(u.displayName);
      const already = all.find((p) => p.legacyUserId === String(u._id));
      if (already) {
        plan.push({ user: u, person: already, how: 'already merged' });
        continue;
      }
      let match = email ? all.filter((p) => norm(p.email) === email) : [];
      let how = 'email';
      if (match.length !== 1 && display) {
        match = all.filter(
          (p) => norm([p.firstName, p.lastName].filter(Boolean).join(' ')) === display,
        );
        how = 'full name';
      }
      if (match.length !== 1 && display && !display.includes(' ')) {
        match = all.filter((p) => norm(p.firstName) === display && !norm(p.lastName));
        how = 'first name';
      }
      if (match.length === 1 && match[0]!.roles?.length) {
        throw new Error(
          `${u.email}: matched person ${match[0]!._id} already has sign-in access; fix by hand`,
        );
      }
      plan.push({
        user: u,
        person: match.length === 1 ? match[0] : null,
        how: match.length === 1 ? how : 'new person',
      });
    }

    for (const { user: u, person: p, how } of plan) {
      const target = p
        ? `${[p.firstName, p.lastName].filter(Boolean).join(' ')} (${p._id})`
        : 'a new person';
      console.log(`${u.email} [${(u.roles || []).join(',')}] -> ${target}, by ${how}`);
    }
    if (!apply) {
      console.log('\nReport only. Run again with --apply to merge.');
      return;
    }

    for (const { user: u, person: p, how } of plan) {
      if (how === 'already merged') continue;
      const access = {
        email: norm(u.email),
        roles: Array.isArray(u.roles) && u.roles.length ? u.roles : ['user'],
        isActive: u.isActive !== false,
        lastLoginAt: u.lastLoginAt,
        loginCount: u.loginCount || 0,
        lastLoginIp: u.lastLoginIp,
        lastUserAgent: u.lastUserAgent,
        legacyUserId: String(u._id),
      };
      let personId: Types.ObjectId;
      if (p) {
        await people.updateOne({ _id: p._id }, { $set: access });
        personId = p._id;
      } else {
        const [firstName, ...rest] = String(u.displayName || u.email.split('@')[0])
          .trim()
          .split(/\s+/);
        const res = await people.insertOne({
          firstName,
          lastName: rest.join(' ') || undefined,
          address: {},
          emergencyContacts: [],
          customFields: {},
          ...access,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        personId = res.insertedId;
      }
      const s = await db
        .collection('sessions')
        .updateMany({ userId: u._id }, { $set: { userId: personId } });
      const l = await db
        .collection('sign_in_links')
        .updateMany({ userId: u._id }, { $set: { userId: personId } });
      const a1 = await db
        .collection('audit_logs')
        .updateMany({ userId: String(u._id) }, { $set: { userId: String(personId) } });
      const a2 = await db
        .collection('audit_logs')
        .updateMany(
          { resource: 'user', resourceId: String(u._id) },
          { $set: { resource: 'people', resourceId: String(personId) } },
        );
      console.log(
        `merged ${u.email}: ${s.modifiedCount} sessions, ${l.modifiedCount} links, ${a1.modifiedCount + a2.modifiedCount} audit entries`,
      );
    }
    await db.collection('users').rename('users_merged');
    await db.collection('audit_logs').insertOne({
      action: 'UPDATE',
      resource: 'people',
      resourceId: 'all',
      resourceName: 'Sign-in accounts merged into People',
      details: { accounts: plan.length, via: 'command line' },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log('Done. The old accounts are kept in users_merged.');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
