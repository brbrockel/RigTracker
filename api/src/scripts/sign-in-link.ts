/**
 * Prints a single-use sign-in link (valid 72 hours) without sending anything.
 * For the first admin on a server, or if every admin is signed out:
 *
 *   docker exec $(docker ps -qf name=rigtracker_rigtracker) node dist/scripts/sign-in-link.js you@example.com
 *   docker exec $(docker ps -qf name=rigtracker_rigtracker) node dist/scripts/sign-in-link.js you@example.com --admin "Your Name"
 *
 * --admin creates the account as an admin if it doesn't exist yet (or makes an existing one admin).
 * Links use APP_URL (e.g. https://rigtracker.bhbslp.org).
 */
import mongoose from 'mongoose'
import { readSecret } from '../common/secrets'
import { User, UserSchema } from '../auth/user.schema'
import { SignInLink, SignInLinkSchema } from '../auth/sign-in-link.schema'
import { AuditLog, AuditLogSchema } from '../audit/audit-log.schema'
import { SIGN_IN_LINK_TTL_MS, hashToken, newToken, signInLinkUrl } from '../auth/tokens'

async function main() {
  const args = process.argv.slice(2)
  const adminIdx = args.indexOf('--admin')
  const makeAdmin = adminIdx !== -1
  const displayName = makeAdmin && args[adminIdx + 1] && !args[adminIdx + 1].startsWith('--') ? args[adminIdx + 1].trim() : undefined
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
    const Users = mongoose.model(User.name, UserSchema)
    const Links = mongoose.model(SignInLink.name, SignInLinkSchema)
    const Audit = mongoose.model(AuditLog.name, AuditLogSchema)

    let user = await Users.findOne({ email })
    if (!user && !makeAdmin) {
      console.error(`No user ${email}. Add them on Settings, or run again with --admin to create an admin.`)
      process.exitCode = 1
      return
    }
    if (!user) {
      user = await Users.create({ provider: 'link', email, displayName, roles: ['admin'], isActive: true })
      console.log(`Created admin ${email}`)
    } else if (makeAdmin && !user.roles?.includes('admin')) {
      user.roles = ['admin']
      user.isActive = true
      await user.save()
      console.log(`${email} is now an admin`)
    }
    if (user.isActive === false) {
      console.error(`${email} is disabled.`)
      process.exitCode = 1
      return
    }

    const token = newToken()
    const expiresAt = new Date(Date.now() + SIGN_IN_LINK_TTL_MS)
    await Links.create({ tokenHash: hashToken(token), userId: user._id, expiresAt })
    await Audit.create({
      action: 'SIGN_IN_LINK',
      resource: 'user',
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
