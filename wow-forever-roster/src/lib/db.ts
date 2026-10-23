import dotenv from "dotenv";
import mongoose from "mongoose";

// Next.js ya carga .env.local; dotenv cubre scripts fuera de Next (seeds, etc.).
dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var mongooseCache: MongooseCache | undefined;
}

// Cache global para reutilizar la conexión entre recargas en desarrollo
// y entre invocaciones en entornos serverless.
const cache: MongooseCache = (globalThis.mongooseCache ??= {
  conn: null,
  promise: null,
});

export async function connectDB(): Promise<typeof mongoose> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "Falta la variable de entorno MONGODB_URI (defínela en .env.local)."
    );
  }

  if (cache.conn) return cache.conn;

  cache.promise ??= mongoose.connect(uri, { bufferCommands: false });

  try {
    cache.conn = await cache.promise;
  } catch (error) {
    cache.promise = null;
    throw error;
  }

  return cache.conn;
}

export default connectDB;
