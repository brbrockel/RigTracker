import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'audit_logs' })
export class AuditLog {
  @Prop({ required: true }) action!: string; // CREATE | UPDATE | DELETE
  @Prop({ required: true }) resource!: string; // gear | rigs | people | events
  @Prop({ required: true }) resourceId!: string;
  @Prop() resourceName?: string;
  @Prop() userId?: string;
  @Prop() userEmail?: string;
  @Prop() userDisplayName?: string;
  @Prop({ type: Object }) details?: Record<string, any>;
}

export type AuditLogDocument = AuditLog & Document;
export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
