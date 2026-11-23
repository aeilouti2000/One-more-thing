import { DeleteObjectsCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { assertSafeKey, type Storage } from "./storage";

/** Files in an S3-compatible bucket (Cloudflare R2 in production). */
export class S3Storage implements Storage {
  private readonly client: S3Client;

  constructor(
    options: { endpoint: string; region: string; accessKeyId: string; secretAccessKey: string },
    private readonly bucket: string,
  ) {
    this.client = new S3Client({
      endpoint: options.endpoint,
      region: options.region,
      credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
    });
  }

  async put(key: string, body: Buffer, contentType: string) {
    assertSafeKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        // A new photo always gets a new key, so a file never changes.
        CacheControl: "private, max-age=31536000, immutable",
      }),
    );
  }

  async get(key: string) {
    assertSafeKey(key);
    const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return Buffer.from(await (response.Body as { transformToByteArray(): Promise<Uint8Array> }).transformToByteArray());
  }

  async delete(keys: string[]) {
    for (let start = 0; start < keys.length; start += 1000) {
      const batch = keys.slice(start, start + 1000);
      batch.forEach(assertSafeKey);
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
        }),
      );
    }
  }

  signedUrl(key: string, seconds: number) {
    assertSafeKey(key);
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: seconds });
  }
}
