import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

@Schema({ timestamps: true, collection: 'users' })
export class User {
  @Prop({ default: 'link' }) provider?: string
  @Prop({ unique: true, sparse: true }) email?: string
  @Prop() displayName?: string
  @Prop({ type: [String], default: ['viewer'] }) roles?: string[]
  @Prop({ default: true }) isActive?: boolean
  @Prop() lastLoginAt?: Date
  @Prop({ default: 0 }) loginCount?: number
  @Prop() lastLoginIp?: string
  @Prop() lastUserAgent?: string
}

export type UserDocument = User & Document
export const UserSchema = SchemaFactory.createForClass(User)
