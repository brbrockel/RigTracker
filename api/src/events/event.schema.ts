import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'events' })
export class Event {
  @Prop() name?: string;
  @Prop() eventDate?: Date;
  @Prop() description?: string;
  @Prop() eventPhotoUrl?: string;
  @Prop({ type: [String], default: [] }) photoUrls?: string[];
}

export type EventDocument = Event & Document;
export const EventSchema = SchemaFactory.createForClass(Event);
