import {
  S3Client,
  ListBucketsCommand,
  ListObjectsCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { FileUpload } from "api";
import mime from 'mime'
import NoteTemplate, { generateFullyHtml } from "NoteTemplate";

export default class S3API {
  private client: S3Client;
  private bucket: string;

  constructor(endpoint: string, bucket: string, accessKeyId: string, secretAccessKey: string, region?: string) {
    // console.log('[S3API] Initializing S3 API', endpoint, bucket, accessKeyId, secretAccessKey);
    this.bucket = bucket;
    this.client = new S3Client({
      region: region || "auto",
      endpoint: endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },

    });
  }

  async listBuckets() {
    return await this.client.send(new ListBucketsCommand({}));
  }

  async #deleteObject(key: string) {
    console.log('[S3API][Delete Object]', key);
    return await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async #deleteDirectory(prefix: string) {
    let objectResponse = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix }));
    objectResponse.Contents?.forEach(async (object) => {
      await this.#deleteObject(object.Key as string);
    });
  }

  async #listObjects() {
    return await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket }));
  }

  async #getObject(key: string) {
    return await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async #putObject(key: string, body: string) {
    return await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body }));
  }


  #getMimeType(fileExt: string) {
    return mime.getType(fileExt) as string;
  }

  #getFilePath(data: FileUpload) {
    if (data.themeAsset) {
      return `assets/${data.themeName ? data.themeName : data.hash}.${data.filetype}`;
    }
    else {
      // note attachments
      return `notes/${data.noteId}/attachs/${data.hash}.${data.filetype}`;
    }
  }

  async #uploadFile(filePath: string, body: any, metadata: any, mimeType?: string) {
    return this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: filePath,
      Body: body,
      ContentType: mimeType ? mimeType : this.#getMimeType(filePath),
      Metadata: metadata
    }));

  }

  async objectExists(data: FileUpload) {
    try {
      const key = this.#getFilePath(data);
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return key;
    } catch (e) {
      return null;
    }
  }

  async uploadThemeAssets(data: FileUpload) {
    const filePath = this.#getFilePath(data);
    console.log('[S3API][Upload Theme Assets]' + filePath);
    try {
      const res = await this.#uploadFile(filePath, data.content, { hash: data.hash });
      if (res.$metadata.httpStatusCode !== 200) {
        return {
          success: false,
          error: res
        }
      }
      return {
        success: true,
        url: filePath
      }
    } catch (error) {
      console.error('[S3API] Error uploading theme assets', error);
      return {
        success: false,
        error: error
      }
    }

  }
  async uploadNoteAttachment(data: FileUpload) {
    const filePath = this.#getFilePath(data);
    console.log('[S3API][uploadNoteAttachment]' + filePath);
    try {
      const res = await this.#uploadFile(filePath, data.content, { hash: data.hash });
      if (res.$metadata.httpStatusCode !== 200) {
        return {
          success: false,
          error: res
        }
      }
      return {
        success: true,
        url: filePath
      }
    } catch (error) {
      console.error('[S3API] Error uploading theme assets', error);
      return {
        success: false,
        error: error
      }
    }
  }

  async uploadNote(note: NoteTemplate) {

    const filePath = `notes/${note.filename}.html`;
    console.log('[S3API][Upload Note]' + filePath);
    try {
      const res = await this.#uploadFile(filePath, generateFullyHtml(note), { hash: note.filename });
      if (res.$metadata.httpStatusCode !== 200) {
        return {
          success: false,
          error: res
        }
      }
      return {
        success: true,
        url: filePath
      }
    } catch (error) {
      console.error('[S3API] Error uploading theme assets', error);
      return {
        success: false,
        error: error
      }
    }
  }

  async deleteNote(noteShareId: string) {
    await this.#deleteDirectory(`notes/${noteShareId}/attachs`);
    await this.#deleteObject(`notes/${noteShareId}.html`);
  }

  async putObjectTest() {
    return await this.#uploadFile("TEST", "TEST", { hash: "TEST" });
  }


}
