import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

@Schema({ timestamps: true, collection: 'gear' })
export class Gear {
  @Prop({ unique: true, sparse: true }) serialNumber?: string
  @Prop() name?: string
  @Prop() type?: string
  @Prop() dateOfManufacture?: Date
  @Prop({ maxlength: 1000 }) notes?: string
  @Prop() imageUrl?: string
  @Prop() assignedRigId?: string
  @Prop() assignedPersonId?: string
}

export type GearDocument = Gear & Document
export const GearSchema = SchemaFactory.createForClass(Gear)
