import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'sessions' })
export class Session {
  /** SHA-256 hash of the session cookie's token; the token itself is never stored. */
  @Prop({ unique: true }) sessionId?: string;
  @Prop({ type: Types.ObjectId, ref: 'Person', index: true }) userId?: Types.ObjectId;
  @Prop() expiresAt?: Date;
  @Prop() revokedAt?: Date;
  /** Sent back in the x-csrf-token header with every change. */
  @Prop() csrfToken?: string;
  @Prop() ip?: string;
  @Prop() userAgent?: string;
}

export type SessionDocument = Session & Document;
export const SessionSchema = SchemaFactory.createForClass(Session);
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
