import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

@Schema({ timestamps: true, collection: 'sessions' })
export class Session {
  @Prop({ unique: true, index: true }) sessionId?: string
  @Prop({ type: Types.ObjectId, ref: 'User', index: true }) userId?: Types.ObjectId
  @Prop({ index: true }) expiresAt?: Date
  @Prop() revokedAt?: Date
  @Prop() ip?: string
  @Prop() userAgent?: string
}

export type SessionDocument = Session & Document
export const SessionSchema = SchemaFactory.createForClass(Session)
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
