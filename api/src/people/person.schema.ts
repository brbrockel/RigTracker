import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

/**
 * A club member. Anyone can also be given sign-in access: a role and a sign-in link sent to
 * their email address. People who never sign in have no roles.
 */
@Schema({ timestamps: true })
export class Person {
  @Prop() firstName?: string
  @Prop() middleName?: string
  @Prop() lastName?: string
  @Prop() email?: string
  @Prop() phone?: string
  @Prop({ type: Object, default: {} }) address?: { line1?: string; line2?: string; city?: string; state?: string; zip?: string }
  @Prop() dob?: Date
  @Prop({ type: Object, default: [] }) emergencyContacts?: Array<Record<string, any>>
  @Prop({ type: Object, default: {} }) customFields?: Record<string, any>

  // ── Sign-in (changed only through the auth module) ───────────────────────
  /** admin | user | viewer. Empty: can't sign in. */
  @Prop({ type: [String], default: [] }) roles?: string[]
  /** false: sign-in disabled without losing the role. */
  @Prop({ default: true }) isActive?: boolean
  @Prop() lastLoginAt?: Date
  @Prop({ default: 0 }) loginCount?: number
  @Prop({ select: false }) lastLoginIp?: string
  @Prop({ select: false }) lastUserAgent?: string
  /** The old users-collection id, kept after the merge so earlier audit entries can be traced. */
  @Prop({ select: false }) legacyUserId?: string
}

/** Fields an ordinary create or edit may set. Sign-in fields are left out on purpose. */
export const PERSON_PROFILE_FIELDS = [
  'firstName',
  'middleName',
  'lastName',
  'email',
  'phone',
  'address',
  'dob',
  'emergencyContacts',
  'customFields',
] as const

export type PersonDocument = Person & Document
export const PersonSchema = SchemaFactory.createForClass(Person)
PersonSchema.index({ email: 1 })
