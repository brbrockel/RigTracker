import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Rig {
  @Prop() name?: string;
  @Prop() number?: string;
  @Prop() container?: string;
  @Prop() containerSerialNumber?: string;
  @Prop() containerDOM?: Date;
  @Prop() mainSize?: string;
  @Prop() mainDOM?: Date;
  @Prop() mainSerialNumber?: string;
  @Prop() reserveSize?: string;
  @Prop() reserveDOM?: Date;
  @Prop() reserveSerialNumber?: string;
  @Prop() lastPacked?: Date;
  @Prop() riggerINT?: string;
  @Prop() repackDue?: Date;
  @Prop() aadType?: string;
  @Prop() aadDOM?: Date;
  @Prop() aadSerialNumber?: string;
  @Prop({ type: Object, default: {} }) customFields?: Record<string, any>;
  @Prop() primaryUserId?: string;
  @Prop() notes?: string;
  @Prop() imageUrl?: string;
}

export type RigDocument = Rig & Document;
export const RigSchema = SchemaFactory.createForClass(Rig);
