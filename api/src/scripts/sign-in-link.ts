/**
 * Prints a single-use sign-in link (valid 72 hours) without sending anything.
 * For the first admin on a server, or if every admin is signed out:
 *
 *   docker exec $(docker ps -qf name=rigtracker_rigtracker) node dist/scripts/sign-in-link.js you@example.com
 *   docker exec $(docker ps -qf name=rigtracker_rigtracker) node dist/scripts/sign-in-link.js you@example.com --admin "Your Name"
 *
 * --admin makes the person with that email an admin, creating them if there's no one with it yet.
 * Links use APP_URL (e.g. https://rigtracker.bhbslp.org).
 */
import mongoose from 'mongoose'
import { readSecret } from '../common/secrets'
import { Person, PersonSchema } from '../people/person.schema'
import { SignInLink, SignInLinkSchema } from '../auth/sign-in-link.schema'
import { AuditLog, AuditLogSchema } from '../audit/audit-log.schema'
import { SIGN_IN_LINK_TTL_MS, hashToken, newToken, signInLinkUrl } from '../auth/tokens'

async function main() {
  const args = process.argv.slice(2)
  const adminIdx = args.indexOf('--admin')
  const makeAdmin = adminIdx !== -1
  const fullName = makeAdmin && args[adminIdx + 1] && !args[adminIdx + 1].startsWith('--') ? args[adminIdx + 1].trim() : undefined
  const email = (args[0] || '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Usage: sign-in-link <email> [--admin "Name"]')
    process.exit(1)
  }
  const appUrl = process.env.APP_URL?.trim()
  if (!appUrl) {
    console.error('Set APP_URL (e.g. https://rigtracker.bhbslp.org) so the link points at the right site.')
    process.exit(1)
  }

  await mongoose.connect(readSecret('MONGO_URI') || 'mongodb://localhost:27017/rigtracker')
  try {
    const People = mongoose.model(Person.name, PersonSchema)
    const Links = mongoose.model(SignInLink.name, SignInLinkSchema)
    const Audit = mongoose.model(AuditLog.name, AuditLogSchema)

    const matches = await People.find({ email })
    if (matches.length > 1) {
      const withAccess = matches.filter((p) => p.roles?.length)
      if (withAccess.length !== 1) {
        console.error(`${matches.length} people have the email ${email}. Fix that on People first.`)
        process.exitCode = 1
        return
      }
    }
    let user = matches.find((p) => p.roles?.length) ?? matches[0]
    if (!user && !makeAdmin) {
      console.error(`No one has the email ${email}. Give them sign-in access on People, or run again with --admin.`)
      process.exitCode = 1
      return
    }
    if (!user) {
      const [firstName, ...rest] = (fullName || email.split('@')[0]!).split(/\s+/)
      user = await People.create({ firstName, lastName: rest.join(' ') || undefined, email, roles: ['admin'], isActive: true })
      console.log(`Added ${[user.firstName, user.lastName].filter(Boolean).join(' ')} to People as an admin`)
    } else if (makeAdmin && (!user.roles?.includes('admin') || user.isActive === false)) {
      user.roles = ['admin']
      user.isActive = true
      await user.save()
      console.log(`${email} is now an admin`)
    }
    if (!user.roles?.length) {
      console.error(`${email} has no sign-in access. Give it on People, or run again with --admin.`)
      process.exitCode = 1
      return
    }
    if (user.isActive === false) {
      console.error(`${email} has sign-in turned off.`)
      process.exitCode = 1
      return
    }

    const token = newToken()
    const expiresAt = new Date(Date.now() + SIGN_IN_LINK_TTL_MS)
    await Links.create({ tokenHash: hashToken(token), userId: user._id, expiresAt })
    await Audit.create({
      action: 'SIGN_IN_LINK',
      resource: 'people',
      resourceId: String(user._id),
      resourceName: email,
      details: { via: 'command line' },
    })
    console.log(`Sign-in link for ${email} (single use, expires ${expiresAt.toISOString()}):\n${signInLinkUrl(appUrl, token)}`)
  } finally {
    await mongoose.disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
