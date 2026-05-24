import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

@Schema({ timestamps: true })
export class Pack {
  @Prop({ unique: true, sparse: true }) serialNumber?: string
  @Prop() name?: string
  @Prop() containerType?: string
  @Prop() notes?: string
  @Prop() primaryUser?: string
  @Prop() number?: string
  @Prop() pastNaming?: string
  @Prop() containerSerialNumber?: string
  @Prop() containerDom?: Date
  @Prop() mainSize?: string
  @Prop() mainDom?: Date
  @Prop() mainSerialNumber?: string
  @Prop() reserveSize?: string
  @Prop() reserveDom?: Date
  @Prop() reserveSerialNumber?: string
  @Prop() lastPacked?: Date
  @Prop() riggerInt?: string
  @Prop() repackDue?: Date
  @Prop() aadType?: string
  @Prop() aadDom?: Date
  @Prop() aadSerialNumber?: string
}

export type PackDocument = Pack & Document
export const PackSchema = SchemaFactory.createForClass(Pack)