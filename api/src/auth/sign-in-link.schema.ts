import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/** A single-use sign-in link. Only the SHA-256 hash of its token is stored. */
@Schema({ timestamps: true, collection: 'sign_in_links' })
export class SignInLink {
  @Prop({ required: true, unique: true }) tokenHash!: string;
  @Prop({ type: Types.ObjectId, ref: 'Person', required: true, index: true })
  userId!: Types.ObjectId;
  @Prop({ required: true }) expiresAt!: Date;
  @Prop() usedAt?: Date;
  /** Admin who made it; empty when made with the command-line script. */
  @Prop() createdByEmail?: string;
}

export type SignInLinkDocument = SignInLink & Document;
export const SignInLinkSchema = SchemaFactory.createForClass(SignInLink);
SignInLinkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
