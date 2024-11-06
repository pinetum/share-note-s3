import { requestUrl } from 'obsidian'
import SharePlugin from './main'
import StatusMessage, { StatusType } from './StatusMessage'
import { sha1, sha256 } from './crypto'
import NoteTemplate from './NoteTemplate'
import { SharedUrl } from './note'
import { compressImage } from './Compressor'
import S3API from 's3API'
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

  async post(endpoint: string, data?: PostData, retries = 1) {
    console.log('POST', endpoint, data)
    // const headers: HeadersInit = {
    //   ...(await this.authHeaders()),
    //   'Content-Type': 'application/json'
    // }
    // if (data?.byteLength) headers['x-sharenote-bytelength'] = data.byteLength.toString()
    // const body = Object.assign({}, data)
    // if (this.plugin.settings.debug) body.debug = this.plugin.settings.debug

    // // Upload the data
    // while (retries > 0) {
    //   try {
    //     const res = await requestUrl({
    //       url: this.plugin.settings.server + endpoint,
    //       method: 'POST',
    //       headers,
    //       body: JSON.stringify(body)
    //     })
    //     if (this.plugin.settings.debug === 1 && data?.filetype === 'html') {
    //       // Debugging option
    //       console.log(res.json.html)
    //     }
    //     return res.json
    //   } catch (error) {
    //     if (error.status < 500 || retries <= 1) {
    //       const message = error.headers?.message
    //       if (message) {
    //         if (error.status === 462) {
    //           // Invalid API key, request a new one
    //           this.plugin.authRedirect('share').then()
    //         } else {
    //           new StatusMessage(message, StatusType.Error)
    //         }
    //         throw new Error('Known error')
    //       }
    //       throw new Error('Unknown error')
    //     } else {
    //       // Delay before attempting to retry upload
    //       await new Promise(resolve => setTimeout(resolve, 1000))
    //     }
    //   }
    //   console.log('Retrying ' + retries)
    //   retries--
    // }
  }

  async postRaw(data: FileUpload, retries = 4) {
    const s3API = new S3API(this.plugin.settings.s3URL, this.plugin.settings.bucket, this.plugin.settings.s3AccessId, this.plugin.settings.s3AccessKey)
    const headers: HeadersInit = {
      // ...(await this.authHeaders()),
      'x-sharenote-filetype': data.filetype,
      'x-sharenote-hash': data.hash
    }
    while (retries > 0) {
      let s3Result = null;
      if (data.byteLength) headers['x-sharenote-bytelength'] = data.byteLength.toString()
      if (data.themeAsset) {
        s3Result = await s3API.uploadThemeAssets(data)
      }
      else if (data.noteAttachment) {
        s3Result = await s3API.uploadNoteAttachment(data)
      } else {
        s3Result = await s3API.uploadNote(data)
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
    // const res = await s3API.uploadFile(data.hash, data.content, { filetype: data.filetype }, data.filetype)
    // return { url: 'https://dummy.com/123jk' }
    // while (retries > 0) {
    // const res = await s3API.uploadFile(data.hash, data.content, { filetype: data.filetype }, data.filetype)
    // const res = await fetch(this.plugin.settings.server + endpoint, {
    //   method: 'POST',
    //   headers,
    //   body: data.content
    // })
    // if (res.status !== 200) {
    //   if (res.status < 500 || retries <= 1) {
    //     const message = await res.text()
    //     if (message) {
    //       new StatusMessage(message, StatusType.Error)
    //       throw new Error('Known error')
    //     }
    //     throw new Error('Unknown error')
    //   }
    //   // Delay before attempting to retry upload
    //   await new Promise(resolve => setTimeout(resolve, 1000))
    // } else {
    //   return res.json()
    // }
    // console.log(res)
    // return res;
    // console.log('Retrying ' + retries)
    // retries--
    // }
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
      files: [],
      css: {
        url: '',
        hash: ''
      }
    }
    // TODO: check s3 for existing files
    // Check with the server to find which files need to be updated
    // const res = await this.post('/v1/file/check-files', {
    //   files: this.uploadQueue.map(x => {
    //     return {
    //       hash: x.data.hash,
    //       filetype: x.data.filetype,
    //       byteLength: x.data.byteLength
    //     }
    //   })
    // }) as CheckFilesResult

    let count = 1
    const promises: Promise<void>[] = []
    for (const queueItem of this.uploadQueue) {
      // Get the result from check-files (if exists)
      // const checkFile = res?.files.find((item: FileUpload) => item.hash === queueItem.data.hash && item.filetype === queueItem.data.filetype)
      if (false) {
        // TOFO: check if file exists in s3
        // if (checkFile?.url) {
        // File is already uploaded, just process the callback
        // status.setStatus(`Uploading ${type} ${count++} of ${this.uploadQueue.length}...`)
        // queueItem.callback(checkFile.url)
      } else {
        // File needs to be uploaded
        promises.push(new Promise(resolve => {
          this.postRaw(queueItem.data)
            .then((res) => {
              // Process the callback
              status.setStatus(`Uploading ${type} ${count++} of ${this.uploadQueue.length}...`)
              console.log(`Uploading ${type} ${count++} of ${this.uploadQueue.length}..${res.url}`)
              queueItem.callback(res.url)
              resolve()
            })
            .catch((e) => {
              console.log(e)
              resolve()
            })
        }))
      }
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
    // const res = await this.post('/v1/file/create-note', {
    //   filename: template.filename,
    //   filetype: 'html',
    //   hash: await sha1(template.content),
    //   expiration,
    //   template
    // }, 3)
    // console.log('[createNote]', template)
    const s3API = new S3API(this.plugin.settings.s3URL, this.plugin.settings.bucket, this.plugin.settings.s3AccessId, this.plugin.settings.s3AccessKey)
    template.filename = noteShareId
    const { success, url } = await s3API.uploadNote(template)
    
    return new URL(url, this.plugin.settings.publicBaseURL).href
  }

  async deleteSharedNote(shareNoteId: string) {
    if (url) {
      const s3API = new S3API(this.plugin.settings.s3URL, this.plugin.settings.bucket, this.plugin.settings.s3AccessId, this.plugin.settings.s3AccessKey)
      await s3API.deleteNote(shareNoteId)
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
