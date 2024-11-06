import { requestUrl } from 'obsidian'
import SharePlugin from './main'
import StatusMessage, { StatusType } from './StatusMessage'
import { sha1, sha256 } from './crypto'
import NoteTemplate from './NoteTemplate'
import { SharedUrl } from './note'
import { compressImage } from './Compressor'
import { url } from 'inspector'
import * as path from 'path'

const pluginVersion = require('../manifest.json').version

export interface FileUpload {
  filetype: string
  hash: string
  content?: ArrayBuffer | string
  byteLength: number
  expiration?: number
  url?: string | null
  themeAsset?: boolean
  noteAttachment?: boolean
  noteId?: string
  themeName?: string
}

export type PostData = {
  files?: FileUpload[]
  filename?: string
  filetype?: string
  hash?: string
  byteLength?: number
  expiration?: number
  template?: NoteTemplate
  debug?: number
}

export interface UploadQueueItem {
  data: FileUpload
  callback: (url: string) => void
}

export interface CheckFilesResult {
  success: boolean
  files: FileUpload[]
  css?: {
    url: string
    hash: string
  }
}

export default class API {
  plugin: SharePlugin
  uploadQueue: UploadQueueItem[]

  constructor(plugin: SharePlugin) {
    this.plugin = plugin
    this.uploadQueue = []
  }

  async authHeaders() {
    const nonce = Date.now().toString()
    return {

    }
  }

  async postRaw(data: FileUpload, retries = 4) {
    const headers: HeadersInit = {
      // ...(await this.authHeaders()),
      'x-sharenote-filetype': data.filetype,
      'x-sharenote-hash': data.hash
    }
    while (retries > 0) {
      let s3Result = null;
      if (data.byteLength) headers['x-sharenote-bytelength'] = data.byteLength.toString()
      if (data.themeAsset) {
        s3Result = await this.plugin.s3Api.uploadThemeAssets(data)
      }
      else { // attachments.
        s3Result = await this.plugin.s3Api.uploadNoteAttachment(data)
      }
      if (s3Result && s3Result.success && s3Result.url)

        return { url: new URL(s3Result.url, this.plugin.settings.publicBaseURL).href }
      if (s3Result && s3Result.success === false) {
        let message = "S3 upload failed, retry upload..." + s3Result.error
        new StatusMessage(message, StatusType.Error)
        throw new Error('Known error')
        // Delay before attempting to retry upload
        await new Promise(resolve => setTimeout(resolve, 1000))
      }

      retries--
    }
    throw new Error('Upload error')
  }

  async queueUpload(item: UploadQueueItem) {
    // Compress the data if possible
    if (item.data.content) {
      const compressed = await compressImage(item.data.content as ArrayBuffer, item.data.filetype)
      if (compressed.changed) {
        item.data.content = compressed.data
        item.data.filetype = compressed.filetype
        item.data.hash = await sha1(compressed.data)
      }
    }
    this.uploadQueue.push(item)
  }

  async processQueue(status: StatusMessage, type = 'attachment') {
    const res = {
      success: true,
      files: [] as string[]
    }
    let count = 1
    const promises: Promise<void>[] = []
    for (const queueItem of this.uploadQueue) {
      if (queueItem.data.noteAttachment) {
        // check if file exists in s3
        const url = await this.plugin.s3Api.objectExists(queueItem.data)
        if (url) {
          const fullUrl = new URL(url, this.plugin.settings.publicBaseURL).href
          res.files.push(fullUrl)
          queueItem.callback(fullUrl);
          continue;
        }
      }
      promises.push(new Promise(resolve => {
        this.postRaw(queueItem.data)
          .then((pres) => {
            // Process the callback
            status.setStatus(`Uploading ${type} ${count++} of ${this.uploadQueue.length}...`)
            // console.log(`Uploading ${type} ${count++} of ${this.uploadQueue.length}..${pres.url}`)
            queueItem.callback(pres.url)
            res.files.push(pres.url)
            resolve()
          })
          .catch((e) => {
            res.success = false
            console.error(e)
            resolve()
          })
      }))
    }
    await Promise.all(promises)
    this.uploadQueue = []
    return res
  }

  async upload(data: FileUpload) {
    const res = await this.postRaw(data)
    return res.url
  }

  async createNote(template: NoteTemplate, noteShareId: string, expiration?: number) {
    template.filename = noteShareId
    const { success, url } = await this.plugin.s3Api.uploadNote(template)
    if (success && url) {
      return new URL(url, this.plugin.settings.publicBaseURL).href
    } else {
      throw new Error('Failed to upload note')
    }

  }

  async deleteSharedNote(shareNoteId: string) {
    if (shareNoteId) {
      await this.plugin.s3Api.deleteNote(shareNoteId)
      new StatusMessage('The note has been deleted 🗑️', StatusType.Info)
    }
  }
}

export function parseExistingShareUrl(url: string): SharedUrl | false {
  const match = url.match(/(\w+)(#.+?|)$/)
  if (match) {
    return {
      filename: match[1],
      decryptionKey: match[2].slice(1) || '',
      url
    }
  }
  return false
}
