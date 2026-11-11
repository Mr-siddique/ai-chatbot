import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
    // AUTH-04: bcrypt hash only; never selected unless asked for explicitly.
    passwordHash: { type: String, required: true, select: false },
  },
  { timestamps: true },
);

/** Public shape from specs/SPEC.md: { id, name, email, createdAt }. */
export type PublicUser = { id: string; name: string; email: string; createdAt: string };

userSchema.set('toJSON', {
  transform: (_doc, ret: Record<string, unknown>) => toPublicUser(ret as unknown as UserFields),
});

type UserFields = InferSchemaType<typeof userSchema> & { _id: { toString(): string } };
export type UserDocument = HydratedDocument<InferSchemaType<typeof userSchema>>;

/** The only way a user leaves the server: no passwordHash, _id or __v. */
export function toPublicUser(user: UserFields): PublicUser {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    createdAt: new Date(user.createdAt).toISOString(),
  };
}

export const User = model('User', userSchema);
