import mongoose, { Model, Schema, type InferSchemaType } from "mongoose";

const characterSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    class: { type: String, required: true, trim: true },
    role: { type: String, required: true, trim: true },
    ilvl: { type: Number, required: true, default: 0, min: 0 },
    missingEnchants: { type: [String], default: [] },
    missingGems: { type: [String], default: [] },
    attendanceCount: { type: Number, default: 0, min: 0 },
    lastUpdated: { type: Date, default: Date.now },
  },
  { collection: "characters" }
);

export type ICharacter = InferSchemaType<typeof characterSchema>;

const Character: Model<ICharacter> =
  (mongoose.models.Character as Model<ICharacter> | undefined) ??
  mongoose.model<ICharacter>("Character", characterSchema);

export default Character;
