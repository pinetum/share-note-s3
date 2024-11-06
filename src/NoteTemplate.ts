export interface ElementStyle {
  element: string
  classes: string[]
  style: string
}

export function getElementStyle(key: string, element: HTMLElement) {
  const elementStyle: ElementStyle = {
    element: key,
    classes: [],
    style: ''
  }
  try {
    elementStyle.classes = Array.from(element.classList)
    const style = element.style
    if (element.classList.contains('markdown-preview-pusher')) {
      // Remove the bottom margin from the pusher. This is the element which pushes items down the
      // page. It can cause issues with a large blank section appearing before the shared content.
      // For themes which use banners, they appear to use the margin-top attribute.
      style.removeProperty('margin-bottom')
    }
    elementStyle.style = style.cssText
  } catch (e) {
    console.error(e)
  }
  return elementStyle
}

export default class NoteTemplate {
  filename: string
  title: string
  description: string
  width: string
  elements: ElementStyle[] = []
  encrypted: boolean
  content: string
  mathJax: boolean
  themecss: string
}


export function generateFullyHtml(note: NoteTemplate) {
  // console.log('[NoteTemplate] Generating HTML for note ' + note.filename)
  let htmlContent = ''
  let bodyClasses = note.elements.find(e => e.element === 'body')?.classes.join(' ') || '';
  let encryptedContent = ''
  if (note.encrypted) encryptedContent = note.content
  else htmlContent = note.content
  const templateString = `<!DOCTYPE HTML>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${note.title}</title>
    <meta name="description" content="${note.description}">
    <meta property="og:title" content="${note.title}">
    <meta property="og:description" content="${note.description}">
    <link rel="icon" type="image/x-icon" href="/favicon.ico">
    <style>
        html,
        body {
            overflow: visible !important;
        }

        .view-content {
            height: 100% !important;
        }

        .status-bar {
            position: fixed !important;
        }
        .markdown-preview-sizer.markdown-preview-section { max-width: 800px !important; margin: 0 auto; }
        
    </style>
    <link rel="stylesheet" href="${note.themecss}">
    ${note.mathJax ? '<script async src="https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-chtml-full.js"></script>' : ''}
    <script>function initDocument () {
  /*
   * Callout fold/unfold
   */
  document.querySelectorAll('.callout.is-collapsible > .callout-title').forEach(titleEl => {
    // Add a listener on the title element
    titleEl.addEventListener('click', () => {
      const calloutEl = titleEl.parentElement
      // Toggle the collapsed class
      calloutEl.classList.toggle('is-collapsed')
      titleEl.querySelector('.callout-fold').classList.toggle('is-collapsed')
      // Show/hide the content
      calloutEl.querySelector('.callout-content').style.display = calloutEl.classList.contains('is-collapsed') ? 'none' : ''
    })
  })

  /*
   * Light/Dark theme toggle
   */
  const themeToggleEl = document.querySelector('#theme-mode-toggle')
  themeToggleEl.onclick = () => {
    document.body.classList.toggle('theme-dark')
    document.body.classList.toggle('theme-light')
  }
    JSON.parse(document.getElementById('element-styles').innerHTML).forEach((e)=>{
      const el = document.querySelector(e.element);
      if(el){
        el.setAttribute('class', e.classes.join(' '));
        el.setAttribute('style', e.style);
      }
      
    })
}</script>
    
</head>
<body class="${bodyClasses}">
<div class="app-container">
    <div class="horizontal-main-container">
        <div class="workspace">
            <div class="workspace-split mod-vertical mod-root">
                <div class="workspace-leaf mod-active">
                    <div class="workspace-leaf-content">
                        <div class="view-content">
                            <div class="markdown-reading-view" style="height:100%;width:100%;">
                                <div>
                                    <div class="markdown-preview-sizer markdown-preview-section">
                                        <div>
                                        ${htmlContent}
                                        </div>
                                        ${encryptedContent ? '<div id="template-user-data"></div>' : ''}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <div class="status-bar">
        <div class="status-bar-item">
            <span class="status-bar-item-segment"><a href="https://note.sx/" target="_blank">Share Note</a> for Obsidian</span>
            <span id="theme-mode-toggle" class="status-bar-item-segment">🌓</span>
        </div>
    </div>
</div>
<div id="encrypted-data" style="display: none">${encryptedContent}</div>
<div id="element-styles" style="display: none">${JSON.stringify(note.elements)}</div>
<script>
  /* Add/remove mobile classes depending on viewport size*/
  function toggleMobileClasses () {
    const mobileClasses = ['is-mobile', 'is-phone']
    if (window.innerWidth <= 768) {
      document.body.classList.add(...mobileClasses)
    } else {
      document.body.classList.remove(...mobileClasses)
    }
  }

  window.addEventListener('resize', toggleMobileClasses)
  toggleMobileClasses()

  function base64ToArrayBuffer (base64) {
    const binaryString = atob(base64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    return bytes.buffer
  }

  async function decryptString ({ ciphertext, iv }, secret) {
    const ivArr = iv ? base64ToArrayBuffer(iv) : new Uint8Array(1)
    const aesKey = await window.crypto.subtle.importKey('raw', base64ToArrayBuffer(secret), {
      name: 'AES-GCM',
      length: 256
    }, false, ['decrypt'])

    const plaintext = []
    for (let index = 0; index < ciphertext.length; index++) {
      const ciphertextChunk = ciphertext[index]
      if (!iv) ivArr[0] = index & 0xFF
      const ciphertextBuf = base64ToArrayBuffer(ciphertextChunk)
      const plaintextChunk = await window.crypto.subtle
        .decrypt({ name: 'AES-GCM', iv: ivArr }, aesKey, ciphertextBuf)
      plaintext.push(new TextDecoder().decode(plaintextChunk))
    }
    return plaintext.join('')
  }

  /*
   * Decrypt the original note content
   */
  const encryptedData = document.getElementById('encrypted-data').innerText.trim()
  const payload = encryptedData ? JSON.parse(encryptedData) : ''
  const secret = window.location.hash.slice(1) // Taken from the URL # parameter
  if (payload && secret) {
    decryptString({ ciphertext: payload.ciphertext, iv: payload.iv }, secret)
      .then(text => {
        // Inject the user's data
        const data = JSON.parse(text)
        const contentEl = document.getElementById('template-user-data')
        if (contentEl) contentEl.outerHTML = data.content
        document.title = data.basename
        initDocument()
      })
      .catch(() => {
        const contentEl = document.getElementById('template-user-data')
        if (contentEl) contentEl.innerHTML = 'Unable to decrypt using this key.'
      })
  } else {
    initDocument()
  }
</script>
</body>
</html>`;
  return templateString;
}