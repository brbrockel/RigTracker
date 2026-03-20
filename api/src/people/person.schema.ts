import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

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
}

export type PersonDocument = Person & Document
export const PersonSchema = SchemaFactory.createForClass(Person)
